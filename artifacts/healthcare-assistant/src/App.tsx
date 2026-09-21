import './black-theme.css';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { jsPDF } from 'jspdf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FileText,
  HeartPulse,
  Hospital,
  Info,
  Languages,
  Link as LinkIcon,
  LockKeyhole,
  MapPin,
  Mic,
  Paperclip,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import {
  getHealthCheckQueryKey,
  useHealthCheck,
  useSendChatMessage,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const HISTORY_KEY = 'medilingua-chat-history-v1';
const DASHBOARD_PASSWORD = 'medilingua-demo';

type Language = 'en' | 'ha' | 'fr' | 'ar' | 'yo' | 'ig' | 'pcm';
type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  image?: string | null;
  emergency?: boolean;
  lang: Language;
  createdAt: string;
};
type ChatRequest = { message: string; lang: Language; image: string | null };
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechWindow = Window & {
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

  const languages: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'EN' },
  { code: 'ha', label: 'Hausa', native: 'HA' },
  { code: 'yo', label: 'Yoruba', native: 'YO' },
  { code: 'ig', label: 'Igbo', native: 'IG' },
  { code: 'pcm', label: 'Pidgin', native: 'PG' },
  { code: 'fr', label: 'Français', native: 'FR' },
  { code: 'ar', label: 'العربية', native: 'AR' },
];

const speechLocales = [
  { value: 'ha-NG', label: 'Hausa' },
  { value: 'yo-NG', label: 'Yoruba' },
  { value: 'ig-NG', label: 'Igbo' },
  { value: 'en-NG', label: 'Pidgin' },
  { value: 'en-US', label: 'English' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'ar-SA', label: 'العربية' },
] as const;

