import { describe, it, expect } from "vitest";

describe("UnpublishedBanner", () => {
  describe("shouldShowUnpublishedBanner", () => {
    it("shows when there are unpublished changes, not publishing, not approval_pending, and authenticated", async () => {
      const { shouldShowUnpublishedBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowUnpublishedBanner({
          hasUnpublishedChanges: true,
          publishing: false,
          publishStatus: "draft",
          authenticated: true,
        }),
      ).toBe(true);
    });

    it("hides when not authenticated", async () => {
      const { shouldShowUnpublishedBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowUnpublishedBanner({
          hasUnpublishedChanges: true,
          publishing: false,
          publishStatus: "draft",
          authenticated: false,
        }),
      ).toBe(false);
    });

    it("hides when publishing", async () => {
      const { shouldShowUnpublishedBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowUnpublishedBanner({
          hasUnpublishedChanges: true,
          publishing: true,
          publishStatus: "draft",
          authenticated: true,
        }),
      ).toBe(false);
    });

    it("hides when publish status is approval_pending", async () => {
      const { shouldShowUnpublishedBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowUnpublishedBanner({
          hasUnpublishedChanges: true,
          publishing: false,
          publishStatus: "approval_pending",
          authenticated: true,
        }),
      ).toBe(false);
    });

    it("hides when no unpublished changes", async () => {
      const { shouldShowUnpublishedBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowUnpublishedBanner({
          hasUnpublishedChanges: false,
          publishing: false,
          publishStatus: "draft",
          authenticated: true,
        }),
      ).toBe(false);
    });
  });

  describe("shouldShowApprovalBanner", () => {
    it("shows when approval_pending and no unpublished changes", async () => {
      const { shouldShowApprovalBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowApprovalBanner({
          publishStatus: "approval_pending",
          hasUnpublishedChanges: false,
        }),
      ).toBe(true);
    });

    it("hides when approval_pending but has unpublished changes", async () => {
      const { shouldShowApprovalBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowApprovalBanner({
          publishStatus: "approval_pending",
          hasUnpublishedChanges: true,
        }),
      ).toBe(false);
    });

    it("hides when not approval_pending", async () => {
      const { shouldShowApprovalBanner } = await import(
        "@/components/layout/UnpublishedBanner"
      );
      expect(
        shouldShowApprovalBanner({
          publishStatus: "draft",
          hasUnpublishedChanges: false,
        }),
      ).toBe(false);
    });
  });
});
