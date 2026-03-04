import type { JourneyState } from "./journey";

/** Fallback messages when step exhaustion leaves no text reply. Keyed by journey state then language. */
export const STEP_EXHAUSTION_FALLBACK: Record<JourneyState, Record<string, string>> = {
  first_visit: {
    en: "I've saved what you shared — take a look at the preview on the right!",
    it: "Ho salvato quello che mi hai detto — dai un'occhiata all'anteprima a destra!",
    de: "Ich habe gespeichert, was du mir erzählt hast — schau dir die Vorschau rechts an!",
    fr: "J'ai enregistré ce que tu m'as dit — jette un œil à l'aperçu à droite\u00a0!",
    es: "He guardado lo que me contaste — ¡echa un vistazo a la vista previa a la derecha!",
    pt: "Guardei o que me contaste — dá uma olhadela à pré-visualização à direita!",
    ja: "話してくれたことを保存しました — 右のプレビューを確認してください！",
    zh: "我已保存你分享的内容 — 看看右边的预览吧！",
  },
  returning_no_page: {
    en: "Done with that. Want me to build your page now?",
    it: "Fatto. Vuoi che costruisca la tua pagina adesso?",
    de: "Erledigt. Soll ich jetzt deine Seite erstellen?",
    fr: "C'est fait. Je te construis la page maintenant\u00a0?",
    es: "Listo. ¿Quieres que construya tu página ahora?",
    pt: "Pronto. Queres que crie a tua página agora?",
    ja: "完了です。今ページを作りましょうか？",
    zh: "好了。现在要我生成你的页面吗？",
  },
  draft_ready: {
    en: "Done. Publish now, or want to tweak something first?",
    it: "Fatto. Pubblichiamo adesso, o vuoi modificare qualcosa prima?",
    de: "Erledigt. Jetzt veröffentlichen oder erst noch etwas anpassen?",
    fr: "C'est fait. On publie maintenant, ou tu veux d'abord changer quelque chose\u00a0?",
    es: "Listo. ¿Publicamos ahora o quieres cambiar algo primero?",
    pt: "Pronto. Publicamos agora ou queres ajustar algo primeiro?",
    ja: "完了。今公開しますか、それとも先に何か調整しますか？",
    zh: "完成了。现在发布，还是先调整一下？",
  },
  active_fresh: {
    en: "Updated. Anything else to change?",
    it: "Aggiornato. Vuoi cambiare altro?",
    de: "Aktualisiert. Noch etwas zu ändern?",
    fr: "Mis à jour. Autre chose à modifier\u00a0?",
    es: "Actualizado. ¿Algo más que cambiar?",
    pt: "Atualizado. Mais alguma coisa a alterar?",
    ja: "更新しました。他に変更しますか？",
    zh: "已更新。还有什么要改的吗？",
  },
  active_stale: {
    en: "Done — want to republish with these updates?",
    it: "Fatto — vuoi ripubblicare con questi aggiornamenti?",
    de: "Erledigt — möchtest du mit diesen Updates neu veröffentlichen?",
    fr: "C'est fait — tu veux republier avec ces mises à jour\u00a0?",
    es: "Listo — ¿quieres volver a publicar con estas actualizaciones?",
    pt: "Pronto — queres republicar com estas atualizações?",
    ja: "完了 — これらの更新で再公開しますか？",
    zh: "完成了 — 要用这些更新重新发布吗？",
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
