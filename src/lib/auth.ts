import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { JwtPayload, UserRole } from "@/types";

export const AUTH_COOKIE_NAME = "dcd_session";

export async function getSessionFromCookies(): Promise<JwtPayload | null> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookie(res: NextResponse, token: string) {
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });
}

export function clearAuthCookie(res: NextResponse) {
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export function requireRole(session: JwtPayload | null, roles: UserRole[]): boolean {
  if (!session) return false;
  return roles.includes(session.role);
}

/**
 * Session for a route that must not serve an unverified account.
 *
 * Re-checks verification against the database rather than trusting the token,
 * so revoking verification (or clearing the grandfather flag for a
 * re-verification campaign) takes effect immediately instead of waiting for
 * the 7-day token to expire.
 *
 * Returns null when there is no session or the account may not act yet.
 */
export async function getVerifiedSession(): Promise<JwtPayload | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT is_active, email_verified_at, email_verification_exempt
     FROM users WHERE id = ? LIMIT 1`,
    [session.userId]
  );
  if (rows.length === 0) return null;

  const u = rows[0];
  if (!u.is_active) return null;
  if (u.email_verified_at === null && u.email_verification_exempt !== 1) return null;

  return session;
}
