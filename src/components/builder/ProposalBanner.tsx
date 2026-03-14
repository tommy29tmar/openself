"use client";

import { useState, useEffect } from "react";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { formatProposalContent } from "@/lib/i18n/format-proposal-content";

type Proposal = {
  id: number;
  sectionType: string;
  currentContent: string;
  proposedContent: string;
  issueType: string;
  reason: string;
  severity: string;
};

export function ProposalBanner({ language }: { language: string }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const t = getUiL10n(language);

  useEffect(() => {
    fetch("/api/proposals")
      .then((r) => r.json())
      .then((data) => {
        if (data.proposals?.length > 0) {
          setProposals(data.proposals);
        }
      })
      .catch(() => {});
  }, []);

  if (proposals.length === 0) return null;

  return (
    <>
      <div
        className="cursor-pointer border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm transition-colors hover:bg-blue-100"
        onClick={() => setShowPanel(true)}
      >
        <span className="font-medium">
          {proposals.length} {t.improvementsReady}
        </span>
        <span className="ml-2 text-blue-600">{t.review} &rarr;</span>
      </div>
      {showPanel && (
        <ProposalReviewPanel
          proposals={proposals}
          onClose={() => setShowPanel(false)}
          onUpdate={setProposals}
          language={language}
        />
      )}
    </>
  );
}

function ProposalReviewPanel({
  proposals,
  onClose,
  onUpdate,
  language,
}: {
  proposals: Proposal[];
  onClose: () => void;
  onUpdate: (p: Proposal[]) => void;
  language: string;
}) {
  const [loading, setLoading] = useState<number | "all" | null>(null);
  const t = getUiL10n(language);

  async function handleAccept(id: number) {
    setLoading(id);
    const res = await fetch(`/api/proposals/${id}/accept`, { method: "POST" });
    if (res.ok) {
      onUpdate(proposals.filter((p) => p.id !== id));
    }
    setLoading(null);
  }

  async function handleReject(id: number) {
    setLoading(id);
    await fetch(`/api/proposals/${id}/reject`, { method: "POST" });
    onUpdate(proposals.filter((p) => p.id !== id));
    setLoading(null);
  }

  async function handleAcceptAll() {
    setLoading("all");
    const res = await fetch("/api/proposals/accept-all", { method: "POST" });
    if (res.ok) {
      onUpdate([]);
    }
    setLoading(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{t.pageImprovements}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4 p-4">
          {proposals.map((p) => (
            <div key={p.id} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium capitalize">{p.sectionType}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                  {p.issueType.replace("_", " ")}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    p.severity === "medium" ? "bg-amber-100" : "bg-gray-100"
                  }`}
                >
                  {p.severity}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-600">{p.reason}</p>
              <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-500">
                    {t.current}
                  </div>
                  <div className="whitespace-pre-line rounded bg-red-50 p-2">
                    {formatProposalContent(p.currentContent)}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-500">
                    {t.proposed}
                  </div>
                  <div className="whitespace-pre-line rounded bg-green-50 p-2">
                    {formatProposalContent(p.proposedContent)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(p.id)}
                  disabled={loading !== null}
                  className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {t.accept}
                </button>
                <button
                  onClick={() => handleReject(p.id)}
                  disabled={loading !== null}
                  className="rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300 disabled:opacity-50"
                >
                  {t.reject}
                </button>
              </div>
            </div>
          ))}
        </div>

        {proposals.length > 1 && (
          <div className="flex justify-end border-t p-4">
            <button
              onClick={handleAcceptAll}
              disabled={loading !== null}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              {t.acceptAll} ({proposals.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
