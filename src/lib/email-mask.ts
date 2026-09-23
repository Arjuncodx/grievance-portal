/**
 * Masks an email for display on the verification screen: enough for the user to
 * recognise their own address, not enough to expose it to a shoulder-surfer or
 * to a screenshot.
 *
 *   arjun.datta@gmail.com -> a**********a@gmail.com
 *   ab@x.com              -> a*@x.com
 *   a@x.com               -> *@x.com
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  let maskedLocal: string;
  if (local.length <= 1) maskedLocal = "*";
  else if (local.length === 2) maskedLocal = local[0] + "*";
  else maskedLocal = local[0] + "*".repeat(local.length - 2) + local[local.length - 1];

  return `${maskedLocal}@${domain}`;
}
