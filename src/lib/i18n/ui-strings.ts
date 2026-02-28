/**
 * Centralized UI strings for builder components.
 * All user-facing text in the builder UI should come from here.
 */

export interface UiStrings {
  // Chat panel
  chat: string;
  typeMessage: string;
  send: string;

  // Preview placeholder
  pageWillAppear: string;
  startChatting: string;

  // Settings panel
  openSettings: string;
  closeSettings: string;
  settings: string;
  language: string;
  theme: string;
  color: string;
  light: string;
  dark: string;
  font: string;
  layout: string;

  // Publish bar
  signUpToPublish: string;
  publish: string;
  publishAs: string;
  publishing: string;
  livePage: string;

  // Builder banner / auth
  editYourPage: string;
  share: string;
  logOut: string;
  loggingOut: string;
  logIn: string;

  // Signup modal
  createYourAccount: string;
  signUpToPublishPage: string;
  username: string;
  email: string;
  password: string;
  atLeast8Chars: string;
  signUpAndPublish: string;
  alreadyHaveAccount: string;

  // Signup validation
  usernameRequired: string;
  emailRequired: string;
  passwordTooShort: string;
  registrationFailed: string;
  networkError: string;

  // Proposal banner
  improvementsReady: string;
  review: string;
  pageImprovements: string;
  current: string;
  proposed: string;
  accept: string;
  reject: string;
  acceptAll: string;
}

const en: UiStrings = {
  chat: "Chat",
  typeMessage: "Type a message...",
  send: "Send",
  pageWillAppear: "Your page will appear here",
  startChatting: "Start chatting to build your page",
  openSettings: "Open settings",
  closeSettings: "Close settings",
  settings: "Settings",
  language: "Language",
  theme: "Theme",
  color: "Color",
  light: "Light",
  dark: "Dark",
  font: "Font",
  layout: "Layout",
  signUpToPublish: "Sign up to publish",
  publish: "Publish",
  publishAs: "Publish as {0}",
  publishing: "Publishing...",
  livePage: "Live page",
  editYourPage: "Edit your page",
  share: "Share",
  logOut: "Log out",
  loggingOut: "Logging out...",
  logIn: "Log in",
  createYourAccount: "Create your account",
  signUpToPublishPage: "Sign up to publish your page",
  username: "Username",
  email: "Email",
  password: "Password",
  atLeast8Chars: "At least 8 characters",
  signUpAndPublish: "Sign up & publish",
  alreadyHaveAccount: "Already have an account?",
  usernameRequired: "Username is required",
  emailRequired: "Email is required",
  passwordTooShort: "Password must be at least 8 characters",
  registrationFailed: "Registration failed",
  networkError: "Network error. Please try again.",
  improvementsReady: "improvements ready",
  review: "Review",
  pageImprovements: "Page improvements",
  current: "Current",
  proposed: "Proposed",
  accept: "Accept",
  reject: "Reject",
  acceptAll: "Accept all",
};

const it: UiStrings = {
  chat: "Chat",
  typeMessage: "Scrivi un messaggio...",
  send: "Invia",
  pageWillAppear: "La tua pagina apparirà qui",
  startChatting: "Inizia a chattare per creare la tua pagina",
  openSettings: "Apri impostazioni",
  closeSettings: "Chiudi impostazioni",
  settings: "Impostazioni",
  language: "Lingua",
  theme: "Tema",
  color: "Colore",
  light: "Chiaro",
  dark: "Scuro",
  font: "Font",
  layout: "Layout",
  signUpToPublish: "Registrati per pubblicare",
  publish: "Pubblica",
  publishAs: "Pubblica come {0}",
  publishing: "Pubblicazione...",
  livePage: "Pagina live",
  editYourPage: "Modifica la tua pagina",
  share: "Condividi",
  logOut: "Esci",
  loggingOut: "Disconnessione...",
  logIn: "Accedi",
  createYourAccount: "Crea il tuo account",
  signUpToPublishPage: "Registrati per pubblicare la tua pagina",
  username: "Nome utente",
  email: "Email",
  password: "Password",
  atLeast8Chars: "Almeno 8 caratteri",
  signUpAndPublish: "Registrati e pubblica",
  alreadyHaveAccount: "Hai già un account?",
  usernameRequired: "Nome utente richiesto",
  emailRequired: "Email richiesta",
  passwordTooShort: "La password deve avere almeno 8 caratteri",
  registrationFailed: "Registrazione fallita",
  networkError: "Errore di rete. Riprova.",
  improvementsReady: "miglioramenti disponibili",
  review: "Rivedi",
  pageImprovements: "Miglioramenti pagina",
  current: "Attuale",
  proposed: "Proposto",
  accept: "Accetta",
  reject: "Rifiuta",
  acceptAll: "Accetta tutti",
};

