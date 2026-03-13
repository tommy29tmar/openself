// src/lib/agent/greeting.ts

/**
 * Server-computed dynamic greeting — zero LLM, zero latency.
 *
 * Deterministic template strings based on journey state, user context,
 * and active situations. First_visit is always hardcoded to guarantee
 * the onboarding funnel asks for the user's name.
 */

import type { JourneyState, Situation } from "@/lib/agent/journey";

export interface GreetingContext {
  journeyState: JourneyState;
  language: string;
  userName: string | null;
  lastSeenDaysAgo: number | null;
  situations: Situation[];
}

type L10n = Record<string, string>;

// ---------------------------------------------------------------------------
// First visit — hardcoded, deterministic (must ask name)
// ---------------------------------------------------------------------------

const FIRST_VISIT: L10n = {
  en: "Hi! I create personal pages from a conversation. What's your name?",
  it: "Ciao! Creo pagine personali partendo da una conversazione. Come ti chiami?",
  de: "Hallo! Ich erstelle persönliche Seiten aus einem Gespräch. Wie heißt du?",
  fr: "Salut\u00a0! Je crée des pages personnelles à partir d\u2019une conversation. Comment tu t\u2019appelles\u00a0?",
  es: "¡Hola! Creo páginas personales a partir de una conversación. ¿Cómo te llamas?",
  pt: "Olá! Crio páginas pessoais a partir de uma conversa. Como te chamas?",
  ja: "こんにちは！会話からパーソナルページを作ります。お名前は？",
  zh: "你好！我通过对话创建个人页面。你叫什么名字？",
};

// ---------------------------------------------------------------------------
// Blocked — limit reached
// ---------------------------------------------------------------------------

const BLOCKED: L10n = {
  en: "You've reached the message limit. Pick a username to publish your page!",
  it: "Hai esaurito i messaggi. Scegli un username per pubblicare la tua pagina!",
  de: "Du hast alle Nachrichten verbraucht. Wähle einen Benutzernamen, um deine Seite zu veröffentlichen!",
  fr: "Tu as utilisé tous tes messages. Choisis un nom d\u2019utilisateur pour publier ta page\u00a0!",
  es: "¡Has usado todos tus mensajes! Elige un nombre de usuario para publicar tu página.",
  pt: "Usaste todas as tuas mensagens. Escolhe um nome de utilizador para publicar a tua página!",
  ja: "メッセージをすべて使いました。ユーザー名を選んでページを公開しましょう！",
  zh: "你已用完所有消息。选择一个用户名来发布你的页面！",
};

// ---------------------------------------------------------------------------
// Situation hints (appended to base greeting for non-first_visit/blocked)
// ---------------------------------------------------------------------------

const SITUATION_HINTS: Record<string, L10n> = {
  has_sparse_profile: {
    en: " I noticed your profile still has few details — I can help you enrich it.",
    it: " Ho notato che il tuo profilo ha ancora pochi dettagli — posso aiutarti ad arricchirlo.",
    de: " Mir ist aufgefallen, dass dein Profil noch wenige Details hat — ich kann dir helfen, es zu erweitern.",
    fr: " J\u2019ai remarqué que ton profil a encore peu de détails — je peux t\u2019aider à l\u2019enrichir.",
    es: " He notado que tu perfil aún tiene pocos detalles — puedo ayudarte a enriquecerlo.",
    pt: " Reparei que o teu perfil ainda tem poucos detalhes — posso ajudar-te a enriquecê-lo.",
    ja: " プロフィールの詳細がまだ少ないようです。充実させるお手伝いができますよ。",
    zh: " 我注意到你的个人资料还比较少——我可以帮你丰富它。",
  },
  has_pending_soul_proposals: {
    en: " I have some style proposals for your page — want to take a look?",
    it: " Ho delle proposte di stile per la tua pagina — vuoi darci un'occhiata?",
    de: " Ich habe einige Stilvorschläge für deine Seite — möchtest du einen Blick darauf werfen?",
    fr: " J\u2019ai des propositions de style pour ta page — tu veux y jeter un œil\u00a0?",
    es: " Tengo propuestas de estilo para tu página — ¿quieres echarles un vistazo?",
    pt: " Tenho propostas de estilo para a tua página — queres dar uma olhada?",
    ja: " ページのスタイル提案があります。見てみますか？",
    zh: " 我有一些页面风格建议——想看看吗？",
  },
  has_pending_episodic_patterns: {
    en: " I\u2019ve noticed some patterns in your recent activity — want to hear about them?",
    it: " Ho notato dei pattern nelle tue attività recenti — vuoi saperne di più?",
    de: " Mir sind Muster in deinen letzten Aktivitäten aufgefallen — möchtest du mehr erfahren?",
    fr: " J\u2019ai remarqué des tendances dans tes activités récentes — tu veux en savoir plus\u00a0?",
    es: " He notado patrones en tu actividad reciente — ¿quieres saber más?",
    pt: " Notei padrões nas tuas atividades recentes — queres saber mais?",
    ja: " 最近のアクティビティにパターンが見つかりました。詳しく聞きますか？",
    zh: " 我注意到你最近的活动中有一些规律——想了解一下吗？",
  },
};

