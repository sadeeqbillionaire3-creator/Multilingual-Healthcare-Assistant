import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger.js";

const router = Router();

const supportedLanguages = ["en", "ha", "fr", "ar", "yo", "ig", "pcm"] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];

const emergencyMessages: Record<SupportedLanguage, string> = {
  en: "This sounds like an emergency. Please seek immediate medical care, go to the nearest hospital, or call emergency services now.",
  ha: "Wannan yana kama da gaggawa. Don Allah je asibiti mafi kusa nan da nan ko kira agajin gaggawa yanzu.",
  fr: "Cela semble être une urgence. Allez à l'hôpital le plus proche ou appelez les urgences.",
  ar: "يبدو أن هذه حالة طارئة. اذهب إلى أقرب مستشفى أو اتصل بخدمات الطوارئ.",
  yo: "Eyi dabi pe pajawiri. Jọwọ lọ si ile-iwosan ti o sunmọ julọ tabi pe iranlọwọ pajawiri nisisiyi.",
  ig: "Nke a dị ka ihe mberede. Biko gaa ụlọ ọgwụ kacha nso ugbu a ma ọ bụ kpọọ ọrụ mberede.",
  pcm: "Dis one be like emergency. Abeg go nearest hospital now now or call emergency number.",
};

const disclaimers: Record<SupportedLanguage, string> = {
  en: "Disclaimer: This is not a medical diagnosis. Please consult a qualified doctor.",
  ha: "Gargadi: Wannan ba ganewar asibiti ba ne. Da fatan za a tuntubi likita mai lasisi.",
  fr: "Avertissement: Ceci n'est pas un diagnostic médical. Veuillez consulter un médecin qualifié.",
  ar: "إخلاء مسؤولية: هذا ليس تشخيصًا طبيًا. يرجى استشارة طبيب مؤهل.",
  yo: "Afiwera: Eyi kii ṣe ayẹwo iwosan. Jọwọ kan si dokita to peye.",
  ig: "Nkwuputa: Nke a abụghị nchọpụta ahụike. Biko gakwuru dọkịta ruru eru.",
  pcm: "Disclaimer: Dis no be doctor diagnosis. Abeg go meet better doctor.",
};

const emergencyKeywords = [
  // English
  "chest pain", "can't breathe", "cannot breathe", "difficulty breathing", "shortness of breath", "heavy bleeding", "unconscious", "stroke", "heart attack", "suicidal",
  // Hausa
  "ciwon kirji", "ba zan iya numfashi ba", "wahalar numfashi", "zubar jini mai yawa", "suma", "bugun jini",
  // French
  "douleur thoracique", "ne peux pas respirer", "difficulté à respirer", "essoufflement", "saignement abondant", "inconscient", "avc", "crise cardiaque", "suicidaire",
  // Arabic
  "ألم في الصدر", "لا أستطيع التنفس", "صعوبة في التنفس", "ضيق التنفس", "نزيف حاد", "فقدان الوعي", "سكتة دماغية", "نوبة قلبية", "انتحار",
  // Yoruba
  "irora aya", "mi o le mi", "ira mi nira", "eje nla", "aisan ọpọlọ", "daku", "ijakadi aya",
  // Igbo
  "mgbu obi", "enweghi ike iku ume", "ike iku ume", "ọbara ọgbụgba", "amaghị ihe", "ọrịa strok", "nkụchi obi",
  // Pidgin
  "chest dey pain", "i no fit breathe", "blood dey rush", "i dey faint", "stroke", "heart attack dey do me",
];

const textOnlyReplies: Record<SupportedLanguage, string> = {
  en: "Please send your health question as a text message.",
  ha: "Da fatan za a aika da tambayar lafiyarka a matsayin saƙon rubutu.",
  fr: "Veuillez envoyer votre question de santé sous forme de message texte.",
  ar: "يرجى إرسال سؤالك الصحي كرسالة نصية.",
  yo: "Jọwọ fi ibeere ilera rẹ ranṣẹ gẹgẹbi ifiranṣẹ ọrọ.",
  ig: "Biko zipu ajụjụ ahụike gị dịka ozi ederede.",
  pcm: "Abeg send your health question as a text message.",
};

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

function getModel() {
  return process.env.GEMINI_MODEL || "gemini-3-flash-preview";
}

async function generateContentWithRetry(client: GoogleGenAI, contents: string) {
  try {
    return await client.models.generateContent({ model: getModel(), contents });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return client.models.generateContent({ model: getModel(), contents });
  }
}

async function detectLanguage(client: GoogleGenAI, text: string): Promise<SupportedLanguage> {
  const result = await generateContentWithRetry(
    client,
    `Identify the primary language of this message. Choose exactly one code from: en (English), ha (Hausa), fr (French), ar (Arabic), yo (Yoruba), ig (Igbo), pcm (Nigerian Pidgin). For code-switching, choose the dominant language. If unclear, choose en. Output only the code.\n\nMessage:\n${text}`,
  );
  const match = result.text?.trim().toLowerCase().match(/\b(en|ha|fr|ar|yo|ig|pcm)\b/);
  const language = match?.[1];
  return supportedLanguages.includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : "en";
}