const de: UiStrings = {
  chat: "Chat",
  typeMessage: "Nachricht eingeben...",
  send: "Senden",
  pageWillAppear: "Ihre Seite erscheint hier",
  startChatting: "Beginnen Sie zu chatten, um Ihre Seite zu erstellen",
  openSettings: "Einstellungen öffnen",
  closeSettings: "Einstellungen schließen",
  settings: "Einstellungen",
  language: "Sprache",
  theme: "Design",
  color: "Farbe",
  light: "Hell",
  dark: "Dunkel",
  font: "Schrift",
  layout: "Layout",
  signUpToPublish: "Registrieren zum Veröffentlichen",
  publish: "Veröffentlichen",
  publishAs: "Veröffentlichen als {0}",
  publishing: "Wird veröffentlicht...",
  livePage: "Live-Seite",
  editYourPage: "Seite bearbeiten",
  share: "Teilen",
  logOut: "Abmelden",
  loggingOut: "Abmeldung...",
  logIn: "Anmelden",
  createYourAccount: "Konto erstellen",
  signUpToPublishPage: "Registrieren zum Veröffentlichen",
  username: "Benutzername",
  email: "E-Mail",
  password: "Passwort",
  atLeast8Chars: "Mindestens 8 Zeichen",
  signUpAndPublish: "Registrieren & veröffentlichen",
  alreadyHaveAccount: "Bereits ein Konto?",
  usernameRequired: "Benutzername erforderlich",
  emailRequired: "E-Mail erforderlich",
  passwordTooShort: "Passwort muss mindestens 8 Zeichen lang sein",
  registrationFailed: "Registrierung fehlgeschlagen",
  networkError: "Netzwerkfehler. Bitte erneut versuchen.",
  improvementsReady: "Verbesserungen verfügbar",
  review: "Überprüfen",
  pageImprovements: "Seitenverbesserungen",
  current: "Aktuell",
  proposed: "Vorgeschlagen",
  accept: "Annehmen",
  reject: "Ablehnen",
  acceptAll: "Alle annehmen",
};

const fr: UiStrings = {
  chat: "Chat",
  typeMessage: "Tapez un message...",
  send: "Envoyer",
  pageWillAppear: "Votre page apparaîtra ici",
  startChatting: "Commencez à discuter pour créer votre page",
  openSettings: "Ouvrir les paramètres",
  closeSettings: "Fermer les paramètres",
  settings: "Paramètres",
  language: "Langue",
  theme: "Thème",
  color: "Couleur",
  light: "Clair",
  dark: "Sombre",
  font: "Police",
  layout: "Mise en page",
  signUpToPublish: "Inscrivez-vous pour publier",
  publish: "Publier",
  publishAs: "Publier en tant que {0}",
  publishing: "Publication...",
  livePage: "Page en ligne",
  editYourPage: "Modifier votre page",
  share: "Partager",
  logOut: "Déconnexion",
  loggingOut: "Déconnexion...",
  logIn: "Connexion",
  createYourAccount: "Créez votre compte",
  signUpToPublishPage: "Inscrivez-vous pour publier votre page",
  username: "Nom d'utilisateur",
  email: "E-mail",
  password: "Mot de passe",
  atLeast8Chars: "Au moins 8 caractères",
  signUpAndPublish: "S'inscrire et publier",
  alreadyHaveAccount: "Vous avez déjà un compte ?",
  usernameRequired: "Nom d'utilisateur requis",
  emailRequired: "E-mail requis",
  passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères",
  registrationFailed: "Échec de l'inscription",
  networkError: "Erreur réseau. Veuillez réessayer.",
  improvementsReady: "améliorations disponibles",
  review: "Examiner",
  pageImprovements: "Améliorations de la page",
  current: "Actuel",
  proposed: "Proposé",
  accept: "Accepter",
  reject: "Rejeter",
  acceptAll: "Tout accepter",
};

