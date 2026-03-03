// src/components/voice/VoiceOverlay.tsx
"use client";

import { useVoice } from "./VoiceProvider";
import { MicButton } from "./MicButton";
import { VoiceState } from "@/hooks/useVoiceManager";

export function VoiceOverlay() {
  const { voiceMode, voiceState, interimText, enabled } = useVoice();

  if (!enabled) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-6 pt-4 bg-transparent">
      {/* Interim text display */}
      {voiceMode && interimText && (
        <div
          role="status"
          aria-live="polite"
          style={{ fontFamily: "monospace", fontSize: 13, color: "rgba(255,255,255,0.5)", padding: "4px 16px" }}
        >
          ... {interimText}
        </div>
      )}

      {/* State indicator */}
      {voiceMode && voiceState === VoiceState.WAITING && (
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground animate-pulse">
          Thinking...
        </div>
      )}

      {/* Mic button */}
      <div className="flex items-center gap-4">
        <MicButton size="large" />
      </div>
    </div>
  );
}