function isEmergency(text: string) {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return emergencyKeywords.some((keyword) =>
    normalized.includes(keyword.toLocaleLowerCase()),
  );
}

function stripMarkdown(text: string) {
  return text
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function truncateCharacters(text: string, maxCharacters: number) {
  return Array.from(text).slice(0, Math.max(0, maxCharacters)).join("").trimEnd();
}

function makeSafeReply(
  generatedReply: string,
  language: SupportedLanguage,
  emergency: boolean,
) {
  const emergencyNotice = emergency ? emergencyMessages[language] : "";
  const disclaimer = disclaimers[language];
  let answer = stripMarkdown(generatedReply);

  if (emergencyNotice) answer = answer.replace(emergencyNotice, "").trim();
  answer = answer.replace(disclaimer, "").trim();

  const prefix = emergencyNotice ? `${emergencyNotice}\n\n` : "";
  const suffix = `\n\n${disclaimer}`;
  const maxAnswerCharacters =
    1000 - Array.from(prefix).length - Array.from(suffix).length;
  answer = truncateCharacters(answer, maxAnswerCharacters);

  return `${prefix}${answer}${suffix}`;
}

async function createHealthReply(text: string) {
  const client = getGeminiClient();
  if (!client) throw new Error("Gemini API is not configured.");

  const language = await detectLanguage(client, text);
  const emergency = isEmergency(text);
  const emergencyNotice = emergency ? emergencyMessages[language] : "";
  const disclaimer = disclaimers[language];
  const emergencyInstruction = emergency
    ? `Start the response with this exact emergency notice: ${emergencyNotice}`
    : "";
  const prompt = `You are HealthCare Assistant.
Reply in the same language as the user's message. The detected language is ${language}. Supported languages are English, Hausa, French, Arabic, Yoruba, Igbo, and Nigerian Pidgin.
Provide general health information, basic self-care guidance, and when to seek professional care.
Never diagnose, prescribe medication, or claim certainty.
${emergencyInstruction}
End every reply with this exact disclaimer: ${disclaimer}
Use plain text only, with no markdown. Keep the entire reply under 1000 characters.

User message:
${text}`;

  const result = await generateContentWithRetry(client, prompt);
  const generatedReply = result.text?.trim();
  if (!generatedReply) throw new Error("Gemini returned an empty reply.");
  return makeSafeReply(generatedReply, language, emergency);
}

function parseKnownLanguage(value: unknown): SupportedLanguage | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[_-].*$/, "");
  const aliases: Record<string, SupportedLanguage> = {
    english: "en",
    hausa: "ha",
    french: "fr",
    arabic: "ar",
    yoruba: "yo",
    igbo: "ig",
    pidgin: "pcm",
    "nigerian pidgin": "pcm",
  };
  if (supportedLanguages.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage;
  }
  return aliases[normalized];
}

function getKnownLanguage(message: any, value: any): SupportedLanguage | undefined {
  const contact = value?.contacts?.[0];
  const profile = contact?.profile;
  return (
    parseKnownLanguage(message?.language) ??
    parseKnownLanguage(message?.lang) ??
    parseKnownLanguage(message?.locale) ??
    parseKnownLanguage(contact?.language) ??
    parseKnownLanguage(profile?.language) ??
    parseKnownLanguage(profile?.locale)
  );
}

function getCaption(message: any): string | undefined {
  const caption =
    message?.caption ??
    message?.image?.caption ??
    message?.video?.caption ??
    message?.document?.caption;
  return typeof caption === "string" && caption.trim() ? caption.trim() : undefined;
}

function safeErrorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [process.env.WHATSAPP_TOKEN, process.env.GEMINI_API_KEY]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

async function sendWhatsAppMessage(to: string, reply: string) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: reply },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`WhatsApp Cloud API returned HTTP ${response.status}.`);
  }
}

async function processWhatsAppWebhook(body: any) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const sender = typeof message.from === "string" ? message.from : "";
    if (!sender) return;

    let reply: string;
    if (message.type === "text") {
      const text = message.text?.body;
      if (typeof text !== "string" || !text.trim()) return;
      reply = await createHealthReply(text.trim());
    } else {
      let language = getKnownLanguage(message, value);
      const caption = getCaption(message);
      if (!language && caption) {
        try {
          const client = getGeminiClient();
          if (client) language = await detectLanguage(client, caption);
        } catch (error) {
          logger.error(
            { error: safeErrorMessage(error) },
            "WhatsApp caption language detection failed",
          );
        }
      }
      reply = textOnlyReplies[language ?? "en"];
    }

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    logger.error(
      { error: safeErrorMessage(error) },
      "WhatsApp webhook message processing failed",
    );
  }
}

// GET for verification - ROOT "/"
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "smart_sadeeq_verify_2026";
  
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST for messages - ROOT "/"
router.post("/", (req, res) => {
  try {
    const body = req.body;
    res.sendStatus(200);
    void processWhatsAppWebhook(body);
  } catch (error) {
    logger.error(
      { error: safeErrorMessage(error) },
      "WhatsApp webhook request handling failed",
    );
    if (!res.headersSent) res.sendStatus(200);
  }
});

export default router;