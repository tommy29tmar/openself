"use client";

import { useState, useEffect } from "react";

type AvatarSectionProps = {
  /** Called after upload/remove to trigger preview refresh */
  onAvatarChange?: () => void;
};

export function AvatarSection({ onAvatarChange }: AvatarSectionProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current avatar URL from preview/draft
  useEffect(() => {
    fetch("/api/preview")
      .then((r) => r.json())
      .then((data) => {
        const hero = data?.config?.sections?.find(
          (s: { type: string }) => s.type === "hero",
        );
        setAvatarUrl(hero?.content?.avatarUrl ?? null);
      })
      .catch(() => {});
  }, []);

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/media/avatar", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (data.success) {
          setAvatarUrl(data.url);
          onAvatarChange?.();
        } else {
          setError(data.error ?? "Upload failed");
        }
      } catch {
        setError("Upload failed");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleRemove = async () => {
    setError(null);
    try {
      const res = await fetch("/api/media/avatar", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setAvatarUrl(null);
        onAvatarChange?.();
      }
    } catch {
      setError("Remove failed");
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Avatar preview */}
      <div className="h-16 w-16 rounded-full overflow-hidden bg-[var(--page-bg-secondary,#f0f0f0)] flex items-center justify-center flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[var(--page-fg-secondary,#999)] text-lg">?</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"
        >
          {uploading ? "Uploading\u2026" : "Upload"}
        </button>
        {avatarUrl && (
          <button
            onClick={handleRemove}
            className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            Remove
          </button>
        )}
        {error && (
          <p className="text-[11px] text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
