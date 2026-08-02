import { QQBOT_SEND_MSG_AUTO_URL } from "../../constants/notifications/config";
import type { Env } from "../../schemas/env";

type QqBotEnvironment = Pick<Env, "QQBOT_TOKEN" | "QQBOT_UID">;

type QqBotSendOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function configuredQqBot(env: QqBotEnvironment): { token: string; uid: number } {
  const token = env.QQBOT_TOKEN?.trim();
  if (!token) throw new Error("QQBOT_TOKEN is required");

  const uid = Number(env.QQBOT_UID);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error("QQBOT_UID must be a positive integer");
  }
  return { token, uid };
}

function redactToken(message: string, token: string | undefined): string {
  if (token === undefined) return message;
  const values = [token, token.trim()].filter(
    (value, index, candidates) => value.length > 0 && candidates.indexOf(value) === index
  );
  return values.reduce((redacted, value) => redacted.split(value).join("[redacted]"), message);
}

export async function sendQqBotAutoMessage(
  env: QqBotEnvironment,
  message: string,
  options: QqBotSendOptions = {}
): Promise<void> {
  try {
    const { token, uid } = configuredQqBot(env);
    const fetcher = options.fetcher ?? fetch;
    const timeoutMs = options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(QQBOT_SEND_MSG_AUTO_URL, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, uid, msg: message })
      });
      if (!response.ok) {
        throw new Error(`QQ bot request failed with status ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("QQ bot request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    throw new Error(
      redactToken(error instanceof Error ? error.message : "QQ bot request failed", env.QQBOT_TOKEN)
    );
  }
}
