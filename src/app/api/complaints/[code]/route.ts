import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionFromCookies } from "@/lib/auth";
import { RowDataPacket } from "mysql2";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "citizen") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.*, d.name AS department_name, ct.name AS complaint_type_name,
            z.zone_name, l.name AS locality_name, s.name AS street_name
     FROM complaints c
     JOIN departments d ON d.id = c.department_id
     JOIN complaint_types ct ON ct.id = c.complaint_type_id
     JOIN zones z ON z.id = c.zone_id
     JOIN localities l ON l.id = c.locality_id
     JOIN streets s ON s.id = c.street_id
     WHERE c.complaint_code = ?`,
    [params.code]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Complaint not found." }, { status: 404 });
  }

  const complaint = rows[0];

  // Enforce ownership: a citizen may only view their own complaints.
  if (complaint.user_id !== session.userId) {
    return NextResponse.json({ error: "You do not have access to this complaint." }, { status: 403 });
  }

  const [historyRows] = await pool.query<RowDataPacket[]>(
    "SELECT status, stage, remarks, created_at FROM complaint_status_history WHERE complaint_id = ? ORDER BY created_at ASC",
    [complaint.id]
  );

  return NextResponse.json({ complaint, history: historyRows });
}
