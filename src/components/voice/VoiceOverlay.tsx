// src/components/voice/VoiceOverlay.tsx
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useVoice } from "./VoiceProvider";
import { MicButton } from "./MicButton";
import { VoiceState } from "@/hooks/useVoiceManager";

// Layout constants (keep in sync with SplitView tab bar)
const TAB_BAR_H = 56;
const FAB_SIZE = 64;
const FAB_MARGIN = 16;
const FAB_BOTTOM = TAB_BAR_H + FAB_MARGIN; // 72
const PILL_BOTTOM = FAB_BOTTOM + FAB_SIZE + FAB_MARGIN; // 152

export function VoiceOverlay() {
  const { voiceMode, voiceState, interimText, enabled } = useVoice();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!enabled || !mounted) return null;

  const isListening = voiceState === VoiceState.LISTENING;
  const isThinking = voiceState === VoiceState.WAITING || voiceState === VoiceState.TRANSCRIBING;
  const isSpeaking = voiceState === VoiceState.SPEAKING;
  const showPill = voiceMode && (!!interimText || isThinking || isSpeaking);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>

      {/* Transcript / status pill — slides up above the FAB */}
      {showPill && (
        <div style={{
          position: "absolute",
          bottom: PILL_BOTTOM,
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
          ) : isSpeaking ? (
            <p style={{
              margin: 0,
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              Speaking…
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
          bottom: PILL_BOTTOM,
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
        bottom: FAB_BOTTOM,
        right: 20,
        pointerEvents: "auto",
      }}>
        <MicButton size="large" />
      </div>

    </div>,
    document.body
  );
}
