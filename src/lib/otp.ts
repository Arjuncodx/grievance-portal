import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import {
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS
} from "@/lib/constants";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export type OtpPurpose = "password_reset" | "mobile_verify" | "complaint_mobile_verify";

function generateOtp(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

/**
 * Creates and stores a new (hashed) OTP for the given identifier + purpose.
 * Enforces a resend cooldown. Returns the plaintext OTP so the caller can
 * email/SMS it (and optionally return it in dev mode).
 */
export async function createOtp(
  identifier: string,
  purpose: OtpPurpose,
  userId: number | null
): Promise<{ otp: string; cooldownRemaining?: number }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT created_at FROM password_resets
     WHERE identifier = ? AND purpose = ? AND used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );

  if (rows.length > 0) {
    const lastCreated = new Date(rows[0].created_at as string).getTime();
    const elapsedSeconds = (Date.now() - lastCreated) / 1000;
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        otp: "",
        cooldownRemaining: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds)
      };
    }
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any previous unused OTPs for this identifier/purpose.
  await pool.query(
    `UPDATE password_resets SET used = TRUE
     WHERE identifier = ? AND purpose = ? AND used = FALSE`,
    [identifier, purpose]
  );

  await pool.query<ResultSetHeader>(
    `INSERT INTO password_resets (user_id, purpose, identifier, otp_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, purpose, identifier, otpHash, expiresAt]
  );

  return { otp };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "incorrect" };

export async function verifyOtp(
  identifier: string,
  purpose: OtpPurpose,
  submittedOtp: string
): Promise<OtpVerifyResult> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, otp_hash, expires_at, attempts, used FROM password_resets
     WHERE identifier = ? AND purpose = ? AND used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );

  if (rows.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const record = rows[0];

  if (new Date(record.expires_at as string).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = await bcrypt.compare(submittedOtp, record.otp_hash as string);

  if (!matches) {
    await pool.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?`, [
      record.id
    ]);
    return { ok: false, reason: "incorrect" };
  }

  return { ok: true };
}

/** Marks the most recent unused OTP for this identifier/purpose as used. */
export async function consumeOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  await pool.query(
    `UPDATE password_resets SET used = TRUE
     WHERE identifier = ? AND purpose = ? AND used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );
}
