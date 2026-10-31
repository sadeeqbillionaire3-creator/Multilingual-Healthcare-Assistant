import { Router, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger.js";
import {
  generateWithGeminiRecovery,
  getGeminiFailureMetadata,
} from "../lib/gemini-recovery.js";
import {
  submitWhatsAppText,
  WhatsAppGraphApiError,
} from "../lib/whatsapp-cloud.js";

const router = Router();

const supportedLanguages = ["en", "ha", "fr", "ar", "yo", "ig", "pcm"] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];
const MAX_TRACKED_MESSAGE_IDS = 10_000;
const MESSAGE_ID_TTL_MS = 24 * 60 * 60 * 1000;
const MESSAGE_PROCESSING_TTL_MS = 2 * 60 * 1000;
const MAX_MESSAGE_ATTEMPTS = 3;

type MessageIdState = "processing" | "retryable" | "sent" | "uncertain" | "exhausted";

interface MessageIdRecord {
  state: MessageIdState;
  attempts: number;
  expiresAt: number;
}

const recentlySeenMessageIds = new Map<string, MessageIdRecord>();

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

function parseModelReply(
  generatedText: string,
  fallbackLanguage: SupportedLanguage,
): { language: SupportedLanguage; reply: string } {
  const text = generatedText
    .trim()
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const match = text.match(
    /^\s*LANGUAGE\s*[:=]\s*(en|ha|fr|ar|yo|ig|pcm)\s*(?:\r?\n)\s*([\s\S]+)$/i,
  );

  if (!match) return { language: fallbackLanguage, reply: text };

  const reply = match[2].trim().replace(/^REPLY\s*[:=]\s*/i, "").trim();
  return {
    language: match[1].toLowerCase() as SupportedLanguage,
    reply,
  };
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
  fallbackLanguage: SupportedLanguage,
): Promise<{ language: SupportedLanguage; reply: string }> {
  const emergency = isEmergency(text);
  const prompt = `You are MediLingua Health AI.
Identify the user's language and reply in that same language. Supported languages are English (en), Hausa (ha), French (fr), Arabic (ar), Yoruba (yo), Igbo (ig), and Nigerian Pidgin (pcm). If the language is unclear, use this hint: ${fallbackLanguage}.
Provide general health information, basic self-care guidance, and when to seek professional care.
Never diagnose, prescribe medication, or claim certainty.
${emergency ? "This may be an emergency. Clearly advise the user to seek immediate medical help now; the application will add its verified emergency notice." : ""}
Do not add a medical disclaimer; the application will append the correct localized disclaimer.
Use plain text only, with no markdown. Keep the reply under 500 characters and finish on a complete sentence.
Use correct standard spelling and diacritics in the reply: French accents; Hausa letters ɓ, ɗ, ƙ, and ƴ where appropriate; Igbo dot marks such as ị, ọ, and ụ; and full Yoruba tone marks and underdots. For example, write “máa lọ,” never “ma lo.”
Return exactly two parts: first line “LANGUAGE: <code>” using one supported code, then the reply text on the next line. Do not include labels in the reply.

User message:
${text}`;

  const result = await generateWithGeminiRecovery(
    (signal) => client.models.generateContent({
      model: getModel(),
      contents: prompt,
      config: { abortSignal: signal },
    }),
    {
      onRetry: ({ kind, attempt, delayMs }) => {
        logger.warn(
          { failureKind: kind, attempt, delayMs },
          "Retrying WhatsApp Gemini generation after a temporary failure",
        );
      },
    },
  );
  const generatedReply = result.text?.trim();
  if (!generatedReply) throw new Error("Gemini returned an empty reply.");

  const parsed = parseModelReply(generatedReply, fallbackLanguage);
  if (!parsed.reply) throw new Error("Gemini returned an empty reply.");
  return {
    language: parsed.language,
    reply: makeSafeReply(parsed.reply, parsed.language, emergency),
  };
}

async function downloadWhatsAppAudio(
  mediaId: string,
): Promise<{ data: string; mimeType: string }> {
  const accessToken = process.env.WHATSAPP_TOKEN;
  if (!accessToken) throw new WhatsAppGraphApiError("configuration");
  const metaRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) throw new Error(`Media lookup failed (${metaRes.status})`);
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("No media URL returned.");
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) throw new Error(`Audio download failed (${fileRes.status})`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.length > 10 * 1024 * 1024) throw new Error("Audio too large.");
  return {
    data: buffer.toString("base64"),
    mimeType: (meta.mime_type ?? "audio/ogg").split(";")[0],
  };
}

