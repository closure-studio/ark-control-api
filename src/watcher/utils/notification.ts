import { QQBOT_SEND_MSG_AUTO_URL } from "../constants/config";

export interface SendQqBotAutoMessageInput {
  token: string;
  uid: number;
  msg: string;
  fetcher?: typeof fetch;
}

function validateToken(token: string): void {
  if (typeof token !== "string" || token.trim().length === 0) {
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
  const response = await fetcher(QQBOT_SEND_MSG_AUTO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: input.token,
      uid: input.uid,
      msg: input.msg,
    }),
  });

  if (!response.ok) {
    throw new Error(`QQ bot request failed with status ${response.status}`);
  }
}