const copy = {
  en: {
    brand: 'MediLingua AI',
    tagline: "Nigeria's multilingual care guide",
    title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
    intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French, Arabic,Yoruba,Igbo & Pidgin | Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
    privacy: 'Private by design',
    privacyText: 'Your chat history stays locally on this device only.',
    how: 'How it helps',
    stepOne: 'Describe what you notice',
    stepTwo: 'Get clear next steps',
    stepThree: 'Know when to seek care',
    assistant: 'MediLingua care guide',
    online: 'Service available',
    unavailable: 'Service check unavailable',
    checking: 'Checking service',
    clear: 'Clear Chat',
    report: 'Download Report as PDF',
    dashboard: 'Doctor Dashboard',
    welcomeTitle: 'What would you like to understand?',
    welcomeText: 'Share a symptom, concern, or clear image. MediLingua gives general information — never a diagnosis.',
    prompts: ['I have had a headache since yesterday', 'What can help with a mild cough?', "I can't breathe properly"],
    placeholder: 'Describe what you are experiencing…',
    attach: 'Attach JPG or PNG',
    imageAdded: 'Image ready to share',
    removeImage: 'Remove image',
    send: 'Send',
    characters: 'of 2,000',
    guidance: 'General guidance only',
    guidanceText: 'MediLingua is not a doctor and cannot diagnose or replace professional care.',
    emptySend: 'Write a question or attach an image first.',
    tooLong: 'Please keep your message under 2,000 characters.',
    invalidImage: 'Please choose a JPG or PNG image under 5 MB.',
    rateLimit: 'You have reached the request limit. Please wait a moment and try again.',
    error: 'We could not reach MediLingua just now.',
    retry: 'Try again',
    emergencyTitle: 'Please seek urgent medical help',
    emergencyText: 'This may need immediate attention. Contact emergency services or go to the nearest emergency department now.',
    emergencyFinder: 'EMERGENCY — Find Help Near You',
    maps: 'Open Nearest Hospitals in Google Maps',
    emergencyDisclaimer: 'This is a supplementary alert, not a diagnosis — always call emergency services directly.',
    emergencyNumbers: 'Nigeria nationwide emergency numbers',
    noVoice: 'Voice input not supported on this browser',
    listening: 'Listening…',
    voiceLanguage: 'Voice language',
    imageQuestion: 'Please review the attached image and share general health guidance.',
    loading: 'MediLingua is considering your question',
    footer: 'For general information, not diagnosis',
    localHistory: 'Chat history is stored locally on your device only',
    badges: ['🎤 Voice-Enabled', '🖼️ Image Analysis', '🚨 Emergency Detection', '📄 PDF Reports'],
  },
  ha: {
    brand: 'MediLingua AI',
    tagline: 'Jagoran lafiya cikin harsuna da yawa',
    title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
    intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French,Arabic, Yoruba , Igbo & Pidgin| Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
    privacy: 'Sirri tun daga farko',
    privacyText: 'Tarihin hirarka yana nan a wannan na’ura kawai.',
    how: 'Yadda yake taimakawa',
    stepOne: 'Bayyana abin da ka lura',
    stepTwo: 'Samun matakai masu sauƙi',
    stepThree: 'San lokacin neman kulawa',
    assistant: 'Jagoran lafiyar MediLingua',
    online: 'Sabis yana aiki',
    unavailable: 'Ba a samu duba sabis ba',
    checking: 'Ana duba sabis',
    clear: 'Share hira',
    report: 'Sauke rahoto PDF',
    dashboard: 'Dashboard na likita',
    welcomeTitle: 'Me kake son fahimta?',
    welcomeText: 'Bayyana alama, damuwa, ko tura hoto mai kyau. MediLingua yana ba da bayani gabaɗaya — ba ganewar asali ba.',
    prompts: ['Ina fama da ciwon kai tun jiya', 'Me zai taimaka wa tari mai sauƙi?', 'Ba na iya numfashi da kyau'],
    placeholder: 'Bayyana abin da kake ji…',
    attach: 'Tura JPG ko PNG',
    imageAdded: 'An shirya hoton',
    removeImage: 'Cire hoto',
    send: 'Tura',
    characters: 'na 2,000',
    guidance: 'Bayani na gabaɗaya kawai',
    guidanceText: 'MediLingua ba likita ba ne, kuma ba zai iya gano cuta ko maye gurbin kulawar ƙwararre ba.',
    emptySend: 'Rubuta tambaya ko tura hoto da farko.',
    tooLong: 'Don Allah ka rage saƙonka zuwa haruffa 2,000.',
    invalidImage: 'Zaɓi hoton JPG ko PNG da bai wuce 5 MB ba.',
    rateLimit: 'An kai iyakar buƙatu. Jira kaɗan sannan ka sake gwadawa.',
    error: 'Ba mu iya samun MediLingua ba a yanzu.',
    retry: 'Sake gwadawa',
    emergencyTitle: 'Don Allah ka nemi taimakon gaggawa',
    emergencyText: 'Wannan na iya buƙatar kulawa nan take. Kira sabis ɗin gaggawa ko je asibitin gaggawa mafi kusa.',
    emergencyFinder: 'GAGGAWA — Nemo Taimako Kusa da Kai',
    maps: 'Buɗe Asibitocin Kusa a Google Maps',
    emergencyDisclaimer: 'Wannan gargaɗi ne na ƙari, ba ganewar asali ba — kira sabis ɗin gaggawa kai tsaye.',
    emergencyNumbers: 'Lambobin gaggawa na Najeriya',
    noVoice: 'Ba a tallafa shigar da murya a wannan burauzar ba',
    listening: 'Ana sauraro…',
    voiceLanguage: 'Harshen murya',
    imageQuestion: 'Don Allah ka duba hoton da aka tura ka ba da bayani na lafiyar gabaɗaya.',
    loading: 'MediLingua yana nazarin tambayarka',
    footer: 'Don bayani na gabaɗaya, ba ganewar asali ba',
    localHistory: 'Ana adana tarihin hira a wannan na’ura kawai',
    badges: ['🎤 Murya', '🖼️ Nazarin Hoto', '🚨 Gano Gaggawa', '📄 Rahoton PDF'],
  },
  fr: {
    brand: 'MediLingua AI',
    tagline: 'Votre guide santé multilingue',
    title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
    intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French, Arabic, Yoruba,Igbo & Pidgin | Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
    privacy: 'Pensé pour la confidentialité',
    privacyText: 'Votre historique reste uniquement sur cet appareil.',
    how: 'Comment il aide',
    stepOne: 'Décrivez ce que vous remarquez',
    stepTwo: 'Recevez des étapes claires',
    stepThree: 'Sachez quand consulter',
    assistant: 'Guide santé MediLingua',
    online: 'Service disponible',
    unavailable: 'Vérification indisponible',
    checking: 'Vérification en cours',
    clear: 'Effacer la conversation',
    report: 'Télécharger le rapport PDF',
    dashboard: 'Tableau de bord médecin',
    welcomeTitle: 'Que souhaitez-vous comprendre ?',
    welcomeText: 'Partagez un symptôme, une inquiétude ou une image nette. MediLingua donne des informations générales — jamais un diagnostic.',
    prompts: ['J’ai mal à la tête depuis hier', 'Que faire pour une toux légère ?', 'Je ne peux pas bien respirer'],
    placeholder: 'Décrivez ce que vous ressentez…',
    attach: 'Joindre un JPG ou PNG',
    imageAdded: 'Image prête à envoyer',
    removeImage: 'Retirer l’image',
    send: 'Envoyer',
    characters: 'sur 2 000',
    guidance: 'Informations générales uniquement',
    guidanceText: 'MediLingua n’est pas un médecin et ne peut pas poser de diagnostic ni remplacer un professionnel.',
    emptySend: 'Écrivez une question ou joignez une image.',
    tooLong: 'Votre message doit rester sous 2 000 caractères.',
    invalidImage: 'Choisissez une image JPG ou PNG de moins de 5 Mo.',
    rateLimit: 'La limite de demandes est atteinte. Patientez puis réessayez.',
    error: 'MediLingua est momentanément inaccessible.',
    retry: 'Réessayer',
    emergencyTitle: 'Veuillez demander une aide médicale urgente',
    emergencyText: 'Cela peut nécessiter une attention immédiate. Appelez les urgences ou rendez-vous au service le plus proche.',
    emergencyFinder: 'URGENCE — Trouver de l’aide près de vous',
    maps: 'Ouvrir les hôpitaux proches dans Google Maps',
    emergencyDisclaimer: 'Cette alerte est complémentaire, pas un diagnostic — appelez toujours directement les urgences.',
    emergencyNumbers: 'Numéros d’urgence nationaux du Nigeria',
    noVoice: 'La saisie vocale n’est pas prise en charge par ce navigateur',
    listening: 'Écoute…',
    voiceLanguage: 'Langue vocale',
    imageQuestion: 'Analysez cette image et donnez-moi des informations générales de santé.',
    loading: 'MediLingua réfléchit à votre question',
    footer: 'Informations générales, pas un diagnostic',
    localHistory: 'L’historique est stocké uniquement sur votre appareil',
    badges: ['🎤 Voix', '🖼️ Analyse d’image', '🚨 Détection d’urgence', '📄 Rapports PDF'],
  },
  ar: {
    brand: 'MediLingua AI',
    tagline: 'مرشدك الصحي متعدد اللغات',
    title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
    intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French,Arabic,Yoruba , Igbo & Pidgin| Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
    privacy: 'الخصوصية أولًا',
    privacyText: 'يُحفظ سجل المحادثة على هذا الجهاز فقط.',
    how: 'كيف يساعد',
    stepOne: 'صف ما تلاحظه',
    stepTwo: 'احصل على خطوات واضحة',
    stepThree: 'اعرف متى تطلب الرعاية',
    assistant: 'مرشد MediLingua الصحي',
    online: 'الخدمة متاحة',
    unavailable: 'تعذر التحقق من الخدمة',
    checking: 'جارٍ التحقق من الخدمة',
    clear: 'مسح المحادثة',
    report: 'تنزيل تقرير PDF',
    dashboard: 'لوحة الطبيب',
    welcomeTitle: 'ما الذي تريد فهمه؟',
    welcomeText: 'شارك عرضًا أو قلقًا أو صورة واضحة. يقدم MediLingua معلومات صحية عامة — وليس تشخيصًا.',
    prompts: ['أعاني من صداع منذ أمس', 'ما الذي يساعد في تخفيف السعال البسيط؟', 'لا أستطيع التنفس جيدًا'],
    placeholder: 'صف ما تشعر به…',
    attach: 'إرفاق JPG أو PNG',
    imageAdded: 'الصورة جاهزة للمشاركة',
    removeImage: 'إزالة الصورة',
    send: 'إرسال',
    characters: 'من 2,000',
    guidance: 'إرشادات عامة فقط',
    guidanceText: 'MediLingua ليس طبيبًا ولا يستطيع التشخيص أو استبدال الرعاية المتخصصة.',
    emptySend: 'اكتب سؤالك أو أرفق صورة أولًا.',
    tooLong: 'يرجى إبقاء رسالتك أقل من 2,000 حرف.',
    invalidImage: 'يرجى اختيار صورة JPG أو PNG بحجم أقل من 5 ميغابايت.',
    rateLimit: 'لقد وصلت إلى حد الطلبات. انتظر قليلًا ثم حاول مرة أخرى.',
    error: 'تعذر الوصول إلى MediLingua الآن.',
    retry: 'إعادة المحاولة',
    emergencyTitle: 'يرجى طلب المساعدة الطبية العاجلة',
    emergencyText: 'قد تحتاج هذه الحالة إلى عناية فورية. اتصل بخدمات الطوارئ أو توجه إلى أقرب قسم طوارئ.',
    emergencyFinder: 'طوارئ — اعثر على المساعدة بالقرب منك',
    maps: 'فتح أقرب المستشفيات في خرائط Google',
    emergencyDisclaimer: 'هذا تنبيه إضافي وليس تشخيصًا — اتصل دائمًا بخدمات الطوارئ مباشرة.',
    emergencyNumbers: 'أرقام الطوارئ الوطنية في نيجيريا',
    noVoice: 'الإدخال الصوتي غير مدعوم في هذا المتصفح',
    listening: 'جارٍ الاستماع…',
    voiceLanguage: 'لغة الصوت',
    imageQuestion: 'يرجى مراجعة الصورة المرفقة وتقديم إرشادات صحية عامة.',
    loading: 'يفكر MediLingua في سؤالك',
    footer: 'للمعلومات العامة، وليس للتشخيص',
    localHistory: 'يُخزّن سجل المحادثة على جهازك فقط',
    badges: ['🎤 صوت', '🖼️ تحليل الصور', '🚨 كشف الطوارئ', '📄 تقارير PDF'],
  },
yo: {
  brand: 'MediLingua AI',
  tagline: 'Itọsọna ilera ni ọpọlọpọ èdè',
  title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
  intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French, Arabic, Yoruba, Igbo & Pidgin | Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
  privacy: 'A ṣe é pẹlu àṣírí ní ọkàn',
  privacyText: 'Ìtàn ìjíròrò rẹ wà ní ẹ̀rọ yìí nìkan.',
  how: 'Bí ó ṣe ń ràn ọ́ lọ́wọ́',
  stepOne: 'Ṣàpèjúwe ohun tí o ṣàkíyèsí',
  stepTwo: 'Gba àwọn ìgbésẹ̀ tí ó ṣe kedere',
  stepThree: 'Mọ ìgbà tí o yẹ kí o wá ìtọ́jú',
  assistant: 'Itọsọna ilera MediLingua',
  online: 'Iṣẹ́ ń ṣiṣẹ́',
  unavailable: 'A kò lè ṣàyẹ̀wò iṣẹ́ náà',
  checking: 'Ń ṣàyẹ̀wò iṣẹ́',
  clear: 'Nu ìjíròrò náà',
  report: 'Gba Ìròyìn gẹ́gẹ́ bí PDF',
  dashboard: 'Pátákó Dókítà',
  welcomeTitle: 'Kí ni o fẹ́ láti mọ̀?',
  welcomeText: 'Ṣàlàyé àmì àrùn, àníyàn, tàbí àwòrán tí ó ṣe kedere. MediLingua ń fún ọ ní àlàyé gbogbogbòò — kìí ṣe àyẹ̀wò àrùn.',
  prompts: ['Orí mi ti ń dun mí láti àná', 'Kí ni ó lè ràn mí lọ́wọ́ pẹ̀lú ikọ́ kékeré?', 'Èmi kò lè mí dáradára'],
  placeholder: 'Ṣàpèjúwe ohun tí o ń nírìírí…',
  attach: 'So JPG tàbí PNG mọ́',
  imageAdded: 'Àwòrán ti ṣetán láti fi ránṣẹ́',
  removeImage: 'Yọ àwòrán kúrò',
  send: 'Fi ránṣẹ́',
  characters: 'nínú 2,000',
  guidance: 'Àlàyé gbogbogbòò nìkan',
  guidanceText: 'MediLingua kìí ṣe dókítà kò sì lè ṣe àyẹ̀wò àrùn tàbí rọ́pò ìtọ́jú akọ́ṣẹ́mọṣẹ́.',
  emptySend: 'Kọ ìbéèrè tàbí so àwòrán mọ́ ná ná.',
  tooLong: 'Jọ̀wọ́ jẹ́ kí ọ̀rọ̀ rẹ kéré ju àmì 2,000 lọ.',
  invalidImage: 'Jọ̀wọ́ yan àwòrán JPG tàbí PNG tí kò tó 5 MB.',
  rateLimit: 'O ti dé òpin ìbéèrè. Jọ̀wọ́ dúró díẹ̀ kí o sì tún gbìyànjú.',
  error: 'A kò lè dé ọ̀dọ̀ MediLingua ní báyìí.',
  retry: 'Tún gbìyànjú',
  emergencyTitle: 'Jọ̀wọ́ wá ìrànlọ́wọ́ ìṣègùn kánkán',
  emergencyText: 'Èyí lè nílò ìtọ́jú lẹ́sẹ̀kẹsẹ̀. Kàn sí iṣẹ́ pàjáwìrì tàbí lọ sí ilé ìwòsàn tí ó sún mọ́ ọ.',
  emergencyFinder: 'PÀJÁWÌRÌ — Wá Ìrànlọ́wọ́ Nítòsí Rẹ',
  maps: 'Ṣí Ilé Ìwòsàn Tí Ó Sún Mọ́ ọ Nínú Google Maps',
  emergencyDisclaimer: 'Èyí jẹ́ ìkìlọ̀ àfikún, kìí ṣe àyẹ̀wò àrùn — nígbà gbogbo, pe iṣẹ́ pàjáwìrì tààrà.',
  emergencyNumbers: 'Àwọn nọ́mbà pàjáwìrì jákèjádò Nàìjíríà',
  noVoice: 'Ìbáṣepọ̀ ohùn kò ṣiṣẹ́ lórí ẹ̀rọ àwárí yìí',
  listening: 'Ń tẹ́tí sílẹ̀…',
  voiceLanguage: 'Èdè ohùn',
  imageQuestion: 'Jọ̀wọ́ ṣàyẹ̀wò àwòrán tí a so mọ́ ọ kí o sì fún mi ní àlàyé ilera gbogbogbòò.',
  loading: 'MediLingua ń gbé ìbéèrè rẹ yẹ̀ wò',
  footer: 'Fún àlàyé gbogbogbòò, kìí ṣe àyẹ̀wò àrùn',
  localHistory: 'Ìtàn ìjíròrò ni a ń fi pamọ́ sí ẹ̀rọ rẹ nìkan',
  badges: ['🎤 Ohùn', '🖼️ Ìtúpalẹ̀ Àwòrán', '🚨 Ìwádìí Pàjáwìrì', '📄 Ìròyìn PDF'],
},
ig: {
  brand: 'MediLingua AI',
  tagline: 'Ndụmọdụ ahụike n\u2019ọtụtụ asụsụ',
  title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
  intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French, Arabic, Yoruba, Igbo & Pidgin | Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
  privacy: 'Emere ka nzuzo bụrụ isi',
  privacyText: 'Akụkọ mkparịta ụka gị dịgide naanị na ngwaọrụ a.',
  how: 'Otu o si enyere aka',
  stepOne: 'Kọwaa ihe ị hụrụ',
  stepTwo: 'Nweta usoro ndị doro anya',
  stepThree: 'Mata mgbe ị ga-achọ nlekọta',
  assistant: 'Ndụmọdụ ahụike MediLingua',
  online: 'Ọrụ na-arụ ọrụ',
  unavailable: 'Enweghị ike ịlele ọrụ ahụ',
  checking: 'Na-elele ọrụ',
  clear: 'Hichapụ mkparịta ụka',
  report: 'Budata Akụkọ dịka PDF',
  dashboard: 'Dashboard Dọkịta',
  welcomeTitle: 'Kedu ihe ị chọrọ ịghọta?',
  welcomeText: 'Kọwaa mgbaàmà, nchegbu, ma ọ bụ foto doro anya. MediLingua na-enye ozi izugbe — ọ bụghị nyocha ọrịa.',
  prompts: ['Enwere m isi ọwụwa kemgbe ụnyaahụ', 'Gịnị nwere ike inyere aka na ụkwara dị nro?', 'Enweghị m ike iku ume nke ọma'],
  placeholder: 'Kọwaa ihe ị na-enwe mmetụta…',
  attach: 'Tinye JPG ma ọ bụ PNG',
  imageAdded: 'Foto adịla njikere izipụ',
  removeImage: 'Wepụ foto',
  send: 'Ziga',
  characters: 'nke 2,000',
  guidance: 'Ozi izugbe naanị',
  guidanceText: 'MediLingua abụghị dọkịta, ọ nweghịkwa ike ịchọpụta ọrịa ma ọ bụ dochie nlekọta ndị ọkachamara.',
  emptySend: 'Dee ajụjụ ma ọ bụ tinye foto ụzọ.',
  tooLong: 'Biko mee ka ozi gị dị ihe na-erughị mkpụrụedemede 2,000.',
  invalidImage: 'Biko họrọ foto JPG ma ọ bụ PNG na-erughị 5 MB.',
  rateLimit: 'Ị eruola oke arịrịọ. Biko chere obere oge wee nwaa ọzọ.',
  error: 'Anyị enweghị ike iru MediLingua ugbu a.',
  retry: 'Nwaa ọzọ',
  emergencyTitle: 'Biko chọọ enyemaka ahụike ngwa ngwa',
  emergencyText: 'Nke a nwere ike ịchọ nlekọta ozugbo. Kpọtụrụ ọrụ mberede ma ọ bụ gaa ụlọ ọgwụ mberede kacha nso.',
  emergencyFinder: 'MBEREDE — Chọta Enyemaka Nso Gị',
  maps: 'Mepee Ụlọ Ọgwụ Kacha Nso na Google Maps',
  emergencyDisclaimer: 'Nke a bụ ọkwa mgbakwunye, ọ bụghị nyocha ọrịa — kpọọ ọrụ mberede ozugbo mgbe niile.',
  emergencyNumbers: 'Nọmba mberede mba Naịjirịa',
  noVoice: 'Ntinye olu adịghị arụ ọrụ na igwe nchọgharị a',
  listening: 'Na-ege ntị…',
  voiceLanguage: 'Asụsụ olu',
  imageQuestion: 'Biko leba anya na foto e tinyere wee nye ndụmọdụ ahụike izugbe.',
  loading: 'MediLingua na-atụle ajụjụ gị',
  footer: 'Maka ozi izugbe, ọ bụghị nyocha ọrịa',
  localHistory: 'A na-echekwa akụkọ mkparịta ụka naanị na ngwaọrụ gị',
  badges: ['🎤 Olu', '🖼️ Nyocha Foto', '🚨 Nchọpụta Mberede', '📄 Akụkọ PDF'],
},
pcm: {
  brand: 'MediLingua AI',
  tagline: 'Nigeria multilingual health guide',
  title: "MediLingua AI — Nigeria's First Multilingual Healthcare Assistant",
  intro: 'Breaking Language Barriers in Healthcare | Supports Hausa, English, French, Arabic, Yoruba, Igbo & Pidgin | Voice, Image & Emergency Triage | Trusted for Rural & Urban Clinics',
  privacy: 'Na privacy dem build am for',
  privacyText: 'Your chat history dey stay for dis device only.',
  how: 'How e dey help',
  stepOne: 'Talk wetin you notice',
  stepTwo: 'Get clear next steps',
  stepThree: 'Know when to go hospital',
  assistant: 'MediLingua health guide',
  online: 'Service dey work',
  unavailable: 'We no fit check service',
  checking: 'We dey check service',
  clear: 'Clear the chat',
  report: 'Download Report as PDF',
  dashboard: 'Doctor Dashboard',
  welcomeTitle: 'Wetin you wan understand?',
  welcomeText: 'Talk symptom, wetin dey worry you, or send clear picture. MediLingua go give you general info — e no be diagnosis.',
  prompts: ['My head don dey pain me since yesterday', 'Wetin fit help small cough?', 'I no dey fit breathe well'],
  placeholder: 'Talk wetin you dey feel…',
  attach: 'Attach JPG or PNG',
  imageAdded: 'Picture don ready to send',
  removeImage: 'Remove picture',
  send: 'Send',
  characters: 'out of 2,000',
  guidance: 'Na general guidance be dis',
  guidanceText: 'MediLingua no be doctor, e no fit diagnose or replace real doctor.',
  emptySend: 'Write question or attach picture first.',
  tooLong: 'Abeg make your message no pass 2,000 characters.',
  invalidImage: 'Abeg pick JPG or PNG wey no pass 5 MB.',
  rateLimit: 'You don reach request limit. Wait small den try again.',
  error: 'We no fit reach MediLingua now now.',
  retry: 'Try again',
  emergencyTitle: 'Abeg go find urgent medical help',
  emergencyText: 'This one fit need attention sharp sharp. Call emergency service or go the nearest hospital now now.',
  emergencyFinder: 'EMERGENCY — Find Help Near You',
  maps: 'Open Nearest Hospitals for Google Maps',
  emergencyDisclaimer: 'Na extra alert be dis, e no be diagnosis — always call emergency service direct.',
  emergencyNumbers: 'Nigeria nationwide emergency numbers',
  noVoice: 'Voice input no dey work for this browser',
  listening: 'We dey listen…',
  voiceLanguage: 'Voice language',
  imageQuestion: 'Abeg check the picture wey dey attach and give general health guidance.',
  loading: 'MediLingua dey think about your question',
  footer: 'Na general info be dis, e no be diagnosis',
  localHistory: 'Chat history dey save for your device only',
  badges: ['🎤 Voice-Enabled', '🖼️ Image Analysis', '🚨 Emergency Detection', '📄 PDF Reports'],
},
} as const;

