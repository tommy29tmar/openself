export function isVoiceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_ENABLED === "true";
}

export function isServerSttEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED === "true";
}