async function transcribeVoiceNote(
  client: GoogleGenAI,
  audio: { data: string; mimeType: string },
): Promise<string> {
  const result = await generateWithGeminiRecovery(
    (signal) =>
      client.models.generateContent({
        model: getModel(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this voice note exactly, in the language spoken. Return only the transcript.",
              },
              { inlineData: { mimeType: audio.mimeType, data: audio.data } },
            ],
          },
        ],
        config: { abortSignal: signal },
      }),
    {},
  );
  const transcript = result.text?.trim();
  if (!transcript) throw new Error("Empty transcript.");
  return transcript;
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

async function sendWhatsAppMessage(to: string, reply: string) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new WhatsAppGraphApiError("configuration");
  }

  const result = await submitWhatsAppText({
    phoneNumberId,
    accessToken,
    to,
    reply,
  });
  logger.info(
    {
      httpStatus: result.status,
      acceptedByGraph: result.accepted,
      providerMessageIdPresent: result.providerMessageIdPresent,
    },
    "WhatsApp Graph API accepted an outbound text message",
  );
}

function createFailureReply(
  language: SupportedLanguage,
  emergency: boolean,
  quotaFailure: boolean,
) {
  if (emergency) {
    return `${emergencyMessages[language]}\n\n${disclaimers[language]}`;
  }

  const message = quotaFailure
    ? busyReplies[language]
    : friendlyFallbacks[language];
  return `${message}\n\n${disclaimers[language]}`;
}

function expireMessageIds(
  messageIds: Map<string, MessageIdRecord>,
  now: number,
) {
  for (const [knownId, record] of messageIds) {
    if (record.expiresAt > now) continue;

    if (record.state === "processing") {
      messageIds.set(knownId, {
        ...record,
        state: record.attempts < MAX_MESSAGE_ATTEMPTS ? "retryable" : "exhausted",
        expiresAt: now + MESSAGE_ID_TTL_MS,
      });
    } else {
      messageIds.delete(knownId);
    }
  }
}

function claimMessageId(
  messageId: string,
  messageIds: Map<string, MessageIdRecord>,
  now: number,
): "claimed" | "duplicate" | "capacity" {
  if (!messageId) return "claimed";
  expireMessageIds(messageIds, now);

  const existing = messageIds.get(messageId);
  if (existing) {
    if (existing.state !== "retryable") return "duplicate";
    if (existing.attempts >= MAX_MESSAGE_ATTEMPTS) {
      messageIds.set(messageId, {
        ...existing,
        state: "exhausted",
        expiresAt: now + MESSAGE_ID_TTL_MS,
      });
      return "duplicate";
    }

    messageIds.set(messageId, {
      ...existing,
      state: "processing",
      attempts: existing.attempts + 1,
      expiresAt: now + MESSAGE_PROCESSING_TTL_MS,
    });
    return "claimed";
  }

  if (messageIds.size >= MAX_TRACKED_MESSAGE_IDS) return "capacity";

  messageIds.set(messageId, {
    state: "processing",
    attempts: 1,
    expiresAt: now + MESSAGE_PROCESSING_TTL_MS,
  });
  return "claimed";
}

function setMessageIdState(
  messageId: string,
  messageIds: Map<string, MessageIdRecord>,
  state: MessageIdState,
  now: number,
) {
  const existing = messageIds.get(messageId);
  if (!existing) return;

  messageIds.set(messageId, {
    ...existing,
    state,
    expiresAt: now + (
      state === "processing" ? MESSAGE_PROCESSING_TTL_MS : MESSAGE_ID_TTL_MS
    ),
  });
}

function isDefiniteWhatsAppSendFailure(error: unknown) {
  if (!(error instanceof WhatsAppGraphApiError)) return false;
  if (error.kind === "configuration") return true;

  return (
    error.kind === "rejected" &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  );
}

function markMessageFailure(
  messageId: string,
  messageIds: Map<string, MessageIdRecord>,
  definite: boolean,
  now: number,
) {
  const record = messageIds.get(messageId);
  if (!record) return;

  const nextState: MessageIdState = definite
    ? record.attempts < MAX_MESSAGE_ATTEMPTS ? "retryable" : "exhausted"
    : "uncertain";
  setMessageIdState(messageId, messageIds, nextState, now);
}

function safeErrorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    process.env.WHATSAPP_TOKEN,
    process.env.WHATSAPP_VERIFY_TOKEN,
    process.env.GEMINI_API_KEY,
  ]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

