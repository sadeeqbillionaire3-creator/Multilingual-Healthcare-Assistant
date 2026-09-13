import base64
import binascii
import io
import logging
import os
import time
import warnings
from collections import defaultdict
from threading import Lock

from flask import Flask, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix

from google import genai
from PIL import Image


SUPPORTED_LANGUAGES = ("en", "ha", "fr", "ar")
MAX_MESSAGE_LENGTH = 2_000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
RATE_LIMIT = 10
RATE_WINDOW_SECONDS = 60
MAX_TRACKED_IPS = 10_000

app = Flask(__name__)

# Set these values only when the deployment has exactly one trusted proxy hop.
app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=1,
    x_proto=1,
    x_host=1,
    x_port=1,
)
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# Reject oversized/decompression-bomb images rather than merely warning.
Image.MAX_IMAGE_PIXELS = 10_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
client = None

if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info("Gemini model %s initialized", MODEL_NAME)
    except Exception:
        logger.exception("Gemini client failed to initialize")
else:
    logger.error("GEMINI_API_KEY is not configured")


# This limiter is process-local. Use Redis or another shared store when
# running more than one worker or instance.
rate_limit_store = defaultdict(list)
rate_limit_lock = Lock()


def is_rate_limited(ip):
    now = time.monotonic()

    with rate_limit_lock:
        if ip not in rate_limit_store and len(rate_limit_store) >= MAX_TRACKED_IPS:
            oldest_ip = next(iter(rate_limit_store))
            del rate_limit_store[oldest_ip]

        timestamps = [
            timestamp
            for timestamp in rate_limit_store[ip]
            if now - timestamp < RATE_WINDOW_SECONDS
        ]

        if len(timestamps) >= RATE_LIMIT:
            rate_limit_store[ip] = timestamps
            return True

        timestamps.append(now)
        rate_limit_store[ip] = timestamps
        return False


def get_real_ip():
    # ProxyFix handles the trusted X-Forwarded-For header.
    # Do not read that header manually.
    return request.remote_addr or "unknown"


EMERGENCY_MSGS = {
    "en": "🚨 This sounds like an emergency. Please seek immediate medical care, go to the nearest hospital or call emergency services now.",
    "ha": "🚨 Wannan yana kama da gaggawa. Don Allah je asibiti mafi kusa nan da nan ko kira agajin gaggawa yanzu.",
    "fr": "🚨 Cela semble être une urgence. Allez à l'hôpital le plus proche ou appelez les urgences.",
    "ar": "🚨 يبدو أن هذه حالة طارئة. اذهب إلى أقرب مستشفى أو اتصل بخدمات الطوارئ.",
}

DISCLAIMERS = {
    "en": "⚠️ Disclaimer: This is not a medical diagnosis. Please consult a qualified doctor.",
    "ha": "⚠️ Gargadi: Wannan ba ganewar asibiti ba ne. Da fatan za a tuntubi likita mai lasisi.",
    "fr": "⚠️ Avertissement: Ceci n'est pas un diagnostic médical. Veuillez consulter un médecin qualifié.",
    "ar": "⚠️ إخلاء مسؤولية: هذا ليس تشخيصًا طبيًا. يرجى استشارة طبيب مؤهل.",
}

EMERGENCY_KEYWORDS = {
    "en": (
        "chest pain",
        "can't breathe",
        "cannot breathe",
        "difficulty breathing",
        "shortness of breath",
        "heavy bleeding",
        "unconscious",
        "stroke",
        "heart attack",
        "suicidal",
    ),
    "ha": (
        "ciwon kirji",
        "ba zan iya numfashi ba",
        "wahalar numfashi",
        "zubar jini mai yawa",
        "suma",
        "bugun jini",
    ),
    "fr": (
        "douleur thoracique",
        "ne peux pas respirer",
        "difficulté à respirer",
        "essoufflement",
        "saignement abondant",
        "inconscient",
        "avc",
        "crise cardiaque",
        "suicidaire",
    ),
    "ar": (
        "ألم في الصدر",
        "لا أستطيع التنفس",
        "صعوبة في التنفس",
        "ضيق التنفس",
        "نزيف حاد",
        "فقدان الوعي",
        "سكتة دماغية",
        "نوبة قلبية",
        "انتحار",
    ),
}

SYSTEM_PROMPT = """You are HealthCare Assistant.
Reply in the user's requested language: {lang}.
Provide general health information, basic self-care guidance, and when to seek professional care.
Never diagnose, prescribe medication, or claim certainty from an image.
If severe symptoms are described, clearly advise immediate emergency care.
End every reply with this exact disclaimer: {disclaimer}

User message:
{message}
"""