const emergencyPhrases = [
  'chest pain', 'chest hurts', 'heart attack', "can't breathe", 'cannot breathe',
  'difficulty breathing', 'shortness of breath', 'bleeding a lot', 'heavy bleeding',
  'unconscious', 'stroke', 'suicidal', 'ciwon kirji', 'kirji na ciwo',
  'ba zan iya numfashi ba', 'wahalar numfashi', 'zubar jini mai yawa', 'suma',
  'bugun jini', 'ciwon zuciya', 'douleur thoracique', 'j’ai mal à la poitrine',
  'je ne peux pas respirer', 'difficulté à respirer', 'essoufflement',
  'saignement abondant', 'saigne beaucoup', 'inconscient', 'avc', 'crise cardiaque',
  'ألم في الصدر', 'صدري يؤلمني', 'لا أستطيع التنفس', 'صعوبة في التنفس',
  'ضيق التنفس', 'نزيف حاد', 'ينزف كثيرًا', 'فقدان الوعي', 'سكتة دماغية',
  'نوبة قلبية',  'irora àyà', 'mi o le mi', 'mgbu obi', 'enweghị m ike iku ume', 'chest dey pain me', 'i no fit breathe', 'blood dey comot well well',
];

function readHistory(): Message[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Message[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function detectEmergency(text: string) {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  return emergencyPhrases.some((phrase) => normalized.includes(phrase));
}

function getErrorStatus(error: unknown) {
  const candidate = error as { status?: number; response?: { status?: number }; message?: string };
  return candidate?.status ?? candidate?.response?.status ?? (candidate?.message?.includes('429') ? 429 : undefined);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

type EmergencyCopy = {
  emergencyFinder: string;
  emergencyText: string;
  maps: string;
  emergencyNumbers: string;
  emergencyDisclaimer: string;
};

function EmergencyFinder({ t }: { t: EmergencyCopy }) {
  return (
    <section className="emergency-finder" role="alert">
      <div className="emergency-finder-heading">
        <span className="emergency-symbol"><AlertTriangle size={19} /></span>
        <div>
          <strong>{t.emergencyFinder}</strong>
          <p>{t.emergencyText}</p>
        </div>
      </div>
      <a className="maps-button" href="https://www.google.com/maps/search/hospital+near+me/" target="_blank" rel="noreferrer">
        <MapPin size={16} />
        {t.maps}
        <LinkIcon size={14} />
      </a>
      <div className="emergency-numbers">
        <span>{t.emergencyNumbers}</span>
        <a href="tel:112"><b>112</b><small>National Emergency</small></a>
        <a href="tel:199"><b>199</b><small>Police</small></a>
      </div>
      <p className="emergency-disclaimer"><Info size={13} /> {t.emergencyDisclaimer}</p>
    </section>
  );
}

function Home() {
  const [language, setLanguage] = useState<Language>('en');
  const [voiceLanguage, setVoiceLanguage] = useState('en-US');
  const [draft, setDraft] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(readHistory);
  const [notice, setNotice] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [lastRequest, setLastRequest] = useState<ChatRequest | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && 'webkitSpeechRecognition' in window);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const t = copy[language];
  const isArabic = language === 'ar';
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), staleTime: 30_000, retry: 1 },
  });
  const sendMessage = useSendChatMessage();
  const hasEmergency = messages.some((message) => message.emergency);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sendMessage.isPending]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setNotice(t.invalidImage);
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(typeof reader.result === 'string' ? reader.result : null);
      setNotice('');
    };
    reader.readAsDataURL(file);
  };

  const startListening = async () => {
    if (!voiceSupported) return;
    
const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
const audioChunksRef = React.useRef<Blob[]>([]);

const startVoiceInput = async () => {
  try {
    // Use phone's own voice - 100% FREE, works for Hausa/Yoruba/Igbo/Pidgin accent
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setNotice('Voice not supported on this browser - try Chrome'); return; }
    const recog = new SR();
    // en-NG understands Nigerian English + Pidgin + code-switch
    recog.lang = 'en-NG';
    recog.continuous = false;
    recog.interimResults = false;
    recog.onstart = () => { setIsListening(true); setNotice('🎤 Listening... speak in any language'); };
    recog.onresult = (e:any) => { const text = e.results[0][0].transcript; setInput(text); setNotice('✅ Check text then press Tura'); };
    recog.onerror = (e:any) => { console.log(e); setNotice('Mic error - try again'); setIsListening(false); };
    recog.onend = () => { setIsListening(false); };
    recog.start();
    (window as any)._recog = recog;
  } catch(err){ setNotice('Mic permission denied'); }
};