const es: UiStrings = {
  chat: "Chat",
  typeMessage: "Escribe un mensaje...",
  send: "Enviar",
  pageWillAppear: "Tu página aparecerá aquí",
  startChatting: "Empieza a chatear para crear tu página",
  openSettings: "Abrir ajustes",
  closeSettings: "Cerrar ajustes",
  settings: "Ajustes",
  language: "Idioma",
  theme: "Tema",
  color: "Color",
  light: "Claro",
  dark: "Oscuro",
  font: "Fuente",
  layout: "Diseño",
  signUpToPublish: "Regístrate para publicar",
  publish: "Publicar",
  publishAs: "Publicar como {0}",
  publishing: "Publicando...",
  livePage: "Página en vivo",
  editYourPage: "Edita tu página",
  share: "Compartir",
  logOut: "Cerrar sesión",
  loggingOut: "Cerrando sesión...",
  logIn: "Iniciar sesión",
  createYourAccount: "Crea tu cuenta",
  signUpToPublishPage: "Regístrate para publicar tu página",
  username: "Nombre de usuario",
  email: "Correo electrónico",
  password: "Contraseña",
  atLeast8Chars: "Al menos 8 caracteres",
  signUpAndPublish: "Registrarse y publicar",
  alreadyHaveAccount: "¿Ya tienes cuenta?",
  usernameRequired: "Nombre de usuario requerido",
  emailRequired: "Correo electrónico requerido",
  passwordTooShort: "La contraseña debe tener al menos 8 caracteres",
  registrationFailed: "Error en el registro",
  networkError: "Error de red. Inténtalo de nuevo.",
  improvementsReady: "mejoras disponibles",
  review: "Revisar",
  pageImprovements: "Mejoras de la página",
  current: "Actual",
  proposed: "Propuesto",
  accept: "Aceptar",
  reject: "Rechazar",
  acceptAll: "Aceptar todo",
};

const pt: UiStrings = {
  chat: "Chat",
  typeMessage: "Escreva uma mensagem...",
  send: "Enviar",
  pageWillAppear: "A sua página aparecerá aqui",
  startChatting: "Comece a conversar para criar a sua página",
  openSettings: "Abrir definições",
  closeSettings: "Fechar definições",
  settings: "Definições",
  language: "Idioma",
  theme: "Tema",
  color: "Cor",
  light: "Claro",
  dark: "Escuro",
  font: "Fonte",
  layout: "Layout",
  signUpToPublish: "Registe-se para publicar",
  publish: "Publicar",
  publishAs: "Publicar como {0}",
  publishing: "A publicar...",
  livePage: "Página online",
  editYourPage: "Edite a sua página",
  share: "Partilhar",
  logOut: "Terminar sessão",
  loggingOut: "A terminar sessão...",
  logIn: "Iniciar sessão",
  createYourAccount: "Crie a sua conta",
  signUpToPublishPage: "Registe-se para publicar a sua página",
  username: "Nome de utilizador",
  email: "E-mail",
  password: "Palavra-passe",
  atLeast8Chars: "Pelo menos 8 caracteres",
  signUpAndPublish: "Registar e publicar",
  alreadyHaveAccount: "Já tem conta?",
  usernameRequired: "Nome de utilizador obrigatório",
  emailRequired: "E-mail obrigatório",
  passwordTooShort: "A palavra-passe deve ter pelo menos 8 caracteres",
  registrationFailed: "Falha no registo",
  networkError: "Erro de rede. Tente novamente.",
  improvementsReady: "melhorias disponíveis",
  review: "Rever",
  pageImprovements: "Melhorias da página",
  current: "Atual",
  proposed: "Proposto",
  accept: "Aceitar",
  reject: "Rejeitar",
  acceptAll: "Aceitar tudo",
};

