import { describe, expect, it, vi, beforeEach } from "vitest";

const insertErrorLog = vi.fn().mockResolvedValue({ error: null });
const insertNotificationAttempt = vi.fn().mockResolvedValue({ error: null });
const sendDiscordMessage = vi.fn().mockResolvedValue(undefined);

// notify() resolves the webhook from the request's owner, which means two
// extra reads before anything is sent.
const ownerLookup = { data: { owner_id: "u1" } };
const profileLookup: { data: { discord_webhook_url: string | null } | null } = { data: { discord_webhook_url: null } };

function selectChain(result: unknown) {
  return { select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) };
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "error_logs") return { insert: insertErrorLog };
      if (table === "notification_attempts") return { insert: insertNotificationAttempt };
      if (table === "content_requests") return selectChain(ownerLookup);
      if (table === "profiles") return selectChain(profileLookup);
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
    profileLookup.data = { discord_webhook_url: null };
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
    profileLookup.data = { discord_webhook_url: "https://discord.test/mine" };

    const error = new Error("connection reset by peer");
    const result = await toLoggedActionError(error, "provider_call", { requestId: "r1" });

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).not.toContain("connection reset by peer");
    expect(insertErrorLog).toHaveBeenCalledTimes(1);
    expect(sendDiscordMessage).toHaveBeenCalledTimes(1);
  });

  it("sends to the request owner's own webhook", async () => {
    profileLookup.data = { discord_webhook_url: "https://discord.test/mine" };

    await toLoggedActionError(new Error("boom"), "provider_call", { requestId: "r1" });

    expect(sendDiscordMessage).toHaveBeenCalledWith("https://discord.test/mine", expect.any(String));
  });

  it("still logs the error when the owner has set no webhook, rather than failing", async () => {
    profileLookup.data = { discord_webhook_url: null };

    const result = await toLoggedActionError(new Error("boom"), "provider_call", { requestId: "r1" });

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(insertErrorLog).toHaveBeenCalledTimes(1);
    expect(sendDiscordMessage).not.toHaveBeenCalled();
  });

  it("still logs an error that has no request to attribute it to", async () => {
    // With no requestId there is no owner to look up, and outside a
    // request scope there is no session either. The error still has to be
    // recorded — an unreported crash is the worst outcome here.
    const result = await toLoggedActionError(new Error("connection reset by peer"), "provider_call");

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(insertErrorLog).toHaveBeenCalledTimes(1);
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
