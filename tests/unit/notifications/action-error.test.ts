import { describe, expect, it, vi, beforeEach } from "vitest";

const insertErrorLog = vi.fn().mockResolvedValue({ error: null });
const insertNotificationAttempt = vi.fn().mockResolvedValue({ error: null });
const sendDiscordMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "error_logs") return { insert: insertErrorLog };
      if (table === "notification_attempts") return { insert: insertNotificationAttempt };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/lib/notifications/discord", () => ({
  sendDiscordMessage,
}));

const { toLoggedActionError, bestEffort } = await import("@/lib/notifications/action-error");
const { DomainError } = await import("@/lib/domain/errors");

describe("toLoggedActionError", () => {
  beforeEach(() => {
    insertErrorLog.mockClear();
    insertNotificationAttempt.mockClear();
    sendDiscordMessage.mockClear();
  });

  it("rethrows Next.js redirect control-flow signals unchanged", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(toLoggedActionError(redirectError, "test_stage")).rejects.toBe(redirectError);
    expect(insertErrorLog).not.toHaveBeenCalled();
  });

  it("rethrows Next.js notFound control-flow signals unchanged", async () => {
    const notFoundError = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    await expect(toLoggedActionError(notFoundError, "test_stage")).rejects.toBe(notFoundError);
    expect(insertErrorLog).not.toHaveBeenCalled();
  });

  it.each(["VALIDATION_ERROR", "PERMISSION_DENIED", "INVALID_STATE", "STALE_VERSION", "APPROVAL_REQUIRED", "DUPLICATE_QUEUE_ITEM", "SELF_APPROVAL"])(
    "maps expected domain error %s without logging or notifying",
    async (code) => {
      const error = new DomainError(code, "test_stage", "Something expected happened.");
      const result = await toLoggedActionError(error, "test_stage");

      expect(result).toEqual({ code, stage: "test_stage", message: "Something expected happened.", retrySafe: false });
      expect(insertErrorLog).not.toHaveBeenCalled();
      expect(sendDiscordMessage).not.toHaveBeenCalled();
    }
  );

  it("logs and notifies for an unexpected raw error, and returns a safe generic message", async () => {
    const originalWebhook = process.env.DISCORD_ERRORS_WEBHOOK_URL;
    process.env.DISCORD_ERRORS_WEBHOOK_URL = "https://discord.test/webhook";

    const error = new Error("connection reset by peer");
    const result = await toLoggedActionError(error, "provider_call", { requestId: "r1" });

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).not.toContain("connection reset by peer");
    expect(insertErrorLog).toHaveBeenCalledTimes(1);
    expect(sendDiscordMessage).toHaveBeenCalledTimes(1);

    process.env.DISCORD_ERRORS_WEBHOOK_URL = originalWebhook;
  });

  it("still logs the error but skips Discord when no errors webhook is configured", async () => {
    const originalWebhook = process.env.DISCORD_ERRORS_WEBHOOK_URL;
    delete process.env.DISCORD_ERRORS_WEBHOOK_URL;

    const error = new Error("connection reset by peer");
    const result = await toLoggedActionError(error, "provider_call");

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(insertErrorLog).toHaveBeenCalledTimes(1);
    expect(sendDiscordMessage).not.toHaveBeenCalled();

    process.env.DISCORD_ERRORS_WEBHOOK_URL = originalWebhook;
  });

  it("still returns a safe result when the error log insert itself fails", async () => {
    insertErrorLog.mockRejectedValueOnce(new Error("db unavailable"));
    const error = new Error("provider timeout");

    const result = await toLoggedActionError(error, "provider_call");

    expect(result.code).toBe("INTERNAL_ERROR");
  });

  it("still returns a safe result when the Discord notification itself fails", async () => {
    sendDiscordMessage.mockRejectedValueOnce(new Error("webhook unreachable"));
    const error = new Error("provider timeout");

    const result = await toLoggedActionError(error, "provider_call");

    expect(result.code).toBe("INTERNAL_ERROR");
  });
});

describe("bestEffort", () => {
  it("swallows a rejected promise without throwing", async () => {
    await expect(bestEffort(() => Promise.reject(new Error("boom")))).resolves.toBeUndefined();
  });

  it("resolves normally when the function succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("done");
    await expect(bestEffort(fn)).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalled();
  });
});
