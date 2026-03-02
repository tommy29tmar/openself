"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export enum TtsState {
  IDLE = "idle",
  SPEAKING = "speaking",
  ERROR = "error",
}

type UseTtsProviderOptions = {
  language: string;
  onSpeakingDone?: () => void;
};

export function useTtsProvider({ language, onSpeakingDone }: UseTtsProviderOptions) {
  const [state, setState] = useState<TtsState>(TtsState.IDLE);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis || !text.trim()) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;

      utterance.onstart = () => setState(TtsState.SPEAKING);
      utterance.onend = () => {
        setState(TtsState.IDLE);
        onSpeakingDone?.();
      };
      utterance.onerror = (event) => {
        if (event.error !== "canceled") {
          setState(TtsState.ERROR);
          errorTimerRef.current = setTimeout(() => setState(TtsState.IDLE), 3000);
        } else {
          setState(TtsState.IDLE);
        }
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [language, onSpeakingDone],
  );

  const stopSpeaking = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setState(TtsState.IDLE);
  }, []);

  // Cleanup on unmount — cancel any ongoing speech
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stopSpeaking();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ttsState: state, speak, stopSpeaking };
}
