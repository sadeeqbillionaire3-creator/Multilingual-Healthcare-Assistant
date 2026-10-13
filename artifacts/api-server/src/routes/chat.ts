// @ts-nocheck
import { logChat } from "../lib/analyticStore.js"
import { Router, type IRouter, type Request } from "express";
import { GoogleGenAI } from "@google/genai";
import {
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger.js"
import {
  generateWithGeminiRecovery,
  getGeminiFailureMetadata,
} from "../lib/gemini-recovery.js";

const router: IRouter = Router();

const SUPPORTED_LANGUAGES = ["en", "ha", "fr", "ar", "yo", "ig", "pcm"] as const;
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
  yo: "Eyi dabi pe pajawiri. Jọwọ lọ si ile-iwosan ti o sunmọ julọ tabi pe iranlọwọ pajawiri nisisiyi.",
  ig: "Nke a dị ka ihe mberede. Biko gaa ụlọ ọgwụ kacha nso ugbu a ma ọ bụ kpọọ ọrụ mberede.",
  pcm: "Dis one be like emergency. Abeg go nearest hospital now now or call emergency number.",
} as const;

const disclaimers = {
  en: "Disclaimer: This is not a medical diagnosis. Please consult a qualified doctor.",
  ha: "Gargadi: Wannan ba ganewar asibiti ba ne. Da fatan za a tuntubi likita mai lasisi.",
  fr: "Avertissement: Ceci n'est pas un diagnostic médical. Veuillez consulter un médecin qualifié.",
  ar: "إخلاء مسؤولية: هذا ليس تشخيصًا طبيًا. يرجى استشارة طبيب مؤهل.",
  yo: "Afiwera: Eyi kii ṣe ayẹwo iwosan. Jọwọ kan si dokita to peye.",
  ig: "Nkwuputa: Nke a abụghị nchọpụta ahụike. Biko gakwuru dọkịta ruru eru.",
  pcm: "Disclaimer: Dis no be doctor diagnosis. Abeg go meet better doctor.",
} as const;

const fallbackReplies: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  en: "I couldn't prepare a response right now. Please try again shortly.",
  ha: "Ba zan iya shirya amsa a yanzu ba. Da fatan za a sake gwadawa nan ba da jimawa ba.",
  fr: "Je ne peux pas préparer de réponse pour le moment. Veuillez réessayer dans quelques instants.",
  ar: "تعذّر عليّ إعداد رد الآن. يُرجى المحاولة مرة أخرى بعد قليل.",
  yo: "Mi ò lè pèsè ìdáhùn báyìí. Jọ̀wọ́ tún gbìyànjú lẹ́yìn díẹ̀.",
  ig: "Enweghị m ike ịkwadebe azịza ugbu a. Biko nwaa ọzọ n'oge na-adịghị anya.",
  pcm: "I no fit prepare answer right now. Abeg try again shortly.",
};

const busyReplies: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  en: "The assistant is very busy right now. Please try again later.",
  ha: "Mataimaki yana da aiki sosai a yanzu. Don Allah a sake gwadawa daga baya.",
  fr: "L’assistant est très occupé pour le moment. Veuillez réessayer plus tard.",
  ar: "المساعد مشغول جدًا الآن. يُرجى المحاولة مرة أخرى لاحقًا.",
  yo: "Olùrànlọ́wọ́ ti dí púpọ̀ báyìí. Jọ̀wọ́ tún gbìyànjú lẹ́yìn náà.",
  ig: "Onye enyemaka ji ọrụ nke ukwuu ugbu a. Biko nwaa ọzọ ma emechaa.",
  pcm: "Assistant dey very busy right now. Abeg try again later.",
};

function createFailureReply(
  language: (typeof SUPPORTED_LANGUAGES)[number],
  isEmergency: boolean,
  isQuotaFailure: boolean,
) {
  if (isEmergency) {
    return `${emergencyMessages[language]}\n\n${disclaimers[language]}`;
  }

  const message = isQuotaFailure
    ? busyReplies[language]
    : fallbackReplies[language];
  return `${message}\n\n${disclaimers[language]}`;
}

