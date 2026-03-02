"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSttProvider, VoiceSttState } from "./useSttProvider";
import { useTtsProvider } from "./useTtsProvider";
import { useCapabilityDetection } from "./useCapabilityDetection";
import { isVoiceEnabled } from "@/lib/voice/feature-flags";

export enum VoiceState {
  IDLE = "idle",
  LISTENING = "listening",
  TRANSCRIBING = "transcribing",
  WAITING = "waiting",
  SPEAKING = "speaking",
  ERROR = "error",
  PERMISSION_DENIED = "permission_denied",
  UNAVAILABLE = "unavailable",
}

type UseVoiceManagerOptions = {
  language: string;
};

export function useVoiceManager({ language }: UseVoiceManagerOptions) {
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.IDLE);
  const [interimText, setInterimText] = useState("");
  const [lastFinalTranscript, setLastFinalTranscript] = useState<string | null>(
    null,
  );
  const voiceModeRef = useRef(false);

  const caps = useCapabilityDetection();
  const enabled = isVoiceEnabled();

  const { speak, stopSpeaking } = useTtsProvider({
    language,
    onSpeakingDone: () => {
      if (voiceModeRef.current) {
        setVoiceState(VoiceState.LISTENING);
        startSttInternal();
      } else {
        setVoiceState(VoiceState.IDLE);
      }
    },
  });

  const startSttRef = useRef<() => void>(() => {});

  const { sttState, startStt, stopStt } = useSttProvider({
    language,
    onResult: (result) => {
      if (!result.isFinal) {
        setInterimText(result.text);
      } else {
        setInterimText("");
      }
    },
    onFinalResult: (text) => {
      setVoiceState(VoiceState.WAITING);
      setLastFinalTranscript(text);
    },
    useServerFallback: !caps.webSpeechSTT,
    serverSttAvailable: caps.serverSTT === true,
  });

  const startSttInternal = useCallback(() => {
    startStt();
  }, [startStt]);

  startSttRef.current = startSttInternal;

  // Consume transcript — called by ChatPanel after appending message
  const consumeTranscript = useCallback(() => {
    setLastFinalTranscript(null);
  }, []);

  // Sync STT state to voice state
  useEffect(() => {
    if (sttState === VoiceSttState.LISTENING)
      setVoiceState(VoiceState.LISTENING);
    if (sttState === VoiceSttState.TRANSCRIBING)
      setVoiceState(VoiceState.TRANSCRIBING);
    if (sttState === VoiceSttState.PERMISSION_DENIED) {
      setVoiceState(VoiceState.PERMISSION_DENIED);
      setVoiceMode(false);
      voiceModeRef.current = false;
    }
    if (sttState === VoiceSttState.ERROR) {
      setVoiceState(VoiceState.ERROR);
    }
  }, [sttState]);

  const toggleVoiceMode = useCallback(async () => {
    if (!enabled) return;
    if (voiceMode) {
      // Exit voice mode
      stopStt();
      stopSpeaking();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceState(VoiceState.IDLE);
      setInterimText("");
    } else {
      // Enter voice mode — check capabilities first, then try to start
      const hasSTT = caps.webSpeechSTT || (await caps.checkServerSTT());
      if (!hasSTT) {
        setVoiceState(VoiceState.UNAVAILABLE);
        return;
      }
      // Start STT first — if it fails (PERMISSION_DENIED), the sync effect clears voiceMode
      startStt();
      setVoiceMode(true);
      voiceModeRef.current = true;
    }
  }, [enabled, voiceMode, caps, stopStt, stopSpeaking, startStt]);

  const speakResponse = useCallback(
    (text: string) => {
      if (!voiceModeRef.current || !caps.speechSynthesis) return;
      setVoiceState(VoiceState.SPEAKING);
      speak(text);
    },
    [caps.speechSynthesis, speak],
  );

  const abort = useCallback(() => {
    stopStt();
    stopSpeaking();
    setInterimText("");
    if (voiceModeRef.current) {
      setVoiceState(VoiceState.IDLE);
    }
  }, [stopStt, stopSpeaking]);

  // Disable voice mode when user types
  const disableVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      stopStt();
      stopSpeaking();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceState(VoiceState.IDLE);
      setInterimText("");
    }
  }, [stopStt, stopSpeaking]);

  return {
    voiceMode,
    voiceState,
    interimText,
    lastFinalTranscript,
    consumeTranscript,
    enabled,
    canUseVoice: enabled && (caps.webSpeechSTT || caps.serverSTT === true),
    toggleVoiceMode,
    speakResponse,
    abort,
    disableVoiceMode,
  };
}
