import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

/**
 * Streets within a locality. An empty list is a normal answer, not an error:
 * the citizen can always type the street manually instead.
 */
export async function GET(req: NextRequest) {
  const localityId = Number(req.nextUrl.searchParams.get("localityId"));
  if (!localityId || Number.isNaN(localityId)) {
    return NextResponse.json({ error: "localityId query parameter is required" }, { status: 400 });
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, gcc_id, name, locality_id FROM gcc_streets WHERE locality_id = ? ORDER BY name ASC",
    [localityId]
  );
  return NextResponse.json({ streets: rows, allowManualEntry: true });
}