const emergencyKeywords = [
  // English
  "chest pain","can't breathe","cannot breathe","difficulty breathing","shortness of breath","heavy bleeding","unconscious","stroke","heart attack","suicidal",
  // Hausa
  "ciwon kirji","ba zan iya numfashi ba","wahalar numfashi","zubar jini mai yawa","suma","bugun jini",
  // French
  "douleur thoracique","ne peux pas respirer","difficulté à respirer","essoufflement","saignement abondant","inconscient","avc","crise cardiaque","suicidaire",
  // Arabic
  "ألم في الصدر","لا أستطيع التنفس","صعوبة في التنفس","ضيق التنفس","نزيف حاد","فقدان الوعي","سكتة دماغية","نوبة قلبية","انتحار",
  // Yoruba
  "irora aya","mi o le mi","ira mi nira","eje nla","aisan ọpọlọ","daku","ijakadi aya",
  // Igbo
  "mgbu obi","enweghi ike iku ume","ike iku ume","ọbara ọgbụgba","amaghị ihe","ọrịa strok","nkụchi obi",
  // Pidgin
  "chest dey pain","i no fit breathe","blood dey rush","i dey faint","stroke","heart attack dey do me",
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
  const recentRequests = (rateLimitStore.get(ip)?? []).filter((t) => now - t < RATE_WINDOW_MS);
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
  return emergencyKeywords.some((k) => normalized.includes(k.toLocaleLowerCase()));
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
  if (mimeType &&!["image/jpeg", "image/jpg", "image/png"].includes(mimeType)) throw new Error("Only JPG and PNG images are allowed.");
  let bytes: Buffer;
  try { bytes = Buffer.from(encoded, "base64"); } catch { throw new Error("Invalid image encoding."); }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image too large. Maximum size is 5MB.");
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng &&!isJpeg) throw new Error("Invalid or corrupted JPG/PNG image.");
  if (isPng && bytes.length >= 24) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width * height > MAX_IMAGE_PIXELS) throw new Error("Image resolution is too high.");
  }
  return { base64: bytes.toString("base64"), mimeType: isPng? "image/png" : "image/jpeg" };
}

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

router.post("/chat", async (request, response) => {
  const clientIp = getRealIp(request);
  if (isRateLimited(clientIp)) {
    response.status(429).json({ error: "Too many requests. Please wait 1 minute." });
    return;
  }
  const parsed = SendChatMessageBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid chat request." });
    return;
  }
  const { message, lang, image } = parsed.data;
  let imagePart: { inlineData: { data: string; mimeType: string } } | undefined;
  if (image) {
    try {
      const decoded = decodeBase64Image(image);
      imagePart = { inlineData: { data: decoded.base64, mimeType: decoded.mimeType } };
    } catch (error) {
      response.status(400).json({ error: error instanceof Error? error.message : "Invalid image file." });
      return;
    }
  }
  const isEmergency = checkEmergency(message);
  logChat({ lang, isEmergency, message: message.slice(0, 80) });
  const client = getClient();
  if (!client) {
    logger.error({ failureKind: "configuration" }, "Gemini is not configured; serving localized fallback");
    const output = SendChatMessageResponse.parse({
      reply: createFailureReply(lang, isEmergency, false),
      is_emergency: isEmergency,
    });
    response.json(output);
    return;
  }
  const emergencyNotice = emergencyMessages[lang] || emergencyMessages["en"];
  const disclaimer = disclaimers[lang] || disclaimers["en"];
  const emergencyInstruction = emergencyNotice && isEmergency? `Start the response with this exact emergency notice: ${emergencyNotice}` : "";
  const prompt = `You are HealthCare Assistant.
Reply in the requested language: ${lang}.
If lang is yo, reply in Yoruba. If ig, reply in Igbo. If pcm, reply in Nigerian Pidgin.
Provide general health information, basic self-care guidance, and when to seek professional care.
Never diagnose, prescribe medication, or claim certainty from an image.
${emergencyInstruction}
End every reply with this exact disclaimer: ${disclaimer}

User message:
${message}`;

  try {
    const contents = imagePart? [{ text: prompt }, imagePart] : [{ text: prompt }];
    const result = await generateWithGeminiRecovery(
      (signal) => client.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
        contents,
        config: { abortSignal: signal },
      }),
      {
        onRetry: ({ kind, attempt, delayMs }) => {
          logger.warn(
            { failureKind: kind, attempt, delayMs },
            "Retrying Gemini generation after a temporary failure",
          );
        },
      },
    );

    let reply = result.text?.trim()?? "";
    if (!reply) {
      logger.warn({ failureKind: "empty_response" }, "Gemini returned no chat text; serving localized fallback");
      reply = createFailureReply(lang, isEmergency, false);
    } else {
      if (isEmergency && emergencyNotice &&!reply.startsWith(emergencyNotice)) {
        reply = `${emergencyNotice}\n\n${reply}`;
      }
      if (!reply.includes(disclaimer)) {
        reply = `${reply}\n\n${disclaimer}`;
      }
    }
    logChat({ lang: lang, isEmergency: isEmergency, message: message });
    const output = SendChatMessageResponse.parse({ reply, is_emergency: isEmergency });
    response.json(output);
  } catch (error) {
    const failure = getGeminiFailureMetadata(error);
    logger.error(
      {
        failureKind: failure.kind,
        ...(failure.status ? { httpStatus: failure.status } : {}),
      },
      "Gemini generation failed; serving localized fallback",
    );
    const output = SendChatMessageResponse.parse({
      reply: createFailureReply(lang, isEmergency, failure.kind === "quota"),
      is_emergency: isEmergency,
    });
    response.json(output);
  }
});

export default router;