def check_emergency(text):
    normalized = " ".join(text.casefold().split())
    return any(
        keyword.casefold() in normalized
        for keywords in EMERGENCY_KEYWORDS.values()
        for keyword in keywords
    )


def validate_and_process_image(data_url):
    """Validate a JPG/PNG data URL and return a resized PIL image."""
    if not isinstance(data_url, str):
        return None, "Image must be a base64 string."

    try:
        if "," in data_url:
            header, encoded_data = data_url.split(",", 1)
            header_lower = header.lower()
            mime_type = header_lower[5:].split(";", 1)[0] if header_lower.startswith("data:") else ""

            if mime_type not in {"image/jpeg", "image/jpg", "image/png"}:
                return None, "Only JPG and PNG images are allowed."
        else:
            # Raw base64 is accepted for API clients without a data-URL header.
            encoded_data = data_url

        image_bytes = base64.b64decode(encoded_data, validate=True)
    except (binascii.Error, ValueError, TypeError):
        return None, "Invalid image encoding."

    if len(image_bytes) > MAX_IMAGE_BYTES:
        return None, "Image too large. Maximum size is 5MB."

    try:
        image_stream = io.BytesIO(image_bytes)
        image = Image.open(image_stream)
        image.verify()

        # verify() consumes the file; reopen it before processing.
        image_stream = io.BytesIO(image_bytes)
        image = Image.open(image_stream)

        if image.format not in {"JPEG", "PNG"}:
            return None, "Only JPG and PNG images are allowed."

        image.thumbnail((1024, 1024))
        image.load()
        return image, None
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        return None, "Image resolution is too high."
    except Exception:
        logger.warning("Image validation failed", exc_info=True)
        return None, "Invalid or corrupted image file."


@app.errorhandler(413)
def request_too_large(error):
    return jsonify({
        "reply": "Request too large. Maximum upload size is 6MB.",
    }), 413


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    client_ip = get_real_ip()

    if is_rate_limited(client_ip):
        return jsonify({
            "reply": "Too many requests. Please wait 1 minute.",
        }), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"reply": "Invalid JSON object."}), 400

    raw_message = data.get("message", "")
    language = data.get("lang", "en")
    image_data = data.get("image")

    if not isinstance(raw_message, str):
        return jsonify({"reply": "Message must be text."}), 400

    if not isinstance(language, str) or language not in SUPPORTED_LANGUAGES:
        return jsonify({
            "reply": "Unsupported language. Use en, ha, fr, or ar.",
        }), 400

    if image_data is not None and not isinstance(image_data, str):
        return jsonify({"reply": "Image must be a base64 string."}), 400

    message = raw_message.strip()
    image_data = image_data.strip() if image_data else None

    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({
            "reply": "Message too long. Maximum length is 2,000 characters.",
        }), 400

    if not message and not image_data:
        return jsonify({
            "reply": "Please describe your symptoms or upload an image.",
        }), 400

    if not GEMINI_API_KEY or client is None:
        logger.error("Gemini API key or client is not configured")
        return jsonify({
            "reply": "Service temporarily unavailable. Server is not configured.",
        }), 503

    pil_image = None
    if image_data:
        pil_image, image_error = validate_and_process_image(image_data)
        if image_error:
            return jsonify({"reply": image_error}), 400

    is_emergency = check_emergency(message)
    emergency_notice = EMERGENCY_MSGS[language] if is_emergency else ""
    disclaimer = DISCLAIMERS[language]

    prompt = SYSTEM_PROMPT.format(
        lang=language,
        disclaimer=disclaimer,
        message=message,
    )

    if emergency_notice:
        prompt = f"{emergency_notice}\n\n{prompt}"

    try:
        content = [prompt, pil_image] if pil_image is not None else prompt
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=content,
        )
        reply = getattr(response, "text", "").strip()

        if not reply:
            return jsonify({
                "reply": "The assistant could not generate a response.",
            }), 502

        if is_emergency and emergency_notice and not reply.startswith(emergency_notice):
            reply = f"{emergency_notice}\n\n{reply}"

        if disclaimer not in reply:
            reply = f"{reply}\n\n{disclaimer}"

        return jsonify({
            "reply": reply,
            "is_emergency": is_emergency,
        })
    except Exception:
        logger.exception("Gemini request failed")
        return jsonify({
            "reply": "Sorry, something went wrong. Please try again later.",
        }), 502


if __name__ == "__main__":
    is_debug = os.environ.get("FLASK_ENV") == "development"
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000")),
        debug=is_debug,
    )