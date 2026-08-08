import { getResend } from "./resend";

// Sends a short plain-text alert so a failed cron run is visible without
// anyone having to go check Vercel's logs (Section 9, Phase 6: "so a silent
// failure day is visible"). Best-effort — if this itself fails, that's
// logged and swallowed rather than crashing the caller.
export async function sendFailureAlert(subject: string, details: string[]): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.DIGEST_TO_EMAIL;

  if (!fromEmail || !toEmail) {
    console.error("Cannot send failure alert — RESEND_FROM_EMAIL or DIGEST_TO_EMAIL not set", {
      subject,
      details,
    });
    return;
  }

  try {
    await getResend().emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `Investor News Digest — ${subject}`,
      text: details.join("\n"),
    });
  } catch (error) {
    console.error("Failed to send failure alert email", error);
  }
}
