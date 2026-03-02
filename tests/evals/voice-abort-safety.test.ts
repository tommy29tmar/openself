import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("STT abort safety contracts", () => {
  const sttSource = readFileSync(
    join(process.cwd(), "src/hooks/useSttProvider.ts"),
    "utf-8"
  );

  it("stop() sets abortedRef.current = true BEFORE calling recorder.stop()", () => {
    const stopFn = sttSource.slice(
      sttSource.indexOf("const stop = useCallback"),
      sttSource.indexOf("}, [])", sttSource.indexOf("const stop = useCallback")) + 6
    );
    const abortedIdx = stopFn.indexOf("abortedRef.current = true");
    const recorderStopIdx = stopFn.indexOf("mediaRecorderRef.current.stop");
    expect(abortedIdx).toBeGreaterThan(-1);
    expect(recorderStopIdx).toBeGreaterThan(-1);
    expect(abortedIdx).toBeLessThan(recorderStopIdx);
  });

  it("onstop handler checks abortedRef at the top before any upload", () => {
    const onstopIdx = sttSource.indexOf("recorder.onstop");
    expect(onstopIdx).toBeGreaterThan(-1);
    const afterOnstop = sttSource.slice(onstopIdx, onstopIdx + 1000);
    const abortCheckIdx = afterOnstop.indexOf("abortedRef.current");
    const fetchIdx = afterOnstop.indexOf('fetch("/api/transcribe"');
    expect(abortCheckIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(abortCheckIdx).toBeLessThan(fetchIdx);
  });

  it("onstop handler checks abortedRef again after fetch completes", () => {
    const onstopIdx = sttSource.indexOf("recorder.onstop");
    const afterOnstop = sttSource.slice(onstopIdx);
    const fetchIdx = afterOnstop.indexOf('fetch("/api/transcribe"');
    const afterFetch = afterOnstop.slice(fetchIdx);
    expect(afterFetch.indexOf("abortedRef.current")).toBeGreaterThan(0);
  });

  it("VoiceSttState enum has exactly 5 states", async () => {
    const { VoiceSttState } = await import("@/hooks/useSttProvider");
    const validStates = ["idle", "listening", "transcribing", "error", "permission_denied"];
    expect(Object.values(VoiceSttState).sort()).toEqual(validStates.sort());
  });
});
