import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

/**
 * Streets, by `areaId` or by `localityId`.
 *
 * The complaint form asks for area then street directly — a separate locality
 * step was redundant, since every street already belongs to exactly one
 * locality. Each street is therefore returned with its locality name, which the
 * form shows as a secondary line to disambiguate the many repeated street names
 * ("1ST STREET" exists in dozens of localities), and the locality is recorded
 * on the complaint from the street the citizen picks.
 *
 * An empty list is a normal answer, not an error: the citizen can always type
 * the street manually instead.
 */
export async function GET(req: NextRequest) {
  const localityId = Number(req.nextUrl.searchParams.get("localityId")) || null;
  const areaId = Number(req.nextUrl.searchParams.get("areaId")) || null;

  if (!localityId && !areaId) {
    return NextResponse.json(
      { error: "Provide either areaId or localityId" },
      { status: 400 }
    );
  }

  const [rows] = localityId
    ? await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.gcc_id, s.name, s.locality_id, l.name AS locality_name
           FROM gcc_streets s JOIN gcc_localities l ON l.id = s.locality_id
          WHERE s.locality_id = ?
          ORDER BY s.name ASC`,
        [localityId]
      )
    : await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.gcc_id, s.name, s.locality_id, l.name AS locality_name
           FROM gcc_streets s JOIN gcc_localities l ON l.id = s.locality_id
          WHERE l.area_id = ?
          ORDER BY s.name ASC`,
        [areaId]
      );

  return NextResponse.json({
    streets: rows.map((r) => ({
      id: r.id as number,
      gcc_id: r.gcc_id as number,
      name: r.name as string,
      locality_id: r.locality_id as number,
      locality_name: r.locality_name as string
    })),
    allowManualEntry: true
  });
}
