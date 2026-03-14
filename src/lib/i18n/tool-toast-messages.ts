/**
 * Localized toast messages shown when an agent tool completes successfully.
 * Maps tool name → language code → short human-readable message.
 */
export const TOOL_TOAST_MESSAGES: Record<string, Record<string, string>> = {
  curate_content: {
    en: "Content updated",
    it: "Contenuto aggiornato",
    de: "Inhalt aktualisiert",
    fr: "Contenu mis à jour",
    es: "Contenido actualizado",
    pt: "Conteúdo atualizado",
    ja: "コンテンツ更新",
    zh: "内容已更新",
  },
  create_fact: {
    en: "Fact added",
    it: "Informazione aggiunta",
    de: "Information hinzugefügt",
    fr: "Information ajoutée",
    es: "Información añadida",
    pt: "Informação adicionada",
    ja: "情報追加",
    zh: "信息已添加",
  },
  delete_fact: {
    en: "Fact removed",
    it: "Informazione rimossa",
    de: "Information entfernt",
    fr: "Information supprimée",
    es: "Información eliminada",
    pt: "Informação removida",
    ja: "情報削除",
    zh: "信息已删除",
  },
  batch_facts: {
    en: "Facts updated",
    it: "Informazioni aggiornate",
    de: "Informationen aktualisiert",
    fr: "Informations mises à jour",
    es: "Informaciones actualizadas",
    pt: "Informações atualizadas",
    ja: "情報更新",
    zh: "信息已更新",
  },
  generate_page: {
    en: "Page generated",
    it: "Pagina generata",
    de: "Seite generiert",
    fr: "Page générée",
    es: "Página generada",
    pt: "Página gerada",
    ja: "ページ生成",
    zh: "页面已生成",
  },
  update_page_style: {
    en: "Style updated",
    it: "Stile aggiornato",
    de: "Stil aktualisiert",
    fr: "Style mis à jour",
    es: "Estilo actualizado",
    pt: "Estilo atualizado",
    ja: "スタイル更新",
    zh: "样式已更新",
  },
  reorder_sections: {
    en: "Sections reordered",
    it: "Sezioni riordinate",
    de: "Abschnitte neu sortiert",
    fr: "Sections réorganisées",
    es: "Secciones reordenadas",
    pt: "Seções reordenadas",
    ja: "セクション並替",
    zh: "章节已重排",
  },
  toggle_section_visibility: {
    en: "Section visibility changed",
    it: "Visibilità sezione modificata",
    de: "Sichtbarkeit geändert",
    fr: "Visibilité modifiée",
    es: "Visibilidad cambiada",
    pt: "Visibilidade alterada",
    ja: "表示切替",
    zh: "可见性已更改",
  },
  request_publish: {
    en: "Publish requested",
    it: "Pubblicazione richiesta",
    de: "Veröffentlichung angefragt",
    fr: "Publication demandée",
    es: "Publicación solicitada",
    pt: "Publicação solicitada",
    ja: "公開リクエスト",
    zh: "发布已请求",
  },
};

/**
 * Look up the toast message for a given tool name and language.
 * Returns undefined if the tool should not produce a toast.
 */
export function getToolToastMessage(
  toolName: string,
  language: string,
): string | undefined {
  const msgs = TOOL_TOAST_MESSAGES[toolName];
  if (!msgs) return undefined;
  return msgs[language] ?? msgs.en;
}
