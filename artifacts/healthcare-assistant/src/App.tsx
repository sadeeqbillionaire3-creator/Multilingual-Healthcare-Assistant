import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  HeartPulse,
  Info,
  Menu,
  Paperclip,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  getHealthCheckQueryKey,
  useHealthCheck,
  useSendChatMessage,
} from '@workspace/api-client-react';
import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type Language = 'en' | 'ha' | 'fr' | 'ar';
type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  image?: string | null;
  emergency?: boolean;
};
type ChatRequest = {
  message: string;
  lang: Language;
  image: string | null;
};

const languages: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'EN' },
  { code: 'ha', label: 'Hausa', native: 'HA' },
  { code: 'fr', label: 'Français', native: 'FR' },
  { code: 'ar', label: 'العربية', native: 'AR' },
];

const copy = {
  en: {
    brand: 'Sannu',
    tagline: 'A calm first stop for your health.',
    title: 'Let’s make sense of what you’re feeling.',
    intro:
      'Share a symptom, a concern, or a clear photo. Sannu offers general health information in plain language — never a diagnosis.',
    privacy: 'Private by design',
    privacyText: 'Your conversation is only used to answer this question.',
    how: 'How Sannu helps',
    stepOne: 'Describe what you notice',
    stepTwo: 'Get clear next steps',
    stepThree: 'Know when to seek care',
    assistant: 'Sannu health guide',
    online: 'Service available',
    unavailable: 'Service check unavailable',
    checking: 'Checking service',
    clear: 'Clear conversation',
    welcomeTitle: 'What would you like to understand?',
    welcomeText:
      'You can write in your preferred language. Add a JPG or PNG when a visual detail would help.',
    prompts: [
      'I have had a headache since yesterday',
      'What can help with a mild cough?',
      'I noticed a change on my skin',
    ],
    placeholder: 'Describe what you’re experiencing…',
    attach: 'Attach JPG or PNG',
    imageAdded: 'Image ready to share',
    removeImage: 'Remove image',
    send: 'Send',
    characters: 'of 2,000',
    guidance: 'General guidance only',
    guidanceText: 'Sannu is not a doctor and cannot diagnose or replace professional care.',
    emptySend: 'Write a question or attach an image first.',
    tooLong: 'Please keep your message under 2,000 characters.',
    invalidImage: 'Please choose a JPG or PNG image under 5 MB.',
    rateLimit: 'You have reached the request limit. Please wait a moment and try again.',
    error: 'We could not reach Sannu just now.',
    retry: 'Try again',
    emergencyTitle: 'Please seek urgent medical help',
    emergencyText:
      'This may need immediate attention. Contact your local emergency service or go to the nearest emergency department now.',
    imageQuestion: 'Please review the attached image and share general health guidance.',
    loading: 'Sannu is considering your question',
    footer: 'For general information, not diagnosis',
  },
  ha: {
    brand: 'Sannu',
    tagline: 'Tashar farko mai kwantar da hankali don lafiyarka.',
    title: 'Mu fahimci abin da kake ji tare.',
    intro:
      'Bayyana alama, damuwa, ko tura hoto mai kyau. Sannu yana ba da bayani na kiwon lafiya gabaɗaya — ba ganewar asali ba.',
    privacy: 'An tsara shi da sirri',
    privacyText: 'Ana amfani da hirarka ne kawai don amsa wannan tambayar.',
    how: 'Yadda Sannu ke taimakawa',
    stepOne: 'Bayyana abin da ka lura',
    stepTwo: 'Samun matakai masu sauƙi',
    stepThree: 'San lokacin neman kulawa',
    assistant: 'Jagoran lafiyar Sannu',
    online: 'Sabis yana aiki',
    unavailable: 'Ba a samu duba sabis ba',
    checking: 'Ana duba sabis',
    clear: 'Share hira',
    welcomeTitle: 'Me kake son fahimta?',
    welcomeText: 'Rubuta da harshen da ka fi so. Ƙara JPG ko PNG idan hoto zai taimaka.',
    prompts: ['Ina fama da ciwon kai tun jiya', 'Me zai taimaka wa tari mai sauƙi?', 'Na lura da canji a fata ta'],
    placeholder: 'Bayyana abin da kake ji…',
    attach: 'Tura JPG ko PNG',
    imageAdded: 'An shirya hoton',
    removeImage: 'Cire hoto',
    send: 'Tura',
    characters: 'na 2,000',
    guidance: 'Bayani na gabaɗaya kawai',
    guidanceText: 'Sannu ba likita ba ne, kuma ba zai iya gano cuta ko maye gurbin kulawar ƙwararre ba.',
    emptySend: 'Rubuta tambaya ko tura hoto da farko.',
    tooLong: 'Don Allah ka rage saƙonka zuwa haruffa 2,000.',
    invalidImage: 'Zaɓi hoton JPG ko PNG da bai wuce 5 MB ba.',
    rateLimit: 'An kai iyakar buƙatu. Jira kaɗan sannan ka sake gwadawa.',
    error: 'Ba mu iya samun Sannu ba a yanzu.',
    retry: 'Sake gwadawa',
    emergencyTitle: 'Don Allah ka nemi taimakon gaggawa',
    emergencyText: 'Wannan na iya buƙatar kulawa nan take. Kira sabis ɗin gaggawa na yankinka ko je asibitin gaggawa mafi kusa.',
    imageQuestion: 'Don Allah ka duba hoton da aka tura ka ba da bayani na lafiyar gabaɗaya.',
    loading: 'Sannu yana nazarin tambayarka',
    footer: 'Don bayani na gabaɗaya, ba ganewar asali ba',
  },
  fr: {
    brand: 'Sannu',
    tagline: 'Un premier repère calme pour votre santé.',
    title: 'Mettons des mots sur ce que vous ressentez.',
    intro:
      'Partagez un symptôme, une inquiétude ou une photo nette. Sannu donne des informations générales en langage simple — jamais un diagnostic.',
    privacy: 'Pensé pour votre confidentialité',
    privacyText: 'Votre conversation sert uniquement à répondre à cette question.',
    how: 'Comment Sannu aide',
    stepOne: 'Décrivez ce que vous remarquez',
    stepTwo: 'Recevez des étapes claires',
    stepThree: 'Sachez quand consulter',
    assistant: 'Guide santé Sannu',
    online: 'Service disponible',
    unavailable: 'Vérification indisponible',
    checking: 'Vérification en cours',
    clear: 'Effacer la conversation',
    welcomeTitle: 'Que souhaitez-vous comprendre ?',
    welcomeText: 'Écrivez dans votre langue préférée. Ajoutez un JPG ou PNG si une image peut aider.',
    prompts: ['J’ai mal à la tête depuis hier', 'Que faire pour une toux légère ?', 'J’ai remarqué un changement sur ma peau'],
    placeholder: 'Décrivez ce que vous ressentez…',
    attach: 'Joindre un JPG ou PNG',
    imageAdded: 'Image prête à envoyer',
    removeImage: 'Retirer l’image',
    send: 'Envoyer',
    characters: 'sur 2 000',
    guidance: 'Informations générales uniquement',
    guidanceText: 'Sannu n’est pas un médecin et ne peut pas poser de diagnostic ni remplacer un professionnel.',
    emptySend: 'Écrivez une question ou joignez une image.',
    tooLong: 'Votre message doit rester sous 2 000 caractères.',
    invalidImage: 'Choisissez une image JPG ou PNG de moins de 5 Mo.',
    rateLimit: 'La limite de demandes est atteinte. Patientez un instant puis réessayez.',
    error: 'Sannu est momentanément inaccessible.',
    retry: 'Réessayer',
    emergencyTitle: 'Veuillez demander une aide médicale urgente',
    emergencyText: 'Cela peut nécessiter une attention immédiate. Appelez les urgences locales ou rendez-vous au service d’urgence le plus proche.',
    imageQuestion: 'Analysez cette image et donnez-moi des informations générales de santé.',
    loading: 'Sannu réfléchit à votre question',
    footer: 'Informations générales, pas un diagnostic',
  },
  ar: {
    brand: 'Sannu',
    tagline: 'خطوة أولى هادئة لصحتك.',
    title: 'لنفهم معًا ما تشعر به.',
    intro: 'شارك عرضًا أو قلقًا أو صورة واضحة. يقدم Sannu معلومات صحية عامة بلغة بسيطة — وليس تشخيصًا.',
    privacy: 'الخصوصية أولًا',
    privacyText: 'تُستخدم محادثتك فقط للإجابة عن هذا السؤال.',
    how: 'كيف يساعد Sannu',
    stepOne: 'صف ما تلاحظه',
    stepTwo: 'احصل على خطوات واضحة',
    stepThree: 'اعرف متى تطلب الرعاية',
    assistant: 'مرشد Sannu الصحي',
    online: 'الخدمة متاحة',
    unavailable: 'تعذر التحقق من الخدمة',
    checking: 'جارٍ التحقق من الخدمة',
    clear: 'مسح المحادثة',
    welcomeTitle: 'ما الذي تريد فهمه؟',
    welcomeText: 'اكتب بلغتك المفضلة. أضف صورة JPG أو PNG عندما تساعد التفاصيل المرئية.',
    prompts: ['أعاني من صداع منذ أمس', 'ما الذي يساعد في تخفيف السعال البسيط؟', 'لاحظت تغيرًا في بشرتي'],
    placeholder: 'صف ما تشعر به…',
    attach: 'إرفاق JPG أو PNG',
    imageAdded: 'الصورة جاهزة للمشاركة',
    removeImage: 'إزالة الصورة',
    send: 'إرسال',
    characters: 'من 2,000',
    guidance: 'إرشادات عامة فقط',
    guidanceText: 'Sannu ليس طبيبًا ولا يستطيع التشخيص أو استبدال الرعاية المتخصصة.',
    emptySend: 'اكتب سؤالك أو أرفق صورة أولًا.',
    tooLong: 'يرجى إبقاء رسالتك أقل من 2,000 حرف.',
    invalidImage: 'يرجى اختيار صورة JPG أو PNG بحجم أقل من 5 ميغابايت.',
    rateLimit: 'لقد وصلت إلى حد الطلبات. انتظر قليلًا ثم حاول مرة أخرى.',
    error: 'تعذر الوصول إلى Sannu الآن.',
    retry: 'إعادة المحاولة',
    emergencyTitle: 'يرجى طلب المساعدة الطبية العاجلة',
    emergencyText: 'قد تحتاج هذه الحالة إلى عناية فورية. اتصل بخدمات الطوارئ المحلية أو توجه إلى أقرب قسم طوارئ.',
    imageQuestion: 'يرجى مراجعة الصورة المرفقة وتقديم إرشادات صحية عامة.',
    loading: 'يفكر Sannu في سؤالك',
    footer: 'للمعلومات العامة، وليس للتشخيص',
  },
} as const;

