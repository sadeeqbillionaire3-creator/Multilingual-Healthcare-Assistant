import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger.js";

const router = Router();

const supportedLanguages = ["en", "ha", "fr", "ar", "yo", "ig", "pcm"] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];

const emergencyMessages: Record<SupportedLanguage, string> = {
  en: "This sounds like an emergency. Please seek immediate medical care, go to the nearest hospital, or call emergency services now.",
  ha: "Wannan yana kama da gaggawa. Don Allah, je asibiti mafi kusa yanzu ko kira lambar agajin gaggawa.",
  fr: "Cela semble être une urgence. Allez à l'hôpital le plus proche ou appelez les urgences.",
  ar: "يبدو أن هذه حالة طارئة. اذهب إلى أقرب مستشفى أو اتصل بخدمات الطوارئ.",
  yo: "Èyí dàbí pajawiri. Jọ̀wọ́ lọ sí ilé-ìwòsàn tó súnmọ́ jù lọ tàbí pe ìrànlọ́wọ́ pajawiri báyìí.",
  ig: "Nke a yiri ihe mberede. Biko gaa n'ụlọ ọgwụ kacha nso ugbu a ma ọ bụ kpọọ ndị ọrụ enyemaka mberede.",
  pcm: "Dis one be like emergency. Abeg go nearest hospital now now or call emergency number.",
};

const disclaimers: Record<SupportedLanguage, string> = {
  en: "Disclaimer: This is not a medical diagnosis. Please consult a qualified doctor.",
  ha: "Gargaɗi: Wannan ba ganewar asibiti ba ne. Da fatan za a tuntuɓi ƙwararren likita.",
  fr: "Avertissement: Ceci n'est pas un diagnostic médical. Veuillez consulter un médecin qualifié.",
  ar: "إخلاء مسؤولية: هذا ليس تشخيصًا طبيًا. يرجى استشارة طبيب مؤهل.",
  yo: "Àkíyèsí: Èyí kì í ṣe àyẹ̀wò ìṣègùn. Jọ̀wọ́ bá dókítà tó tóótun sọ̀rọ̀.",
  ig: "Nkwupụta: Nke a abụghị nchọpụta ahụike. Biko gakwuru dọkịta ruru eru.",
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
  ha: "Da fatan za a aika tambayar lafiyarka a matsayin saƙon rubutu.",
  fr: "Veuillez envoyer votre question de santé sous forme de message texte.",
  ar: "يرجى إرسال سؤالك الصحي كرسالة نصية.",
  yo: "Jọ̀wọ́ fi ìbéèrè ìlera rẹ ránṣẹ́ gẹ́gẹ́ bí ìfiránṣẹ́ ọ̀rọ̀.",
  ig: "Biko zipu ajụjụ ahụike gị dịka ozi ederede.",
  pcm: "Abeg send your health question as a text message.",
};

const thankYouPhrases: Record<SupportedLanguage, string[]> = {
  en: ["thank you", "thanks", "thank you so much", "thanks a lot", "many thanks", "i appreciate it"],
  ha: ["nagode", "na gode", "na gode sosai", "mun gode"],
  fr: ["merci", "merci beaucoup", "merci bien"],
  ar: ["شكرا", "شكرًا", "شكراً", "شكرا جزيلا", "شكرًا جزيلًا"],
  yo: ["e se", "ese", "o se", "mo dupe", "e se pupo"],
  ig: ["daalu", "dalu", "imela", "ekele", "ekele diri"],
  pcm: ["thank you", "thanks", "you try", "i appreciate am"],
};

const greetingPhrases: Record<SupportedLanguage, string[]> = {
  en: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"],
  ha: ["sannu", "barka", "barka da safe", "barka da rana", "barka da yamma"],
  fr: ["bonjour", "bonsoir", "salut", "coucou"],
  ar: ["مرحبا", "السلام عليكم", "صباح الخير", "مساء الخير"],
  yo: ["bawo", "ekuaro", "ekasan", "ekuole", "pele"],
  ig: ["ndewo", "nnọọ", "ututu oma", "ehihie oma", "mgbede oma"],
  pcm: ["how far", "how you dey", "good morning", "good afternoon", "good evening", "wetin dey"],
};

