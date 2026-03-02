// src/components/voice/VoiceOverlay.tsx
"use client";

import { useVoice } from "./VoiceProvider";
import { MicButton } from "./MicButton";
import { VoiceState } from "@/hooks/useVoiceManager";

type VoiceOverlayProps = {
  onOpenChat: () => void;
};

export function VoiceOverlay({ onOpenChat }: VoiceOverlayProps) {
  const { voiceMode, voiceState, interimText, enabled } = useVoice();

  if (!enabled) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-6 pt-4 bg-gradient-to-t from-background/90 to-transparent">
      {/* Interim text display */}
      {voiceMode && interimText && (
        <div className="mx-4 rounded-lg bg-background/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
          {interimText}
        </div>
      )}

      {/* State indicator */}
      {voiceMode && voiceState === VoiceState.WAITING && (
        <div className="text-xs text-muted-foreground animate-pulse">
          Thinking...
        </div>
      )}

      {/* Buttons row */}
      <div className="flex items-center gap-4">
        <MicButton size="large" />
        <button
          type="button"
          onClick={onOpenChat}
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-accent"
          aria-label="Open chat"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
