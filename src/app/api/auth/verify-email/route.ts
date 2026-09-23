import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { verifyEmailSchema } from "@/lib/validators";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { OTP_EXPIRY_MINUTES } from "@/lib/constants";

/**
 * Confirms a registration code and marks the address verified.
 *
 * Deliberately does NOT issue a session: verification proves the address, it is
 * not a sign-in, and it must never be a route to a role's permissions. The user
 * signs in normally afterwards and the role stored on the account decides what
 * they can reach.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const body = await req.json();
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { email, otp } = parsed.data;

    // Rate limit on top of the per-code attempt counter, so an attacker cannot
    // simply request a fresh code each time to reset the 5-attempt budget.
    const ipLimit = checkRateLimit(`verify-email-ip:${ip}`, 30, 60 * 15);
    const emailLimit = checkRateLimit(`verify-email:${email}`, 15, 60 * 15);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, email_verified_at FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "That code is not valid. Please request a new one." },
        { status: 400 }
      );
    }
    if (rows[0].email_verified_at !== null) {
      return NextResponse.json({
        message: "This email is already verified. You can sign in.",
        alreadyVerified: true
      });
    }

    const result = await verifyAndConsumeOtp(email, "email_verify", otp);

    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: "That code is no longer valid. Please request a new one.",
        expired: `That code has expired. Codes are valid for ${OTP_EXPIRY_MINUTES} minutes — please request a new one.`,
        too_many_attempts:
          "Too many incorrect attempts for this code. Please request a new one.",
        incorrect: "That code is incorrect."
      };
      const status = result.reason === "incorrect" ? 400 : 410;
      return NextResponse.json(
        {
          error: messages[result.reason],
          reason: result.reason,
          attemptsRemaining: result.attemptsRemaining,
          canResend: true
        },
        { status }
      );
    }

    await pool.query(
      `UPDATE users SET email_verified_at = NOW(), email_verification_exempt = 0
       WHERE id = ? AND email_verified_at IS NULL`,
      [rows[0].id]
    );

    return NextResponse.json({
      message: "Your email is verified. You can now sign in.",
      verified: true
    });
  } catch (err) {
    console.error("[api/auth/verify-email]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