const thankYouReplies: Record<SupportedLanguage, string> = {
  en: "You're welcome. I'm here if you have more health questions.",
  ha: "Madalla! Ina nan idan kana da wata tambaya ta lafiya.",
  fr: "Avec plaisir ! Je suis là si vous avez d'autres questions sur la santé.",
  ar: "على الرحب والسعة! أنا هنا إذا كانت لديك أسئلة صحية أخرى.",
  yo: "Kò tọ́pẹ́! Mo wà níbí bí o bá tún ní ìbéèrè nípa ìlera.",
  ig: "Nnọọ! Anọ m ebe a ma ọ bụrụ na ị nwere ajụjụ gbasara ahụike ọzọ.",
  pcm: "You welcome! I dey here if you get more health questions.",
};

const greetingReplies: Record<SupportedLanguage, string> = {
  en: "Hello! How can I help with your health today?",
  ha: "Sannu! Ta yaya zan taimaka maka da lafiyarka yau?",
  fr: "Bonjour ! Comment puis-je vous aider pour votre santé aujourd'hui ?",
  ar: "مرحبًا! كيف يمكنني مساعدتك بشأن صحتك اليوم؟",
  yo: "Ẹ kú àbọ̀! Báwo ni mo ṣe lè ràn ọ́ lọ́wọ́ nípa ìlera rẹ lónìí?",
  ig: "Ndewo! Kedu ka m ga-esi nyere gị aka gbasara ahụike gị taa?",
  pcm: "Hello! How I fit help you with your health today?",
};

const friendlyFallbacks: Record<SupportedLanguage, string> = {
  en: "I'm sorry, I couldn't prepare a reply just now. Please try again in a moment.",
  ha: "Yi haƙuri, ban iya shirya amsa yanzu ba. Da fatan za a sake gwadawa nan ba da jimawa ba.",
  fr: "Désolé, je n'ai pas pu préparer une réponse. Veuillez réessayer dans un instant.",
  ar: "عذرًا، لم أتمكن من إعداد رد الآن. يُرجى المحاولة مرة أخرى بعد قليل.",
  yo: "Má bínú, mi ò lè pèsè ìdáhùn báyìí. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kansi láìpẹ́.",
  ig: "Ndo, enweghị m ike ịkwadebe azịza ugbu a. Biko nwaa ọzọ n'oge na-adịghị anya.",
  pcm: "Sorry, I no fit prepare reply now. Abeg try again shortly.",
};

const busyReplies: Record<SupportedLanguage, string> = {
  en: "I'm very busy right now. Please try again later.",
  ha: "Ina da aiki sosai yanzu. Don Allah a sake gwadawa daga baya.",
  fr: "L'assistant est très occupé en ce moment. Veuillez réessayer plus tard.",
  ar: "المساعد مشغول جدًا الآن. يُرجى المحاولة مرة أخرى لاحقًا.",
  yo: "Olùrànlọ́wọ́ ti dí púpọ̀ báyìí. Jọ̀wọ́ tún gbìyànjú lẹ́yìn náà.",
  ig: "Onye enyemaka ji ọrụ dị ukwuu ugbu a. Biko nwaa ọzọ ma emechaa.",
  pcm: "Assistant dey very busy right now. Abeg try again later.",
};

const languageIndicators: Partial<Record<SupportedLanguage, string[]>> = {
  ha: ["nagode", "na gode", "sannu", "ciwon", "barka da", "don Allah", "ina jin", "ba zan iya"],
  fr: ["bonjour", "merci", "je suis", "j'ai", "douleur", "fièvre", "s'il vous plaît"],
  ar: ["شكرا", "شكرًا", "مرحبا", "السلام عليكم", "عندي", "ألم"],
  yo: ["e se", "ẹ ṣe", "bawo", "jowo", "jọ̀wọ́", "irora", "mo ni", "ara mi", "mo fẹ"],
  ig: ["daalu", "dalu", "ndewo", "biko", "mgbu", "ahụ", "anyị", "ana m", "enweghị"],
  pcm: ["abeg", "wetin", "i dey", "you dey", "no fit", "how far"],
};

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

function getModel() {
  return process.env.GEMINI_MODEL || "gemini-3-flash-preview";
}

