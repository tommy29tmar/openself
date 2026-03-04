// src/components/voice/VoiceOverlay.tsx
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useVoice } from "./VoiceProvider";
import { MicButton } from "./MicButton";
import { VoiceState } from "@/hooks/useVoiceManager";

export function VoiceOverlay() {
  const { voiceMode, voiceState, interimText, enabled } = useVoice();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!enabled || !mounted) return null;

  const isListening = voiceState === VoiceState.LISTENING;
  const isThinking = voiceState === VoiceState.WAITING || voiceState === VoiceState.TRANSCRIBING;
  const showPill = voiceMode && (!!interimText || isThinking);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>

      {/* Transcript pill — slides up above the FAB */}
      {showPill && (
        <div style={{
          position: "absolute",
          bottom: 148, // FAB (64px) + tab bar (56px) + gaps
          right: 20,
          maxWidth: "72vw",
          background: "rgba(8,8,10,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "10px 14px",
          pointerEvents: "none",
        }}>
          {interimText ? (
            <p style={{
              margin: 0,
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              fontFamily: "monospace",
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}>
              {interimText}
            </p>
          ) : (
            <p style={{
              margin: 0,
              fontSize: 11,
              color: "rgba(201,169,110,0.75)",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              Updating your page…
            </p>
          )}
        </div>
      )}

      {/* Listening label */}
      {isListening && !interimText && (
        <div style={{
          position: "absolute",
          bottom: 148,
          right: 20,
          pointerEvents: "none",
        }}>
          <p style={{
            margin: 0,
            fontSize: 11,
            color: "rgba(255,100,80,0.8)",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>
            Listening…
          </p>
        </div>
      )}

      {/* FAB — always visible, bottom-right above tab bar */}
      <div style={{
        position: "absolute",
        bottom: 72, // 56px tab bar + 16px gap
        right: 20,
        pointerEvents: "auto",
      }}>
        <MicButton size="large" />
      </div>

    </div>,
    document.body
  );
}
