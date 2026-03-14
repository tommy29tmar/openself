import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("useToastManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a toast and returns it in the list", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const mgr = createToastManager({ maxVisible: 5, dismissAfterMs: 3000 });

    const toast = mgr.add("Operation complete", "success");

    expect(toast.message).toBe("Operation complete");
    expect(toast.type).toBe("success");
    expect(toast.id).toBeTruthy();
    expect(mgr.getVisible()).toHaveLength(1);
    expect(mgr.getVisible()[0].id).toBe(toast.id);
  });

  it("auto-dismisses after dismissAfterMs", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const mgr = createToastManager({ maxVisible: 5, dismissAfterMs: 3000 });

    mgr.add("Will disappear", "info");
    expect(mgr.getVisible()).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    expect(mgr.getVisible()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(mgr.getVisible()).toHaveLength(0);
  });

  it("respects maxVisible limit", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const mgr = createToastManager({ maxVisible: 3, dismissAfterMs: 5000 });

    mgr.add("Toast 1", "info");
    mgr.add("Toast 2", "success");
    mgr.add("Toast 3", "error");
    mgr.add("Toast 4", "info");

    const visible = mgr.getVisible();
    // Only the 3 most recent should be visible
    expect(visible).toHaveLength(3);
    expect(visible[0].message).toBe("Toast 2");
    expect(visible[1].message).toBe("Toast 3");
    expect(visible[2].message).toBe("Toast 4");
  });

  it("manually dismisses a toast by id", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const mgr = createToastManager({ maxVisible: 5, dismissAfterMs: 5000 });

    const t1 = mgr.add("Keep", "info");
    const t2 = mgr.add("Remove", "error");

    mgr.dismiss(t2.id);

    expect(mgr.getVisible()).toHaveLength(1);
    expect(mgr.getVisible()[0].id).toBe(t1.id);
  });

  it("uses default options when none provided", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const mgr = createToastManager();

    mgr.add("Default toast", "success");
    expect(mgr.getVisible()).toHaveLength(1);

    // Default dismissAfterMs is 3000
    vi.advanceTimersByTime(3000);
    expect(mgr.getVisible()).toHaveLength(0);
  });

  it("generates unique ids for each toast", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const mgr = createToastManager();

    const t1 = mgr.add("A", "info");
    const t2 = mgr.add("B", "info");
    const t3 = mgr.add("C", "info");

    expect(t1.id).not.toBe(t2.id);
    expect(t2.id).not.toBe(t3.id);
    expect(t1.id).not.toBe(t3.id);
  });

  it("calls onChange callback when toasts change", async () => {
    const { createToastManager } = await import("@/hooks/useToastManager");
    const onChange = vi.fn();
    const mgr = createToastManager({ dismissAfterMs: 3000, onChange });

    mgr.add("Hello", "success");
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    expect(onChange).toHaveBeenCalledTimes(2); // once for add, once for auto-dismiss
  });
});