function normalizeMessageForMatch(text: string) {
  return text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getShortConversationReply(
  text: string,
): { language: SupportedLanguage; reply: string } | undefined {
  const normalized = normalizeMessageForMatch(text);

  for (const language of supportedLanguages) {
    if (
      thankYouPhrases[language].some(
        (phrase) => normalizeMessageForMatch(phrase) === normalized,
      )
    ) {
      return { language, reply: thankYouReplies[language] };
    }
  }

  for (const language of supportedLanguages) {
    if (
      greetingPhrases[language].some(
        (phrase) => normalizeMessageForMatch(phrase) === normalized,
      )
    ) {
      return { language, reply: greetingReplies[language] };
    }
  }

  return undefined;
}

function guessLanguageFromText(text: string): SupportedLanguage {
  const normalized = normalizeMessageForMatch(text);
  if (/[\u0600-\u06ff]/u.test(text)) return "ar";
  if (/[ɓɗƙƴ]/iu.test(text)) return "ha";
  if (/[ịụṅ]/iu.test(text)) return "ig";
  if (/[ẹṣ]/iu.test(text)) return "yo";
  if (/[éèêàâçùôœ]/iu.test(text)) return "fr";

  for (const language of supportedLanguages) {
    const phrases = [
      ...thankYouPhrases[language],
      ...greetingPhrases[language],
      ...(languageIndicators[language] ?? []),
    ];
    if (
      phrases.some((phrase) =>
        normalized.includes(normalizeMessageForMatch(phrase)),
      )
    ) {
      return language;
    }
  }

  return "en";
}

async function generateContentWithRetry(client: GoogleGenAI, contents: string) {
  try {
    return await client.models.generateContent({ model: getModel(), contents });
  } catch (error) {
    logger.error(
      { error: safeErrorMessage(error) },
      "Gemini request failed; retrying",
    );
    if (isRateLimitError(error)) throw error;
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
  const normalized = normalizeMessageForMatch(text);
  return emergencyKeywords.some((keyword) =>
    normalized.includes(normalizeMessageForMatch(keyword)),
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
  const characters = Array.from(text);
  if (characters.length <= maxCharacters) return text.trimEnd();

  const truncated = characters.slice(0, Math.max(0, maxCharacters)).join("");
  const sentenceEnds = [...truncated.matchAll(/[.!?؟۔。…]+(?=\s|$)/gu)];
  const lastSentenceEnd = sentenceEnds.at(-1);
  if (!lastSentenceEnd || lastSentenceEnd.index === undefined) return "";
  return truncated.slice(0, lastSentenceEnd.index + lastSentenceEnd[0].length).trimEnd();
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
    700 - Array.from(prefix).length - Array.from(suffix).length;
  answer = truncateCharacters(answer, maxAnswerCharacters);
  if (!answer) answer = friendlyFallbacks[language];

  return `${prefix}${answer}${suffix}`;
}

async function createHealthReply(
  client: GoogleGenAI,
  text: string,
  language: SupportedLanguage,
) {
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
Use plain text only, with no markdown. Keep the entire reply under 700 characters and finish on a complete sentence.
Use correct standard spelling and diacritics in the reply: French accents; Hausa letters ɓ, ɗ, ƙ, and ƴ where appropriate; Igbo dot marks such as ị, ọ, and ụ; and full Yoruba tone marks and underdots. For example, write “máa lọ,” never “ma lo.”

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

function isRateLimitError(error: unknown) {
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: { error?: { status?: unknown; message?: unknown } } };
  } | null;
  const status = Number(value?.status ?? value?.statusCode ?? value?.response?.status);
  const details = [
    value?.status,
    value?.code,
    value?.message,
    value?.response?.data?.error?.status,
    value?.response?.data?.error?.message,
  ].filter((part) => part !== undefined && part !== null).join(" ").toUpperCase();

  return (
    status === 429 ||
    /\b429\b/.test(details) ||
    details.includes("RESOURCE_EXHAUSTED") ||
    details.includes("QUOTA") ||
    details.includes("RATE LIMIT") ||
    details.includes("TOO MANY REQUESTS")
  );
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
      const text = typeof message.text?.body === "string"
        ? message.text.body.trim()
        : "";

      if (!text) {
        const language = getKnownLanguage(message, value) ?? "en";
        reply = friendlyFallbacks[language];
      } else {
        const shortReply = getShortConversationReply(text);
        if (shortReply) {
          reply = shortReply.reply;
        } else {
          let language = guessLanguageFromText(text);
          try {
            const client = getGeminiClient();
            if (!client) throw new Error("Gemini API is not configured.");
            language = await detectLanguage(client, text);
            reply = await createHealthReply(client, text, language);
          } catch (error) {
            logger.error(
              { error: safeErrorMessage(error) },
              "WhatsApp AI reply failed",
            );
            reply = isRateLimitError(error)
              ? busyReplies[language]
              : friendlyFallbacks[language];
          }
        }
      }
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