function getErrorStatus(error: unknown) {
  const candidate = error as { status?: number; response?: { status?: number }; message?: string };
  return candidate?.status ?? candidate?.response?.status ?? (candidate?.message?.includes('429') ? 429 : undefined);
}

function Home() {
  const [language, setLanguage] = useState<Language>('en');
  const [draft, setDraft] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [lastRequest, setLastRequest] = useState<ChatRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = copy[language];
  const isArabic = language === 'ar';
  const health = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      staleTime: 30_000,
      retry: 1,
    },
  });
  const sendMessage = useSendChatMessage();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sendMessage.isPending]);

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

  const sendRequest = (request: ChatRequest, addUserMessage: boolean) => {
    setSubmissionError('');
    setNotice('');
    setLastRequest(request);
    if (addUserMessage) {
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          text: request.message,
          image: request.image,
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
              emergency: response.is_emergency,
            },
          ]);
        },
        onError: (error) => {
          setSubmissionError(getErrorStatus(error) === 429 ? t.rateLimit : t.error);
        },
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
    const request: ChatRequest = {
      message: message || t.imageQuestion,
      lang: language,
      image: imageData,
    };
    setDraft('');
    setImageData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    sendRequest(request, true);
  };

  const handlePrompt = (prompt: string) => {
    setDraft(prompt);
    setNotice('');
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
  };

  const serviceState = health.isPending ? 'checking' : health.isError ? 'unavailable' : 'online';
  const serviceLabel =
    serviceState === 'checking' ? t.checking : serviceState === 'unavailable' ? t.unavailable : t.online;

  return (
    <div className={`health-app ${isArabic ? 'is-rtl' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <div className="brand-lockup" data-testid="text-brand">
          <span className="brand-mark" aria-hidden="true">
            <HeartPulse size={20} strokeWidth={2.2} />
          </span>
          <span>
            <strong>{t.brand}</strong>
            <small>{t.tagline}</small>
          </span>
        </div>
        <div className="topbar-center">
          <span className={`service-dot ${serviceState}`} />
          <span data-testid="status-service">{serviceLabel}</span>
        </div>
        <div className="language-control">
          <Menu className="mobile-menu-icon" size={17} aria-hidden="true" />
          <label htmlFor="language-select" className="sr-only">Language</label>
          <select
            id="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            data-testid="select-language"
          >
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.native} · {item.label}
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </header>

      <main className="workspace">
        <aside className="guide-panel">
          <div className="guide-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
            <Stethoscope size={45} strokeWidth={1.3} />
          </div>
          <div className="guide-copy">
            <p className="eyebrow"><Sparkles size={13} /> {t.privacy}</p>
            <h1 data-testid="text-page-title">{t.title}</h1>
            <p className="intro-text">{t.intro}</p>
          </div>
          <div className="guide-rule" />
          <section className="how-section" aria-labelledby="how-title">
            <p className="section-label" id="how-title">{t.how}</p>
            <ol className="step-list">
              {[t.stepOne, t.stepTwo, t.stepThree].map((step, index) => (
                <li key={step}>
                  <span className="step-number">0{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <div>
              <strong>{t.privacy}</strong>
              <p>{t.privacyText}</p>
            </div>
          </div>
          <p className="guide-footnote">{t.footer}</p>
        </aside>

        <section className="chat-card" aria-label={t.assistant}>
          <div className="chat-card-header">
            <div className="assistant-identity">
              <span className="assistant-avatar"><HeartPulse size={19} /></span>
              <div>
                <h2>{t.assistant}</h2>
                <span className="assistant-status"><span className="status-pulse" /> {t.online}</span>
              </div>
            </div>
            <button
              type="button"
              className="clear-button"
              onClick={clearConversation}
              data-testid="button-clear-conversation"
            >
              <RefreshCcw size={14} />
              <span>{t.clear}</span>
            </button>
          </div>

          <div className="conversation" data-testid="region-conversation">
            {messages.length === 0 ? (
              <div className="empty-state" data-testid="empty-conversation">
                <div className="empty-icon"><HeartPulse size={24} /></div>
                <p className="empty-kicker">{t.assistant}</p>
                <h3>{t.welcomeTitle}</h3>
                <p>{t.welcomeText}</p>
                <div className="prompt-list">
                  {t.prompts.map((prompt, index) => (
                    <button
                      key={prompt}
                      type="button"
                      className="prompt-chip"
                      onClick={() => handlePrompt(prompt)}
                      data-testid={`button-prompt-${index}`}
                    >
                      <span>{prompt}</span>
                      <ArrowUp size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <article
                    className={`message-row ${message.role === 'user' ? 'from-user' : 'from-assistant'}`}
                    key={message.id}
                    data-testid={`message-${message.role}-${message.id}`}
                  >
                    {message.role === 'assistant' && (
                      <span className="message-avatar"><HeartPulse size={15} /></span>
                    )}
                    <div className="message-column">
                      <div className={`message-bubble ${message.emergency ? 'emergency-bubble' : ''}`}>
                        {message.image && (
                          <img className="message-image" src={message.image} alt="Uploaded health reference" />
                        )}
                        <p data-testid={`text-message-${message.id}`}>{message.text}</p>
                      </div>
                      {message.emergency && (
                        <div className="emergency-note" data-testid={`alert-emergency-${message.id}`}>
                          <CircleAlert size={16} />
                          <div>
                            <strong>{t.emergencyTitle}</strong>
                            <span>{t.emergencyText}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                {sendMessage.isPending && (
                  <article className="message-row from-assistant" data-testid="status-loading">
                    <span className="message-avatar"><HeartPulse size={15} /></span>
                    <div className="message-column">
                      <div className="message-bubble loading-bubble">
                        <span className="loading-label">{t.loading}</span>
                        <span className="skeleton-line wide" />
                        <span className="skeleton-line short" />
                      </div>
                    </div>
                  </article>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {submissionError && (
            <div className="error-banner" role="alert" data-testid="alert-send-error">
              <CircleAlert size={17} />
              <span>{submissionError}</span>
              {lastRequest && (
                <button
                  type="button"
                  onClick={() => sendRequest(lastRequest, false)}
                  data-testid="button-retry"
                >
                  {t.retry}
                </button>
              )}
            </div>
          )}
          {notice && (
            <div className="notice-line" role="status" data-testid="status-composer-notice">
              <Info size={15} />
              <span>{notice}</span>
            </div>
          )}

          <form className="composer" onSubmit={handleSubmit}>
            {imageData && (
              <div className="attachment-preview" data-testid="preview-image">
                <img src={imageData} alt={t.imageAdded} />
                <span>{t.imageAdded}</span>
                <button
                  type="button"
                  onClick={() => {
                    setImageData(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  aria-label={t.removeImage}
                  data-testid="button-remove-image"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.placeholder}
              maxLength={2000}
              rows={2}
              aria-label={t.placeholder}
              data-testid="input-message"
            />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleImage}
                  className="sr-only"
                  data-testid="input-image"
                />
                <button
                  type="button"
                  className="tool-button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t.attach}
                  data-testid="button-attach-image"
                >
                  <Paperclip size={17} />
                  <span>{t.attach}</span>
                </button>
                <span className="character-count" data-testid="text-character-count">
                  {draft.length} {t.characters}
                </span>
              </div>
              <button
                type="submit"
                className="send-button"
                disabled={sendMessage.isPending || (!draft.trim() && !imageData)}
                data-testid="button-send-message"
              >
                <span>{t.send}</span>
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
          <div className="card-disclaimer">
            <Info size={13} />
            <span><strong>{t.guidance}</strong> · {t.guidanceText}</span>
          </div>
        </section>
      </main>
      <footer className="mobile-footer">
        <Check size={14} />
        <span>{t.privacy}</span>
        <span className="footer-separator">·</span>
        <span>{t.footer}</span>
      </footer>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
