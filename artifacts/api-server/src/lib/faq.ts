// FAQ + cache: answer repeat questions without calling Gemini.

export type FaqLanguage = "en" | "ha" | "fr" | "ar" | "yo" | "ig" | "pcm";
export type ReplyResult = { language: FaqLanguage; reply: string };

function normalize(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/ɓ/g, "b")
    .replace(/ɗ/g, "d")
    .replace(/ƙ/g, "k")
    .replace(/ƴ/g, "y")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface FaqEntry {
  keywords: string[];
  replies: Partial<Record<FaqLanguage, string>>;
}

const faqEntries: FaqEntry[] = [
  {
    keywords: ["what is malaria", "malaria symptoms", "signs of malaria", "zazzabin cizon sauro", "alamun zazzabin cizon sauro"],
    replies: {
      en: "Malaria comes from mosquito bites. Signs: fever, chills, headache, tiredness, vomiting. Sleep under a treated net and remove stagnant water. If you have these signs, go to a clinic for a test.",
      ha: "Zazzabin cizon sauro yana zuwa ne daga cizon sauro. Alamunsa: zazzabi, sanyi da rawar jiki, ciwon kai, gajiya da amai. Ka kwana a cikin gidan sauro kuma ka share ruwan da ya taru. Idan kana da alamun, je asibiti a yi maka gwaji.",
    },
  },
  {
    keywords: ["i have fever", "what to do for fever", "how to treat fever", "ina da zazzabi", "me zan yi idan zazzabi"],
    replies: {
      en: "For a mild fever: rest, drink plenty of fluids, and wear light clothes. Seek care if it lasts more than 2 days, is very high, or the person is a baby, pregnant, or has fits, a stiff neck or difficulty breathing.",
      ha: "Idan zazzabi bai yi tsanani ba: ka huta, ka sha ruwa da yawa, ka sa riga mai sauƙi. Ka je asibiti idan ya fi kwana biyu, ya yi tsanani, mai ciki ne ko jariri, ko akwai farfaɗiya, ƙarfin wuya ko wahalar numfashi.",
    },
  },
  {
    keywords: ["diarrhoea", "diarrhea", "running stomach", "gudawa", "ina gudawa"],
    replies: {
      en: "For diarrhoea, drink plenty of fluids and use oral rehydration salts (ORS) if you can. Eat light food. Go to a clinic quickly if there is blood in the stool, severe weakness, very little urine, or a child or elder cannot keep fluids down.",
      ha: "Idan kana gudawa: ka sha ruwa da yawa kuma ka yi amfani da ORS idan akwai. Ci abinci mai sauƙi. Ka je asibiti da sauri idan akwai jini a bayan gida, rauni sosai, fitsari kaɗan, ko yaro ko tsoho ba ya iya riƙe ruwa.",
    },
  },
  // Add more entries here the same way
];

export function getFaqReply(
  text: string,
  language: FaqLanguage,
): ReplyResult | undefined {
  const normalized = normalize(text);
  // Only short questions; long messages with several problems go to Gemini
  if (normalized.split(" ").length > 12) return undefined;

  for (const entry of faqEntries) {
    const matched = entry.keywords.some((k) => normalized.includes(normalize(k)));
    if (!matched) continue;
    const own = entry.replies[language];
    if (own) return { language, reply: own };
    if (entry.replies.en) return { language: "en", reply: entry.replies.en };
  }
  return undefined;
}

const replyCache = new Map<string, { value: ReplyResult; expiresAt: number }>();
const REPLY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REPLY_CACHE_MAX = 500;

export function getCachedReply(text: string): ReplyResult | undefined {
  const key = normalize(text);
  const hit = replyCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    replyCache.delete(key);
    return undefined;
  }
  return hit.value;
}

export function setCachedReply(text: string, value: ReplyResult) {
  if (text.length > 200) return;
  if (replyCache.size >= REPLY_CACHE_MAX) {
    const oldest = replyCache.keys().next().value;
    if (oldest !== undefined) replyCache.delete(oldest);
  }
  replyCache.set(normalize(text), {
    value,
    expiresAt: Date.now() + REPLY_CACHE_TTL_MS,
  });
}
