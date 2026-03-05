import type { JourneyState } from "./journey";

/** Fallback messages when step exhaustion leaves no text reply. Keyed by journey state then language. */
export const STEP_EXHAUSTION_FALLBACK: Record<JourneyState, Record<string, string>> = {
  first_visit: {
    en: "I'm still putting this together from what you've shared. Keep going — I'll work from here.",
    it: "Sto ancora mettendo insieme quello che hai condiviso. Vai pure avanti — lavoro da qui.",
    de: "Ich setze das aus deinen Infos gerade noch zusammen. Erzähl weiter — ich mache von hier aus weiter.",
    fr: "Je suis encore en train d'assembler tout ca a partir de ce que tu as partage. Continue — je reprends d'ici.",
    es: "Sigo armando esto con lo que me contaste. Sigue — continuo desde aquí.",
    pt: "Ainda estou a montar isto com o que partilhaste. Continua — eu sigo daqui.",
    ja: "今の内容をもとに、まだ組み立てを続けています。このまま続けてください。",
    zh: "我还在根据你刚才说的内容继续整理。你接着说，我从这里继续。",
  },
  returning_no_page: {
    en: "I'm still assembling this from your updates. Want me to build the page with what I have?",
    it: "Sto ancora assemblando tutto dai tuoi aggiornamenti. Vuoi che costruisca la pagina con quello che ho?",
    de: "Ich setze das aus deinen Updates noch zusammen. Soll ich die Seite mit dem bauen, was ich schon habe?",
    fr: "Je suis encore en train d'assembler tout ca avec tes mises a jour. Je construis la page avec ce que j'ai deja ?",
    es: "Sigo armando todo con tus novedades. ¿Quieres que construya la página con lo que ya tengo?",
    pt: "Ainda estou a juntar tudo com as tuas atualizações. Queres que crie a página com o que já tenho?",
    ja: "追加内容をもとに、まだ組み立てを続けています。今ある情報でページを作りますか？",
    zh: "我还在根据你的更新继续整理内容。要不要先用现有信息生成页面？",
  },
  draft_ready: {
    en: "I'm still updating the draft. Want another tweak, or should I rebuild it now?",
    it: "Sto ancora aggiornando la bozza. Vuoi un'altra modifica, o la rigenero adesso?",
    de: "Ich aktualisiere den Entwurf gerade noch. Noch eine Anpassung oder soll ich ihn jetzt neu bauen?",
    fr: "Je suis encore en train de mettre a jour le brouillon. Une autre retouche, ou je le regenere maintenant ?",
    es: "Sigo actualizando el borrador. ¿Quieres otro ajuste o lo regenero ahora?",
    pt: "Ainda estou a atualizar o rascunho. Queres mais um ajuste ou queres que eu o regenere agora?",
    ja: "下書きをまだ更新中です。もう一つ調整しますか、それとも今すぐ作り直しますか？",
    zh: "我还在更新草稿。还要再改一点，还是现在就重新生成？",
  },
  active_fresh: {
    en: "I'm still applying that update. What should I change next?",
    it: "Sto ancora applicando quell'aggiornamento. Cosa vuoi cambiare dopo?",
    de: "Ich spiele dieses Update gerade noch ein. Was soll ich als Nächstes ändern?",
    fr: "Je suis encore en train d'appliquer cette mise a jour. Qu'est-ce que je change ensuite ?",
    es: "Sigo aplicando ese cambio. ¿Qué quieres cambiar después?",
    pt: "Ainda estou a aplicar essa alteração. O que queres mudar a seguir?",
    ja: "その更新をまだ反映中です。次は何を変えますか？",
    zh: "我还在应用这次更新。接下来你想改什么？",
  },
  active_stale: {
    en: "I'm still working through those updates. Want me to rebuild and republish after this?",
    it: "Sto ancora sistemando questi aggiornamenti. Vuoi che poi rigeneri e ripubblichi?",
    de: "Ich arbeite diese Updates gerade noch durch. Soll ich danach neu bauen und erneut veröffentlichen?",
    fr: "Je suis encore en train de passer sur ces mises a jour. Tu veux que je regenere puis republie apres ?",
    es: "Sigo terminando estos cambios. ¿Quieres que luego regenere y vuelva a publicar?",
    pt: "Ainda estou a tratar destas atualizações. Queres que depois regenere e republice?",
    ja: "これらの更新をまだ反映中です。このあと作り直して再公開しますか？",
    zh: "我还在处理这些更新。之后要不要我重新生成并重新发布？",
  },
  // blocked state: step exhaustion in a blocked session should surface the quota message
  // since the next user action is to register, regardless of which limit was hit.
  blocked: {
    en: "You've reached the message limit — pick a username to keep going!",
    it: "Hai raggiunto il limite di messaggi — scegli un username per continuare!",
    de: "Du hast das Nachrichtenlimit erreicht — wähle einen Benutzernamen, um weiterzumachen!",
    fr: "Tu as atteint la limite de messages — choisis un nom d'utilisateur pour continuer\u00a0!",
    es: "Has alcanzado el límite de mensajes — ¡elige un nombre de usuario para continuar!",
    pt: "Atingiste o limite de mensagens — escolhe um nome de utilizador para continuar!",
    ja: "メッセージ上限に達しました — 続けるにはユーザー名を選択してください！",
    zh: "已达到消息上限 — 选择用户名继续吧！",
  },
};
