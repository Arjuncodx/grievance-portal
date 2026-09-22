import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

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

    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
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

    await pool.query<ResultSetHeader>(
      "INSERT INTO users (email, password_hash, role, department_id) VALUES (?, ?, ?, ?)",
      [email, passwordHash, role, finalDepartmentId]
    );

    return NextResponse.json({ message: "Account created successfully. Please log in." });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
