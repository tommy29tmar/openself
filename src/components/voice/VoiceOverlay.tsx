// src/components/voice/VoiceOverlay.tsx
"use client";

import { useVoice } from "./VoiceProvider";
import { MicButton } from "./MicButton";
import { VoiceState } from "@/hooks/useVoiceManager";

export function VoiceOverlay() {
  const { voiceMode, voiceState, interimText, enabled } = useVoice();

  if (!enabled) return null;

  const isListening = voiceState === VoiceState.LISTENING;
  const isThinking = voiceState === VoiceState.WAITING || voiceState === VoiceState.TRANSCRIBING;

  return (
    <div style={{
      position: "fixed",
      right: 20,
      bottom: 72, // 56px tab bar + 16px margin
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 8,
      pointerEvents: "none",
    }}>
      {/* Transcript text — appears above FAB while listening */}
      {voiceMode && interimText && (
        <div style={{
          background: "rgba(0,0,0,0.7)",
          color: "rgba(255,255,255,0.85)",
          fontSize: 13,
          fontFamily: "monospace",
          padding: "6px 12px",
          borderRadius: 8,
          maxWidth: "72vw",
          lineHeight: 1.4,
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
        }}>
          {interimText}
        </div>
      )}

      {/* State label — thinking */}
      {voiceMode && isThinking && !interimText && (
        <div style={{
          color: "rgba(201,169,110,0.7)",
          fontSize: 11,
          fontFamily: "monospace",
          letterSpacing: "0.08em",
          pointerEvents: "none",
        }}>
          …
        </div>
      )}

      {/* FAB mic button */}
      <div style={{ pointerEvents: "auto" }}>
        <MicButton size="large" />
      </div>
    </div>
  );
}