// ---------------------------------------------------------------------------
// Dynamic greeting builder
// ---------------------------------------------------------------------------

function buildReturningNoPage(lang: string, name: string | null): string {
  const n = name ? ` ${name}` : "";
  const templates: L10n = {
    en: `Welcome back${n}! Ready to pick up where we left off?`,
    it: `Bentornato${n}! Riprendiamo da dove eravamo rimasti?`,
    de: `Willkommen zurück${n}! Sollen wir weitermachen, wo wir aufgehört haben?`,
    fr: `Re-bonjour${n}\u00a0! On reprend là où on en était\u00a0?`,
    es: `¡Bienvenido de nuevo${n}! ¿Seguimos donde lo dejamos?`,
    pt: `Bem-vindo de volta${n}! Continuamos de onde parámos?`,
    ja: name ? `おかえりなさい${name}さん！前回の続きから始めましょうか？` : `おかえりなさい！前回の続きから始めましょうか？`,
    zh: `欢迎回来${n}！我们继续之前的对话吧？`,
  };
  return templates[lang] ?? templates.en;
}

function buildDraftReady(lang: string, name: string | null): string {
  const n = name ? ` ${name}` : "";
  const templates: L10n = {
    en: `Welcome back${n}! Your page is ready for review — take a look on the right. Want to make any changes?`,
    it: `Bentornato${n}! La tua pagina è pronta — dai un'occhiata a destra. Vuoi modificare qualcosa?`,
    de: `Willkommen zurück${n}! Deine Seite ist fertig — schau rechts. Möchtest du etwas ändern?`,
    fr: `Re-bonjour${n}\u00a0! Ta page est prête — jette un œil à droite. Tu veux modifier quelque chose\u00a0?`,
    es: `¡Bienvenido${n}! Tu página está lista — mira a la derecha. ¿Quieres cambiar algo?`,
    pt: `Bem-vindo${n}! A tua página está pronta — vê à direita. Queres mudar alguma coisa?`,
    ja: name ? `おかえりなさい${name}さん！ページの準備ができています — 右側をご覧ください。変更はありますか？` : `おかえりなさい！ページの準備ができています — 右側をご覧ください。変更はありますか？`,
    zh: `欢迎回来${n}！你的页面已准备好——看看右边。想做什么修改吗？`,
  };
  return templates[lang] ?? templates.en;
}

function buildActiveFresh(lang: string, name: string | null): string {
  const n = name ? ` ${name}` : "";
  const templates: L10n = {
    en: `Hey${n}! Your page is live and up to date. How can I help?`,
    it: `Ciao${n}! La tua pagina è online e aggiornata. Come posso aiutarti?`,
    de: `Hey${n}! Deine Seite ist online und aktuell. Wie kann ich helfen?`,
    fr: `Salut${n}\u00a0! Ta page est en ligne et à jour. Comment je peux t\u2019aider\u00a0?`,
    es: `¡Hola${n}! Tu página está online y actualizada. ¿En qué puedo ayudarte?`,
    pt: `Olá${n}! A tua página está online e atualizada. Como posso ajudar?`,
    ja: name ? `${name}さん、こんにちは！ページは公開中で最新です。何かお手伝いしましょうか？` : `こんにちは！ページは公開中で最新です。何かお手伝いしましょうか？`,
    zh: `你好${n}！你的页面已上线并且是最新的。有什么我能帮忙的吗？`,
  };
  return templates[lang] ?? templates.en;
}

