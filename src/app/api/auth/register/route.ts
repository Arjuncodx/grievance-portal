import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createOtp, discardOtp, devOtpForResponse } from "@/lib/otp";
import { sendMail, emailVerificationHtml, isSmtpConfigured } from "@/lib/mailer";
import { maskEmail } from "@/lib/email-mask";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`register:${ip}`, 10, 60 * 15);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json({ error: firstIssue.message }, { status: 400 });
    }

    const { email, password, role, departmentId } = parsed.data;

    if (!isSmtpConfigured()) {
      // Creating an account we cannot send a code for would strand the user.
      console.error("[api/auth/register] SMTP is not configured; registration is unavailable.");
      return NextResponse.json(
        {
          error:
            "Registration is temporarily unavailable because the email service is not configured. " +
            "Please contact the Corporation helpdesk."
        },
        { status: 503 }
      );
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id, email_verified_at, email_verification_exempt
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    let userId: number;
    const prior = existing[0];

    if (prior) {
      const alreadyUsable =
        prior.email_verified_at !== null || prior.email_verification_exempt === 1;
      if (alreadyUsable) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in instead." },
          { status: 409 }
        );
      }
      // The address was registered but never verified, so nobody controls this
      // account yet and it grants no access. Let the new attempt take it over
      // with the password just supplied, then re-send a code.
      userId = prior.id as number;
    } else {
      userId = 0;
    }

    if (role === "department_officer" && departmentId) {
      const [dept] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM departments WHERE id = ? LIMIT 1",
        [departmentId]
      );
      if (dept.length === 0) {
        return NextResponse.json({ error: "Selected department is invalid." }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const finalDepartmentId = role === "department_officer" ? departmentId ?? null : null;

    if (userId) {
      await pool.query(
        `UPDATE users SET password_hash = ?, role = ?, department_id = ?,
                          email_verified_at = NULL, email_verification_exempt = 0
         WHERE id = ?`,
        [passwordHash, role, finalDepartmentId, userId]
      );
    } else {
      // email_verified_at stays NULL: the account exists but grants no access
      // until a code from this address is accepted.
      const [ins] = await pool.query<ResultSetHeader>(
        `INSERT INTO users (email, password_hash, role, department_id, email_verification_exempt)
         VALUES (?, ?, ?, ?, 0)`,
        [email, passwordHash, role, finalDepartmentId]
      );
      userId = ins.insertId;
    }

    const { otp, cooldownRemaining } = await createOtp(email, "email_verify", userId);

    if (cooldownRemaining) {
      // A code sent moments ago is still valid — don't issue a second one.
      return NextResponse.json({
        message: `A verification code was already sent to ${maskEmail(email)}. Please check your inbox.`,
        email,
        maskedEmail: maskEmail(email),
        cooldownRemaining,
        emailSent: false
      });
    }

    const mail = await sendMail(email, "Verify your email address", emailVerificationHtml(otp));

    if (!mail.ok) {
      // Do not claim we sent anything. Retire the unusable code so the user is
      // not later asked for a code that never arrived.
      await discardOtp(email, "email_verify");
      return NextResponse.json(
        {
          error:
            "Your account was created, but we could not send the verification email. " +
            "Please use “Resend code” in a moment, or contact the helpdesk if it keeps failing.",
          email,
          maskedEmail: maskEmail(email),
          emailSent: false,
          canResend: true
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: `We sent a 6-digit verification code to ${maskEmail(email)}.`,
      email,
      maskedEmail: maskEmail(email),
      emailSent: true,
      devOtp: devOtpForResponse(otp)
    });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
