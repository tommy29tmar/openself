"use client";

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
}: {
  hasUnpublishedChanges: boolean;
  publishing: boolean;
  publishStatus: string;
  authenticated: boolean;
  onPublish: () => void;
  unpublishedChangesLabel: string;
  publishLabel: string;
}) {
  const showApproval = shouldShowApprovalBanner({ publishStatus, hasUnpublishedChanges });
  const showUnpublished = shouldShowUnpublishedBanner({
    hasUnpublishedChanges,
    publishing,
    publishStatus,
    authenticated,
  });

  if (showApproval) {
    return (
      <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950">
        <span className="shrink-0 font-medium text-amber-800 dark:text-amber-200">
          Ready to publish
        </span>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {publishing ? "Publishing..." : "Publish"}
        </button>
      </div>
    );
  }

  if (showUnpublished) {
    return (
      <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950">
        <span className="text-amber-800 dark:text-amber-200">
          {unpublishedChangesLabel}
        </span>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="shrink-0 rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {publishLabel}
        </button>
      </div>
    );
  }

  return null;
}
