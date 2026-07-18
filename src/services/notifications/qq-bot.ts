import { QQBOT_SEND_MSG_AUTO_URL } from "../../constants/notifications/config";

export type SendQqBotAutoMessageInput = {
  token: string;
  uid: number;
  msg: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function validateToken(token: string): void {
  if (token.trim().length === 0) {
    throw new Error("QQBOT_TOKEN is required");
  }
}

function validateUid(uid: number): void {
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error("QQBOT_UID must be a positive integer");
  }
}

export async function sendQqBotAutoMessage(input: SendQqBotAutoMessageInput): Promise<void> {
  validateToken(input.token);
  validateUid(input.uid);

  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = input.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(QQBOT_SEND_MSG_AUTO_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token: input.token,
        uid: input.uid,
        msg: input.msg
      })
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
}