interface WhatsAppWebhookProcessorOptions {
  generateReply?: (
    text: string,
    fallbackLanguage: SupportedLanguage,
  ) => Promise<{ language: SupportedLanguage; reply: string }>;
  sendMessage?: (to: string, reply: string) => Promise<void>;
  logger?: Pick<typeof logger, "info" | "error">;
  messageIds?: Map<string, MessageIdRecord>;
  now?: () => number;
}

export function createWhatsAppWebhookProcessor(
  options: WhatsAppWebhookProcessorOptions = {},
) {
  const processLogger = options.logger ?? logger;
  const sendMessage = options.sendMessage ?? sendWhatsAppMessage;
  const messageIds = options.messageIds ?? recentlySeenMessageIds;
  const now = options.now ?? Date.now;
  const generateReply = options.generateReply ?? (async (
    text: string,
    fallbackLanguage: SupportedLanguage,
  ) => {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini API is not configured.");
    return createHealthReply(client, text, fallbackLanguage);
  });

  return async function processWhatsAppWebhook(body: any) {
    let messageId = "";
    let claimedMessageId = false;
    let outboundAttemptStarted = false;

    try {
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      if (!message) return;

      const sender = typeof message.from === "string" ? message.from : "";
      if (!sender) return;

      messageId = typeof message.id === "string" ? message.id.trim() : "";
      if (messageId) {
        const claim = claimMessageId(messageId, messageIds, now());
        if (claim === "duplicate") {
          processLogger.info(
            { duplicate: true },
            "Skipping duplicate WhatsApp webhook message",
          );
          return;
        }
        if (claim === "capacity") {
          processLogger.error(
            { trackedMessageIds: messageIds.size },
            "WhatsApp webhook message skipped because duplicate tracking is full",
          );
          return;
        }
        claimedMessageId = true;
      }

      if (message.type === "audio" && message.audio?.id) {
        try {
          const audioClient = getGeminiClient();
          if (!audioClient) throw new Error("Gemini API is not configured.");
          const audio = await downloadWhatsAppAudio(message.audio.id);
          const transcript = await transcribeVoiceNote(audioClient, audio);
          Object.assign(message, { type: "text", text: { body: transcript } });
        } catch (error) {
          processLogger.error(
            { err: safeErrorMessage(error) },
            "WhatsApp voice note transcription failed",
          );
        }
      }

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
            let language =
              getKnownLanguage(message, value) ?? guessLanguageFromText(text);
            const emergency = isEmergency(text);
            try {
              const generated = await generateReply(text, language);
              language = generated.language;
              reply = generated.reply;
            } catch (error) {
              const failure = getGeminiFailureMetadata(error);
              processLogger.error(
                {
                  failureKind: failure.kind,
                  ...(failure.status ? { httpStatus: failure.status } : {}),
                },
                "WhatsApp Gemini generation failed; using localized fallback",
              );
              reply = createFailureReply(
                language,
                emergency,
                failure.kind === "quota",
              );
            }
          }
        }
      } else {
        let language = getKnownLanguage(message, value);
        const caption = getCaption(message);
        if (!language && caption) language = guessLanguageFromText(caption);
        reply = textOnlyReplies[language ?? "en"];
      }

      if (claimedMessageId) {
        setMessageIdState(messageId, messageIds, "uncertain", now());
      }
      outboundAttemptStarted = true;
      await sendMessage(sender, reply);
      if (claimedMessageId) {
        setMessageIdState(messageId, messageIds, "sent", now());
      }
    } catch (error) {
      if (claimedMessageId && messageId) {
        markMessageFailure(
          messageId,
          messageIds,
          !outboundAttemptStarted || isDefiniteWhatsAppSendFailure(error),
          now(),
        );
      }

      const graphFailure = error instanceof WhatsAppGraphApiError;
      processLogger.error(
        graphFailure
          ? {
              failureKind: error.kind,
              ...(error.status ? { httpStatus: error.status } : {}),
            }
          : {
              errorType: error instanceof Error ? error.name : "UnknownError",
            },
        "WhatsApp webhook message processing failed",
      );
    }
  };
}

const processWhatsAppWebhook = createWhatsAppWebhookProcessor();

export function createWhatsAppPostHandler(
  processWebhook: (body: any) => void | Promise<void> = processWhatsAppWebhook,
) {
  return (req: Request, res: Response) => {
    try {
      const body = req.body;
      res.sendStatus(200);
      void processWebhook(body);
    } catch (error) {
      logger.error(
        { error: safeErrorMessage(error) },
        "WhatsApp webhook request handling failed",
      );
      if (!res.headersSent) res.sendStatus(200);
    }
  };
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
router.post("/", createWhatsAppPostHandler());

export default router;

export { WhatsAppGraphApiError };