function buildActiveStale(lang: string, name: string | null, days: number | null): string {
  const n = name ? ` ${name}` : "";
  if (days != null && days >= 30) {
    const templates: L10n = {
      en: `Welcome back${n}! It's been over a month — anything new you'd like to share?`,
      it: `Bentornato${n}! È passato più di un mese — ci sono novità da raccontare?`,
      de: `Willkommen zurück${n}! Es ist über einen Monat her — gibt es Neuigkeiten?`,
      fr: `Re-bonjour${n}\u00a0! Ça fait plus d\u2019un mois — du nouveau à partager\u00a0?`,
      es: `¡Bienvenido de nuevo${n}! Ha pasado más de un mes — ¿hay novedades?`,
      pt: `Bem-vindo de volta${n}! Passou mais de um mês — há novidades?`,
      ja: name ? `おかえりなさい${name}さん！1ヶ月以上ぶりですね — 新しいことはありますか？` : `おかえりなさい！1ヶ月以上ぶりですね — 新しいことはありますか？`,
      zh: `欢迎回来${n}！已经过了一个多月——有什么新动态吗？`,
    };
    return templates[lang] ?? templates.en;
  }
  const templates: L10n = {
    en: `Hey${n}! It's been a little while. Anything new to add to your page?`,
    it: `Ciao${n}! È passato un po' dall'ultima volta. Ci sono novità da aggiungere alla tua pagina?`,
    de: `Hey${n}! Es ist eine Weile her. Gibt es etwas Neues für deine Seite?`,
    fr: `Salut${n}\u00a0! Ça fait un moment. Du nouveau pour ta page\u00a0?`,
    es: `¡Hola${n}! Ha pasado un tiempo. ¿Hay algo nuevo para tu página?`,
    pt: `Olá${n}! Faz algum tempo. Há algo novo para a tua página?`,
    ja: name ? `${name}さん、こんにちは！しばらくぶりですね。ページに追加したいことはありますか？` : `こんにちは！しばらくぶりですね。ページに追加したいことはありますか？`,
    zh: `你好${n}！有一段时间了。有什么新内容要添加到你的页面吗？`,
  };
  return templates[lang] ?? templates.en;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/** States that should NOT get situation hints appended. */
const NO_HINTS_STATES: Set<JourneyState> = new Set(["first_visit", "blocked"]);

export function computeGreeting(ctx: GreetingContext): string {
  const { journeyState, language, userName, lastSeenDaysAgo, situations } = ctx;
  const lang = language || "en";

  let base: string;

  switch (journeyState) {
    case "first_visit":
      return FIRST_VISIT[lang] ?? FIRST_VISIT.en;

    case "blocked":
      return BLOCKED[lang] ?? BLOCKED.en;

    case "returning_no_page":
      base = buildReturningNoPage(lang, userName);
      break;

    case "draft_ready":
      base = buildDraftReady(lang, userName);
      break;

    case "active_fresh":
      base = buildActiveFresh(lang, userName);
      break;

    case "active_stale":
      base = buildActiveStale(lang, userName, lastSeenDaysAgo);
      break;

    default:
      return FIRST_VISIT[lang] ?? FIRST_VISIT.en;
  }

  // Append situation hints (max 1 to keep greeting concise)
  if (!NO_HINTS_STATES.has(journeyState)) {
    for (const sit of situations) {
      const hints = SITUATION_HINTS[sit];
      if (hints) {
        base += hints[lang] ?? hints.en;
        break; // Only append the first matching hint
      }
    }
  }

  return base;
}
