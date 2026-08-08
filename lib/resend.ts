import { Resend } from "resend";

let client: Resend | undefined;

export function getResend(): Resend {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY must be set");
  client = new Resend(apiKey);
  return client;
}
