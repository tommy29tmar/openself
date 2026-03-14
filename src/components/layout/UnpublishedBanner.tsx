"use client";

import { useState } from "react";
import type { PageChange } from "@/lib/services/page-diff-service";
import { getUiL10n } from "@/lib/i18n/ui-strings";

/**
 * Pure visibility predicates — exported for unit testing.
 */
export function shouldShowUnpublishedBanner(opts: {
  hasUnpublishedChanges: boolean;
  publishing: boolean;
  publishStatus: string;
  authenticated: boolean;
}): boolean {
  return (
    opts.hasUnpublishedChanges &&
    !opts.publishing &&
    opts.publishStatus !== "approval_pending" &&
    opts.authenticated
  );
}

export function shouldShowApprovalBanner(opts: {
  publishStatus: string;
  hasUnpublishedChanges: boolean;
}): boolean {
  return opts.publishStatus === "approval_pending" && !opts.hasUnpublishedChanges;
}

/** Localized change-type labels */
const CHANGE_TYPE_LABELS: Record<string, Record<string, string>> = {
  added: {
    en: "added", it: "aggiunta", de: "hinzugefügt", fr: "ajouté",
    es: "añadida", pt: "adicionada", ja: "追加", zh: "新增",
  },
  modified: {
    en: "modified", it: "modificata", de: "geändert", fr: "modifié",
    es: "modificada", pt: "modificada", ja: "変更", zh: "已修改",
  },
  removed: {
    en: "removed", it: "rimossa", de: "entfernt", fr: "supprimé",
    es: "eliminada", pt: "removida", ja: "削除", zh: "已删除",
  },
};

const DISCARD_LABELS: Record<string, string> = {
  en: "Discard", it: "Scarta", de: "Verwerfen", fr: "Annuler",
  es: "Descartar", pt: "Descartar", ja: "破棄", zh: "丢弃",
};

const DISCARDING_LABELS: Record<string, string> = {
  en: "Discarding...", it: "Scartando...", de: "Verwerfe...", fr: "Annulation...",
  es: "Descartando...", pt: "Descartando...", ja: "破棄中...", zh: "丢弃中...",
};

const CONFIRM_DISCARD_LABELS: Record<string, string> = {
  en: "Discard all unpublished changes?",
  it: "Scartare tutte le modifiche non pubblicate?",
  de: "Alle unveröffentlichten Änderungen verwerfen?",
  fr: "Supprimer toutes les modifications non publiées ?",
  es: "¿Descartar todos los cambios no publicados?",
  pt: "Descartar todas as alterações não publicadas?",
  ja: "未公開の変更をすべて破棄しますか？",
  zh: "丢弃所有未发布的更改？",
};

const CHANGES_LABEL: Record<string, string> = {
  en: "change", it: "modifica", de: "Änderung", fr: "modification",
  es: "cambio", pt: "alteração", ja: "変更", zh: "更改",
};

const CHANGES_PLURAL_LABEL: Record<string, string> = {
  en: "changes", it: "modifiche", de: "Änderungen", fr: "modifications",
  es: "cambios", pt: "alterações", ja: "変更", zh: "更改",
};

function changeTypeLabel(changeType: string, language: string): string {
  return CHANGE_TYPE_LABELS[changeType]?.[language] ?? CHANGE_TYPE_LABELS[changeType]?.en ?? changeType;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Banner shown in the desktop preview pane when:
 * - publish status is approval_pending (ready to publish)
 * - OR there are unpublished changes
 */
export function UnpublishedBanner({
  hasUnpublishedChanges,
  publishing,
  publishStatus,
  authenticated,
  onPublish,
  unpublishedChangesLabel,
  publishLabel,
  changes,
  language = "en",
  onDiscard,
}: {
  hasUnpublishedChanges: boolean;
  publishing: boolean;
  publishStatus: string;
  authenticated: boolean;
  onPublish: () => void;
  unpublishedChangesLabel: string;
  publishLabel: string;
  changes?: PageChange[];
  language?: string;
  onDiscard?: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const showApproval = shouldShowApprovalBanner({ publishStatus, hasUnpublishedChanges });
  const showUnpublished = shouldShowUnpublishedBanner({
    hasUnpublishedChanges,
    publishing,
    publishStatus,
    authenticated,
  });

  const l10n = getUiL10n(language);

  if (showApproval) {
    return (
      <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950">
        <span className="shrink-0 font-medium text-amber-800 dark:text-amber-200">
          {l10n.readyToPublish}
        </span>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {publishing ? l10n.publishing : l10n.publish}
        </button>
      </div>
    );
  }

  if (showUnpublished) {
    const changeCount = changes?.length ?? 0;
    const changesWord = changeCount === 1
      ? (CHANGES_LABEL[language] ?? CHANGES_LABEL.en)
      : (CHANGES_PLURAL_LABEL[language] ?? CHANGES_PLURAL_LABEL.en);
    const summaryText = changeCount > 0
      ? `${unpublishedChangesLabel} (${changeCount} ${changesWord})`
      : unpublishedChangesLabel;

    const handleDiscard = async () => {
      if (!onDiscard || discarding) return;
      const confirmMsg = CONFIRM_DISCARD_LABELS[language] ?? CONFIRM_DISCARD_LABELS.en;
      if (!window.confirm(confirmMsg)) return;
      setDiscarding(true);
      try {
        await onDiscard();
      } finally {
        setDiscarding(false);
      }
    };

    return (
      <div className="border-b bg-amber-50 text-sm dark:bg-amber-950">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => changeCount > 0 && setExpanded((e) => !e)}
            className="flex items-center gap-1.5 text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
            disabled={changeCount === 0}
            aria-expanded={expanded}
            aria-label="Toggle change details"
          >
            {changeCount > 0 && <ChevronIcon expanded={expanded} />}
            <span>{summaryText}</span>
          </button>
          <div className="flex items-center gap-2">
            {onDiscard && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={discarding || publishing}
                className="shrink-0 rounded border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
              >
                {discarding
                  ? (DISCARDING_LABELS[language] ?? DISCARDING_LABELS.en)
                  : (DISCARD_LABELS[language] ?? DISCARD_LABELS.en)}
              </button>
            )}
            <button
              type="button"
              onClick={onPublish}
              disabled={publishing}
              className="shrink-0 rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {publishLabel}
            </button>
          </div>
        </div>

        {expanded && changes && changes.length > 0 && (
          <div className="border-t border-amber-200 px-4 py-2 dark:border-amber-800">
            <ul className="space-y-0.5">
              {changes.map((change) => (
                <li
                  key={change.sectionType}
                  className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      change.changeType === "added"
                        ? "bg-green-500"
                        : change.changeType === "removed"
                          ? "bg-red-500"
                          : "bg-amber-500"
                    }`}
                  />
                  <span className="font-medium">{change.sectionType}</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    {changeTypeLabel(change.changeType, language)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return null;
}
