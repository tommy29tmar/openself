"use client";

import { useState, useRef, useCallback } from "react";

export enum VoiceSttState {
  IDLE = "idle",
  LISTENING = "listening",
  TRANSCRIBING = "transcribing",
  ERROR = "error",
  PERMISSION_DENIED = "permission_denied",
}

export type SttResult = { text: string; isFinal: boolean };

export function isSttResult(v: unknown): v is SttResult {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as any).text === "string" &&
    typeof (v as any).isFinal === "boolean"
  );
}

type UseSttProviderOptions = {
  language: string;
  onResult: (result: SttResult) => void;
  onFinalResult: (text: string) => void;
  useServerFallback: boolean;
  serverSttAvailable: boolean;
};

export function useSttProvider({
  language,
  onResult,
  onFinalResult,
  useServerFallback,
  serverSttAvailable,
}: UseSttProviderOptions) {
  const [state, setState] = useState<VoiceSttState>(VoiceSttState.IDLE);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  // NOTE: All error-recovery setTimeout calls should store IDs and be cleared in stop()
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Web Speech API path
  const startWebSpeech = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setState(VoiceSttState.LISTENING);

    recognition.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      if (interimText) onResult({ text: interimText, isFinal: false });
      if (finalText) {
        onResult({ text: finalText, isFinal: true });
        onFinalResult(finalText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setState(VoiceSttState.PERMISSION_DENIED);
      } else if (event.error !== "aborted") {
        setState(VoiceSttState.ERROR);
        errorTimerRef.current = setTimeout(() => setState(VoiceSttState.IDLE), 3000);
      }
    };

    recognition.onend = () => {
      // Speech ended naturally — nothing to do, onresult already fired
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch {
      setState(VoiceSttState.ERROR);
      return false;
    }
  }, [language, onResult, onFinalResult]);

  // Server fallback path (MediaRecorder + POST /api/transcribe)
  // Stub for now — wired in Task 10
  const startServerFallback = useCallback(() => {
    setState(VoiceSttState.ERROR);
    return false;
  }, []);

  const start = useCallback(() => {
    if (state !== VoiceSttState.IDLE) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      startWebSpeech();
    } else if (useServerFallback && serverSttAvailable) {
      startServerFallback();
    } else {
      setState(VoiceSttState.ERROR);
    }
  }, [state, startWebSpeech, startServerFallback, useServerFallback, serverSttAvailable]);

  const stop = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(VoiceSttState.IDLE);
  }, []);

  return { sttState: state, startStt: start, stopStt: stop };
}
