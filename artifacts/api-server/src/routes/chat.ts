import { Router, type IRouter, type Request } from "express";
import { GoogleGenAI } from "@google/genai";
import {
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SUPPORTED_LANGUAGES = ["en", "ha", "fr", "ar"] as const;
const MAX_CONTENT_LENGTH = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;
const MAX_IMAGE_PIXELS = 10_000_000;

const emergencyMessages = {
  en: "This sounds like an emergency. Please seek immediate medical care, go to the nearest hospital, or call emergency services now.",
  ha: "Wannan yana kama da gaggawa. Don Allah je asibiti mafi kusa nan da nan ko kira agajin gaggawa yanzu.",
  fr: "Cela semble être une urgence. Allez à l'hôpital le plus proche ou appelez les urgences.",
  ar: "يبدو أن هذه حالة طارئة. اذهب إلى أقرب مستشفى أو اتصل بخدمات الطوارئ.",
} as const;

const disclaimers = {
  en: "Disclaimer: This is not a medical diagnosis. Please consult a qualified doctor.",
  ha: "Gargadi: Wannan ba ganewar asibiti ba ne. Da fatan za a tuntubi likita mai lasisi.",
  fr: "Avertissement: Ceci n'est pas un diagnostic médical. Veuillez consulter un médecin qualifié.",
  ar: "إخلاء مسؤولية: هذا ليس تشخيصًا طبيًا. يرجى استشارة طبيب مؤهل.",
} as const;

const emergencyKeywords = [
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
  "ciwon kirji",
  "ba zan iya numfashi ba",
  "wahalar numfashi",
  "zubar jini mai yawa",
  "suma",
  "bugun jini",
  "douleur thoracique",
  "ne peux pas respirer",
  "difficulté à respirer",
  "essoufflement",
  "saignement abondant",
  "inconscient",
  "avc",
  "crise cardiaque",
  "suicidaire",
  "ألم في الصدر",
  "لا أستطيع التنفس",
  "صعوبة في التنفس",
  "ضيق التنفس",
  "نزيف حاد",
  "فقدان الوعي",
  "سكتة دماغية",
  "نوبة قلبية",
  "انتحار",
];

const rateLimitStore = new Map<string, number[]>();

function getRealIp(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();

  if (!rateLimitStore.has(ip) && rateLimitStore.size >= MAX_TRACKED_IPS) {
    const oldestIp = rateLimitStore.keys().next().value;
    if (oldestIp) rateLimitStore.delete(oldestIp);
  }

  const recentRequests = (rateLimitStore.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT) {
    rateLimitStore.set(ip, recentRequests);
    return true;
  }

  recentRequests.push(now);
  rateLimitStore.set(ip, recentRequests);
  return false;
}

function checkEmergency(message: string) {
  const normalized = message.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return emergencyKeywords.some((keyword) =>
    normalized.includes(keyword.toLocaleLowerCase()),
  );
}

function decodeBase64Image(value: string) {
  let encoded = value;
  let mimeType: string | undefined;

  if (value.includes(",")) {
    const [header, body] = value.split(",", 2);
    encoded = body;
    if (header.toLowerCase().startsWith("data:")) {
      mimeType = header.slice(5).split(";", 1)[0].toLowerCase();
    }
  }

  if (mimeType && !["image/jpeg", "image/jpg", "image/png"].includes(mimeType)) {
    throw new Error("Only JPG and PNG images are allowed.");
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("Invalid image encoding.");
  }

  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Image too large. Maximum size is 5MB.");
  }

  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  if (!isPng && !isJpeg) {
    throw new Error("Invalid or corrupted JPG/PNG image.");
  }

  // The client sends the original image to Gemini. This conservative header
  // guard prevents obviously hostile dimensions before the provider call.
  if (isPng && bytes.length >= 24) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width * height > MAX_IMAGE_PIXELS) {
      throw new Error("Image resolution is too high.");
    }
  }

  if (isJpeg && bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Image too large. Maximum size is 5MB.");
  }

  return {
    base64: bytes.toString("base64"),
    mimeType: isPng ? "image/png" : "image/jpeg",
  };
}

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

router.post("/chat", async (request, response) => {
  const clientIp = getRealIp(request);

  if (isRateLimited(clientIp)) {
    response.status(429).json({
      error: "Too many requests. Please wait 1 minute.",
    });
    return;
  }

  const parsed = SendChatMessageBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid chat request." });
    return;
  }

  const { message, lang, image } = parsed.data;
  const client = getClient();

  if (!client) {
    response.status(503).json({
      error: "Service temporarily unavailable. Server is not configured.",
    });
    return;
  }

  let imagePart:
    | { inlineData: { data: string; mimeType: string } }
    | undefined;

  if (image) {
    try {
      const decoded = decodeBase64Image(image);
      imagePart = {
        inlineData: {
          data: decoded.base64,
          mimeType: decoded.mimeType,
        },
      };
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Invalid image file.",
      });
      return;
    }
  }

  const isEmergency = checkEmergency(message);
  const emergencyNotice = isEmergency ? emergencyMessages[lang] : "";
  const disclaimer = disclaimers[lang];
  const emergencyInstruction = emergencyNotice
    ? `Start the response with this exact emergency notice: ${emergencyNotice}`
    : "";
  const prompt = `You are HealthCare Assistant.
Reply in the requested language: ${lang}.
Provide general health information, basic self-care guidance, and when to seek professional care.
Never diagnose, prescribe medication, or claim certainty from an image.
${emergencyInstruction}
End every reply with this exact disclaimer: ${disclaimer}

User message:
${message}`;

  try {
    const contents = imagePart
      ? [{ text: prompt }, imagePart]
      : [{ text: prompt }];
    const result = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents,
    });

    let reply = result.text?.trim() ?? "";
    if (!reply) {
      response.status(502).json({ error: "The assistant returned no response." });
      return;
    }

    if (isEmergency && emergencyNotice && !reply.startsWith(emergencyNotice)) {
      reply = `${emergencyNotice}\n\n${reply}`;
    }

    if (!reply.includes(disclaimer)) {
      reply = `${reply}\n\n${disclaimer}`;
    }

    const output = SendChatMessageResponse.parse({
      reply,
      is_emergency: isEmergency,
    });
    response.json(output);
  } catch (error) {
    logger.error({ err: error }, "Gemini request failed");
    response.status(502).json({
      error: "Sorry, something went wrong. Please try again later.",
    });
  }
});

export default router;