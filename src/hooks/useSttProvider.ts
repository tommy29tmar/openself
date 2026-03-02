"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortedRef = useRef(false); // CRITICAL: prevents onstop from uploading after user abort
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    recognition.onend = () => {};

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
  const startServerFallback = useCallback(async () => {
    abortedRef.current = false; // Reset on new start
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        // Cleanup stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        // CRITICAL: If user aborted, skip upload entirely
        if (abortedRef.current) {
          setState(VoiceSttState.IDLE);
          return;
        }

        if (chunks.length === 0) {
          setState(VoiceSttState.IDLE);
          return;
        }

        setState(VoiceSttState.TRANSCRIBING);
        const blob = new Blob(chunks, { type: recorder.mimeType });

        // POST to server
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");

        abortRef.current = new AbortController();
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
            signal: abortRef.current.signal,
          });

          // Double-check abort flag (could have been set during fetch)
          if (abortedRef.current) return;

          if (!res.ok) {
            setState(VoiceSttState.ERROR);
            errorTimerRef.current = setTimeout(() => setState(VoiceSttState.IDLE), 3000);
            return;
          }
          const data = await res.json();
          if (abortedRef.current) return; // Check again after parsing

          if (data.text?.trim()) {
            onResult({ text: data.text.trim(), isFinal: true });
            onFinalResult(data.text.trim());
          } else {
            setState(VoiceSttState.IDLE);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setState(VoiceSttState.IDLE);
          } else {
            setState(VoiceSttState.ERROR);
            errorTimerRef.current = setTimeout(() => setState(VoiceSttState.IDLE), 3000);
          }
        }
      };

      setState(VoiceSttState.LISTENING);
      recorder.start();

      // Auto-stop after max duration (60s safety)
      autoStopTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording" && !abortedRef.current) {
          recorder.stop();
        }
      }, 60_000);

      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setState(VoiceSttState.PERMISSION_DENIED);
      } else {
        setState(VoiceSttState.ERROR);
      }
      return false;
    }
  }, [onResult, onFinalResult]);

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
    // Set abort flag FIRST — prevents onstop handler from uploading
    abortedRef.current = true;

    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop(); // triggers onstop, but abortedRef prevents upload
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort(); // cancel any in-flight fetch
      abortRef.current = null;
    }
    setState(VoiceSttState.IDLE);
  }, []);

  // Cleanup on unmount — release mic, cancel timers, abort fetch
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { sttState: state, startStt: start, stopStt: stop };
}
