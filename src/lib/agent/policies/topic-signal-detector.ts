const NEW_TOPIC_PATTERNS: Record<string, RegExp> = {
  en: /\b(change|update|add|remove|delete|create|build|generate|show|move|rename|I want|can you|please|fix|edit)\b/i,
  it: /\b(cambia|aggiorna|aggiungi|rimuovi|elimina|crea|costruisci|genera|mostra|sposta|rinomina|voglio|puoi|per favore|sistema|modifica)\b/i,
  de: /\b(änder|aktualisier|füge|entfern|lösch|erstell|bau|generier|zeig|beweg|umbenenn|ich möchte|kannst du|bitte|beheb)\b/i,
  fr: /\b(change|modifie|ajoute|supprime|crée|construis|génère|montre|déplace|renomme|je veux|peux.tu|s.il te plaît|corrige)\b/i,
  es: /\b(cambia|actualiza|agrega|elimina|crea|construye|genera|muestra|mueve|renombra|quiero|puedes|por favor|corrige|edita)\b/i,
  pt: /\b(muda|atualiza|adiciona|remove|elimina|cria|constrói|gera|mostra|move|renomeia|quero|podes|por favor|corrige|edita)\b/i,
  // Japanese: phrase-based matching only — character classes cause false positives
  ja: /(変更|追加|削除|更新|作成|移動|修正|変えて|追加して|削除して|更新して|変更して|作って|してください|お願い|やって)/,
  // Chinese: character classes are safe (no overlap with common acks)
  zh: /[改变更新添加删除创建移动修改]/,
};

const CONTINUATION_PATTERNS: Record<string, RegExp> = {
  en: /^(yes[,! ]*do it|continue|go on|proceed|ok[, ]*go ahead|sure[, ]*go ahead|keep going|yes please|yep|yeah)/i,
  it: /^(sì[,! ]*fai|continua|vai avanti|procedi|ok[, ]*vai|certo[, ]*vai|si|esatto|già)/i,
  de: /^(ja[,! ]*mach|weiter|fortfahren|ja bitte|klar[, ]*mach|ja genau)/i,
  fr: /^(oui[,! ]*fais|continue|vas-y|procède|oui s'il te|ouais)/i,
  es: /^(sí[,! ]*hazlo|continúa|adelante|procede|sí por favor|sí claro)/i,
  pt: /^(sim[,! ]*faz|continua|vai em frente|procede|sim por favor)/i,
  ja: /^(はい|そうです|続けて|お願い|そうしてください)/,
  zh: /^(好的|是的|请继续|继续|可以)/,
};

export function isNewTopicSignal(message: string, language: string = "en"): boolean {
  const trimmed = message.trim();

  // Check continuation allowlist FIRST in ALL languages
  for (const contPattern of Object.values(CONTINUATION_PATTERNS)) {
    if (contPattern.test(trimmed)) return false;
  }

  // Check action patterns in ALL languages (user may write in any language)
  for (const pattern of Object.values(NEW_TOPIC_PATTERNS)) {
    if (pattern.test(trimmed)) return true;
  }

  // Long messages without action verbs: treat as new topic if >60 chars
  return trimmed.length > 60;
}
