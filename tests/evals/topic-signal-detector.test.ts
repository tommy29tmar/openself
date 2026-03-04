import { describe, it, expect } from "vitest";
import { isNewTopicSignal } from "@/lib/agent/policies/topic-signal-detector";

describe("isNewTopicSignal", () => {
  it("long message (>60 chars) is a new topic", () => {
    expect(isNewTopicSignal("this is a fairly long message that definitely has a new request in it", "en")).toBe(true);
  });

  it("short affirmations are NOT new topics", () => {
    for (const msg of ["ok", "sure", "yes", "sì", "ok!", "👍", "perfetto", "bello", "thanks"]) {
      expect(isNewTopicSignal(msg, "en")).toBe(false);
    }
  });

  it("continuation phrases are NOT new topics even if longer than 60 chars", () => {
    expect(isNewTopicSignal("yes, do it — go ahead", "en")).toBe(false);
    expect(isNewTopicSignal("continue, please go on with the previous task", "en")).toBe(false);
    expect(isNewTopicSignal("sì, continua pure con quello che stavi facendo", "it")).toBe(false);
  });

  it("action verbs in English trigger new topic", () => {
    expect(isNewTopicSignal("change the layout", "en")).toBe(true);
    expect(isNewTopicSignal("add my new job", "en")).toBe(true);
    expect(isNewTopicSignal("remove that skill", "en")).toBe(true);
  });

  it("action verbs in Italian trigger new topic", () => {
    expect(isNewTopicSignal("cambia il layout", "it")).toBe(true);
    expect(isNewTopicSignal("aggiungi il mio nuovo lavoro", "it")).toBe(true);
    expect(isNewTopicSignal("rimuovi quella competenza", "it")).toBe(true);
  });

  it("action phrases in Japanese trigger new topic", () => {
    expect(isNewTopicSignal("レイアウトを変更して", "ja")).toBe(true);
    expect(isNewTopicSignal("新しい仕事を追加してください", "ja")).toBe(true);
  });

  it("short Japanese acknowledgments do NOT trigger new topic", () => {
    // These were false positives with old character-class regex
    expect(isNewTopicSignal("はい", "ja")).toBe(false);      // 'い' was in [してください]
    expect(isNewTopicSignal("分かりました", "ja")).toBe(false);
    expect(isNewTopicSignal("了解", "ja")).toBe(false);
  });

  it("unknown language falls back to English patterns", () => {
    expect(isNewTopicSignal("change the layout", "xx")).toBe(true);
  });

  it("Italian action in English session is detected", () => {
    // User switches language mid-session — should still detect new topic
    expect(isNewTopicSignal("cambia il layout", "en")).toBe(true);
  });

  it("Italian continuation in English session is NOT new topic", () => {
    expect(isNewTopicSignal("sì, continua pure", "en")).toBe(false);
  });
});