const ja: UiStrings = {
  chat: "チャット",
  typeMessage: "メッセージを入力...",
  send: "送信",
  pageWillAppear: "ページがここに表示されます",
  startChatting: "チャットを始めてページを作成しましょう",
  openSettings: "設定を開く",
  closeSettings: "設定を閉じる",
  settings: "設定",
  language: "言語",
  theme: "テーマ",
  color: "カラー",
  light: "ライト",
  dark: "ダーク",
  font: "フォント",
  layout: "レイアウト",
  signUpToPublish: "登録して公開",
  publish: "公開",
  publishAs: "{0} として公開",
  publishing: "公開中...",
  livePage: "公開ページ",
  editYourPage: "ページを編集",
  share: "共有",
  logOut: "ログアウト",
  loggingOut: "ログアウト中...",
  logIn: "ログイン",
  createYourAccount: "アカウントを作成",
  signUpToPublishPage: "登録してページを公開",
  username: "ユーザー名",
  email: "メールアドレス",
  password: "パスワード",
  atLeast8Chars: "8文字以上",
  signUpAndPublish: "登録して公開",
  alreadyHaveAccount: "アカウントをお持ちですか？",
  usernameRequired: "ユーザー名は必須です",
  emailRequired: "メールアドレスは必須です",
  passwordTooShort: "パスワードは8文字以上必要です",
  registrationFailed: "登録に失敗しました",
  networkError: "ネットワークエラー。もう一度お試しください。",
  improvementsReady: "件の改善提案",
  review: "確認",
  pageImprovements: "ページの改善",
  current: "現在",
  proposed: "提案",
  accept: "承認",
  reject: "却下",
  acceptAll: "すべて承認",
};

const zh: UiStrings = {
  chat: "聊天",
  typeMessage: "输入消息...",
  send: "发送",
  pageWillAppear: "您的页面将在此显示",
  startChatting: "开始聊天以创建您的页面",
  openSettings: "打开设置",
  closeSettings: "关闭设置",
  settings: "设置",
  language: "语言",
  theme: "主题",
  color: "颜色",
  light: "浅色",
  dark: "深色",
  font: "字体",
  layout: "布局",
  signUpToPublish: "注册以发布",
  publish: "发布",
  publishAs: "以 {0} 发布",
  publishing: "发布中...",
  livePage: "在线页面",
  editYourPage: "编辑您的页面",
  share: "分享",
  logOut: "退出登录",
  loggingOut: "退出中...",
  logIn: "登录",
  createYourAccount: "创建您的账户",
  signUpToPublishPage: "注册以发布您的页面",
  username: "用户名",
  email: "电子邮件",
  password: "密码",
  atLeast8Chars: "至少8个字符",
  signUpAndPublish: "注册并发布",
  alreadyHaveAccount: "已有账户？",
  usernameRequired: "用户名为必填项",
  emailRequired: "电子邮件为必填项",
  passwordTooShort: "密码至少需要8个字符",
  registrationFailed: "注册失败",
  networkError: "网络错误，请重试。",
  improvementsReady: "项改进可用",
  review: "查看",
  pageImprovements: "页面改进",
  current: "当前",
  proposed: "建议",
  accept: "接受",
  reject: "拒绝",
  acceptAll: "全部接受",
};

const STRINGS: Record<string, UiStrings> = { en, it, de, fr, es, pt, ja, zh };

/**
 * Get localized UI strings for the given language code.
 * Falls back to English for unknown languages.
 */
export function getUiL10n(lang: string): UiStrings {
  return STRINGS[lang] ?? en;
}