const stopVoiceInput = () => {
  try { (window as any)._recog?.stop(); } catch{}
  setIsListening(false); setNotice('');
};
// alias for old names
const startListening = startVoiceInput;
const stopListening = stopVoiceInput;
const startVoice = startVoiceInput;
const stopVoice = stopVoiceInput;


      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      setNotice('Voice input could not start. Please check microphone permission.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const sendRequest = (request: ChatRequest, addUserMessage: boolean) => {
    setSubmissionError('');
    setNotice('');
    setLastRequest(request);
    const requestIsEmergency = detectEmergency(request.message);
    if (addUserMessage) {
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          text: request.message,
          image: request.image,
          emergency: requestIsEmergency,
          lang: request.lang,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
 sendMessage.mutate(
      { data: request },
      {
        onSuccess: (response) => {
          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              text: response.reply,
              emergency: response.is_emergency || requestIsEmergency,
              lang: request.lang,
              createdAt: new Date().toISOString(),
            },
          ]);
        },
        onError: (error) => setSubmissionError(getErrorStatus(error) === 429 ? t.rateLimit : t.error),
      },
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message && !imageData) {
      setNotice(t.emptySend);
      return;
    }
    if (message.length > 2000) {
      setNotice(t.tooLong);
      return;
    }
    const request: ChatRequest = { message: message || t.imageQuestion, lang: language, image: imageData };
    setDraft('');
    setImageData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    sendRequest(request, true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setSubmissionError('');
    setNotice('');
    setLastRequest(null);
    localStorage.removeItem(HISTORY_KEY);
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    const margin = 16;
    const width = 178;
    let y = 18;
    doc.setTextColor(29, 102, 95);
    doc.setFontSize(20);
    doc.text('MediLingua AI', margin, y);
    y += 8;
    doc.setTextColor(70, 80, 82);
    doc.setFontSize(9);
    doc.text(`Conversation report · ${new Date().toLocaleString()}`, margin, y);
    y += 12;
    messages.forEach((message) => {
      const label = `${message.role === 'user' ? 'You' : 'MediLingua'} · ${formatDate(message.createdAt)}`;
      doc.setTextColor(message.role === 'user' ? 31 : 29, message.role === 'user' ? 57 : 102, message.role === 'user' ? 66 : 95);
      doc.setFontSize(10);
      doc.text(label, margin, y);
      y += 5;
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(message.text, width) as string[];
      lines.forEach((line) => {
        if (y > 270) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, margin, y);
        y += 5;
      });
      y += 5;
    });
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setDrawColor(47, 143, 130);
    doc.line(margin, y, 194, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Medical disclaimer: This report provides general information only, not a diagnosis or substitute for professional care.', margin, y, { maxWidth: width });
    doc.save(`medilingua-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const serviceState = health.isPending ? 'checking' : health.isError ? 'unavailable' : 'online';
  const serviceLabel = serviceState === 'checking' ? t.checking : serviceState === 'unavailable' ? t.unavailable : t.online;

  return (
    <div className={`health-app ${isArabic ? 'is-rtl' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <div className="brand-lockup" data-testid="text-brand">
          <span className="brand-mark" aria-hidden="true"><HeartPulse size={20} strokeWidth={2.2} /></span>
          <span><strong>{t.brand}</strong><small>{t.tagline}</small></span>
        </div>
        <div className="topbar-center"><span className={`service-dot ${serviceState}`} /><span data-testid="status-service">{serviceLabel}</span></div>
        <div className="topbar-actions">
          <Link className="dashboard-link" href="/dashboard"><BarChart3 size={15} /> {t.dashboard}</Link>
          <div className="language-control">
            <label htmlFor="language-select" className="sr-only">Language</label>
            <Languages size={15} />
            <select id="language-select" value={language} onChange={(event) => setLanguage(event.target.value as Language)} data-testid="select-language">
              {languages.map((item) => <option key={item.code} value={item.code}>{item.native} · {item.label}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="guide-panel">
          <div className="guide-orbit" aria-hidden="true"><span /><span /><span /><Stethoscope size={45} strokeWidth={1.3} /></div>
          <div className="guide-copy">
            <p className="eyebrow"><Sparkles size={13} /> {t.privacy}</p>
            <h1 data-testid="text-page-title">{t.title}</h1>
            <p className="intro-text">{t.intro}</p>
            <div className="feature-badges">{t.badges.map((badge) => <span key={badge}>{badge}</span>)}</div>
          </div>
          <div className="guide-rule" />
          <section className="how-section" aria-labelledby="how-title">
            <p className="section-label" id="how-title">{t.how}</p>
            <ol className="step-list">{[t.stepOne, t.stepTwo, t.stepThree].map((step, index) => <li key={step}><span className="step-number">0{index + 1}</span><span>{step}</span></li>)}</ol>
          </section>
          <div className="privacy-note"><ShieldCheck size={17} /><div><strong>{t.privacy}</strong><p>{t.privacyText}</p></div></div>
          <p className="guide-footnote">{t.footer}</p>
        </aside>

        <section className="chat-card" aria-label={t.assistant}>
          <div className="chat-card-header">
            <div className="assistant-identity"><span className="assistant-avatar"><HeartPulse size={19} /></span><div><h2>{t.assistant}</h2><span className="assistant-status"><span className="status-pulse" /> {t.online}</span></div></div>
            <div className="header-actions">
              <button type="button" className="header-action-button" onClick={downloadReport} disabled={!messages.length} title={t.report}><Download size={14} /><span>{t.report}</span></button>
              <button type="button" className="clear-button" onClick={clearConversation} data-testid="button-clear-conversation"><RefreshCcw size={14} /><span>{t.clear}</span></button>
            </div>
          </div>

          <div className="conversation" data-testid="region-conversation">
            {messages.length === 0 ? (
              <div className="empty-state" data-testid="empty-conversation">
                <div className="empty-icon"><HeartPulse size={24} /></div>
                <p className="empty-kicker">{t.assistant}</p>
                <h3>{t.welcomeTitle}</h3>
                <p>{t.welcomeText}</p>
                <div className="prompt-list">{t.prompts.map((prompt, index) => <button key={prompt} type="button" className="prompt-chip" onClick={() => setDraft(prompt)} data-testid={`button-prompt-${index}`}><span>{prompt}</span><ArrowUp size={14} /></button>)}</div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <article className={`message-row ${message.role === 'user' ? 'from-user' : 'from-assistant'}`} key={message.id} data-testid={`message-${message.role}-${message.id}`}>
                    {message.role === 'assistant' && <span className="message-avatar"><HeartPulse size={15} /></span>}
                    <div className="message-column">
                      <div className={`message-bubble ${message.emergency ? 'emergency-bubble' : ''}`}>
                        {message.image && <img className="message-image" src={message.image} alt={t.imageAdded} />}
                        <p data-testid={`text-message-${message.id}`}>{message.text}</p>
                      </div>
                      {message.emergency && <div className="emergency-note"><CircleAlert size={16} /><div><strong>{t.emergencyTitle}</strong><span>{t.emergencyText}</span></div></div>}
                    </div>
                  </article>
                ))}
                {sendMessage.isPending && <article className="message-row from-assistant" data-testid="status-loading"><span className="message-avatar"><HeartPulse size={15} /></span><div className="message-column"><div className="message-bubble loading-bubble"><span className="loading-label">{t.loading}</span><span className="skeleton-line wide" /><span className="skeleton-line short" /></div></div></article>}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {hasEmergency && <EmergencyFinder t={t} />}
          {submissionError && <div className="error-banner" role="alert" data-testid="alert-send-error"><CircleAlert size={17} /><span>{submissionError}</span>{lastRequest && <button type="button" onClick={() => sendRequest(lastRequest, false)} data-testid="button-retry">{t.retry}</button>}</div>}
          {notice && <div className="notice-line" role="status" data-testid="status-composer-notice"><Info size={15} /><span>{notice}</span></div>}

          <form className="composer" onSubmit={handleSubmit}>
            {imageData && <div className="attachment-preview" data-testid="preview-image"><img src={imageData} alt={t.imageAdded} /><span>{t.imageAdded}</span><button type="button" onClick={() => { setImageData(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label={t.removeImage}><X size={14} /></button></div>}
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={t.placeholder} maxLength={2000} rows={2} aria-label={t.placeholder} data-testid="input-message" />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleImage} className="sr-only" data-testid="input-image" />
                <button type="button" className="tool-button" onClick={() => fileInputRef.current?.click()} aria-label={t.attach}><Paperclip size={17} /><span>{t.attach}</span></button>
                {voiceSupported ? (
                  <div className={`voice-control ${isListening ? 'is-listening' : ''}`}>
                    <button type="button" className="mic-button" onClick={isListening ? stopListening : startListening} aria-label={isListening ? t.listening : 'Start voice input'}><Mic size={16} /><span>{isListening ? t.listening : '🎤'}</span></button>
                    <label htmlFor="voice-language" className="sr-only">{t.voiceLanguage}</label>
                    <select id="voice-language" value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)} aria-label={t.voiceLanguage}>{speechLocales.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}</select>
                  </div>
                ) : <span className="voice-unsupported"><Mic size={14} /> {t.noVoice}</span>}
                <span className="character-count" data-testid="text-character-count">{draft.length} {t.characters}</span>
              </div>
              <button type="submit" className="send-button" disabled={sendMessage.isPending || (!draft.trim() && !imageData)} data-testid="button-send-message"><span>{t.send}</span><ArrowUp size={16} /></button>
            </div>
          </form>
          <div className="card-disclaimer"><Info size={13} /><span><strong>{t.guidance}</strong> · {t.guidanceText}</span></div>
          <p className="local-history-note"><ShieldCheck size={12} /> {t.localHistory}</p>
        </section>
      </main>
      <footer className="mobile-footer"><Check size={14} /><span>{t.privacy}</span><span className="footer-separator">·</span><span>{t.footer}</span></footer>
    </div>
  );
}

function Dashboard() {
  // This password gate is intentionally client-side for the demo; it is not production-grade security.
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Message[]>(readHistory);
  const t = copy.en;
  const today = new Date().toDateString();
  const todayMessages = history.filter((message) => new Date(message.createdAt).toDateString() === today);
  const userMessages = history.filter((message) => message.role === 'user');
  const emergencyCount = history.filter((message) => message.role === 'user' && message.emergency).length;
  const distribution = languages.map((item) => ({ ...item, count: userMessages.filter((message) => message.lang === item.code).length }));
  const maxLanguageCount = Math.max(1, ...distribution.map((item) => item.count));

  if (!unlocked) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-gate">
          <span className="gate-icon"><LockKeyhole size={24} /></span>
          <p className="eyebrow">MediLingua AI · Private dashboard</p>
          <h1>Doctor dashboard</h1>
          <p>Review local demo metrics from this device. No chat data leaves your browser.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (password === DASHBOARD_PASSWORD) { setUnlocked(true); setError(''); } else setError('Incorrect demo password.'); }}>
            <label htmlFor="dashboard-password">Dashboard password</label>
            <input id="dashboard-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            <button type="submit" className="dashboard-primary">Unlock dashboard</button>
          </form>
          {error && <p className="dashboard-error" role="alert">{error}</p>}
          <Link className="back-link" href="/"><ArrowUp size={14} /> Back to assistant</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header"><div className="brand-lockup"><span className="brand-mark"><HeartPulse size={20} /></span><span><strong>MediLingua AI</strong><small>Doctor dashboard</small></span></div><Link className="back-link" href="/"><ArrowUp size={14} /> Back to assistant</Link></header>
      <main className="dashboard-main">
        <div className="dashboard-intro"><div><p className="eyebrow"><Activity size={13} /> Local care overview</p><h1>Clinic pulse</h1><p>Conversation activity from this device, refreshed when you open the dashboard.</p></div><button type="button" className="dashboard-refresh" onClick={() => setHistory(readHistory)}><RefreshCcw size={15} /> Refresh</button></div>
        <section className="metric-grid"><div className="metric-card"><span>Chats today</span><strong>{todayMessages.filter((message) => message.role === 'user').length}</strong><small>Questions received today</small></div><div className="metric-card metric-alert"><span>Emergency cases</span><strong>{emergencyCount}</strong><small>Cases flagged in local history</small></div><div className="metric-card"><span>Total messages</span><strong>{history.length}</strong><small>Stored on this device</small></div></section>
        <div className="dashboard-grid">
          <section className="dashboard-card"><div className="dashboard-card-title"><h2>Language distribution</h2><Languages size={18} /></div><p className="dashboard-muted">Questions by selected assistant language</p><div className="language-bars">{distribution.map((item) => <div className="language-bar-row" key={item.code}><div><span>{item.label}</span><b>{item.count}</b></div><div className="bar-track"><span style={{ width: `${(item.count / maxLanguageCount) * 100}%` }} /></div></div>)}</div></section>
          <section className="dashboard-card"><div className="dashboard-card-title"><h2>Recent chats</h2><FileText size={18} /></div><p className="dashboard-muted">Latest questions saved locally</p><div className="recent-chats">{userMessages.slice(-8).reverse().map((message) => <article key={message.id}><span className="recent-chat-icon"><Stethoscope size={15} /></span><div><strong>{message.text}</strong><small>{languages.find((item) => item.code === message.lang)?.label} · {formatDate(message.createdAt)}</small></div>{message.emergency && <AlertTriangle className="recent-alert" size={15} />}</article>)}{!userMessages.length && <p className="empty-dashboard">No chats saved yet.</p>}</div></section>
        </div>
        <p className="dashboard-note"><ShieldCheck size={14} /> Local demo dashboard only. Chat history is stored locally on your device.</p>
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;