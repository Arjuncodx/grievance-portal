import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { resendVerificationSchema } from "@/lib/validators";
import { createOtp, discardOtp, devOtpForResponse, getResendCooldown } from "@/lib/otp";
import { sendMail, emailVerificationHtml, isSmtpConfigured } from "@/lib/mailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { maskEmail } from "@/lib/email-mask";

/** Issues a fresh registration code, subject to the resend cooldown. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const body = await req.json();
    const parsed = resendVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { email } = parsed.data;

    const ipLimit = checkRateLimit(`resend-verify-ip:${ip}`, 12, 60 * 15);
    const emailLimit = checkRateLimit(`resend-verify:${email}`, 6, 60 * 15);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests for a new code. Please wait a few minutes." },
        { status: 429 }
      );
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, email_verified_at FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    // Don't reveal whether an address is registered: an unknown address gets
    // the same shape of reply as a pending one, minus any actual email.
    if (rows.length === 0 || rows[0].email_verified_at !== null) {
      const cooldown = await getResendCooldown(email, "email_verify");
      return NextResponse.json({
        message: `If ${maskEmail(email)} is awaiting verification, a new code has been sent.`,
        maskedEmail: maskEmail(email),
        cooldownRemaining: cooldown || 60,
        emailSent: false
      });
    }

    if (!isSmtpConfigured()) {
      console.error("[api/auth/verify-email/resend] SMTP is not configured.");
      return NextResponse.json(
        {
          error:
            "The email service is not configured, so no code could be sent. " +
            "Please contact the Corporation helpdesk.",
          emailSent: false
        },
        { status: 503 }
      );
    }

    const { otp, cooldownRemaining } = await createOtp(email, "email_verify", rows[0].id as number);

    if (cooldownRemaining) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldownRemaining}s before requesting another code.`,
          cooldownRemaining,
          emailSent: false
        },
        { status: 429 }
      );
    }

    const mail = await sendMail(email, "Verify your email address", emailVerificationHtml(otp));

    if (!mail.ok) {
      await discardOtp(email, "email_verify");
      return NextResponse.json(
        {
          error:
            "We could not send the verification email just now. Please try again in a moment.",
          emailSent: false,
          canResend: true
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: `A new code is on its way to ${maskEmail(email)}.`,
      maskedEmail: maskEmail(email),
      cooldownRemaining: 60,
      emailSent: true,
      devOtp: devOtpForResponse(otp)
    });
  } catch (err) {
    console.error("[api/auth/verify-email/resend]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
