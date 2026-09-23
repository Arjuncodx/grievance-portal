import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

/**
 * Wards the citizen may choose from.
 *
 * With `?areaId=` or `?localityId=`, the list is narrowed using
 * `locality_wards` — but only when that table actually holds a mapping for the
 * selection. No verified area-to-ward mapping is published by GCC, so the table
 * ships empty and the response says `filtered: false`, meaning the full ward
 * list is being returned and the caller must not present it as area-specific.
 *
 * Labels are "Ward N - <zone>". The zone comes from the ward boundary dataset.
 * GCC does not publish an official name per ward, so none is invented.
 */
export async function GET(req: NextRequest) {
  const areaId = Number(req.nextUrl.searchParams.get("areaId")) || null;
  const localityId = Number(req.nextUrl.searchParams.get("localityId")) || null;

  let mapped: RowDataPacket[] = [];
  if (localityId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT lw.ward_number, lw.confidence
         FROM locality_wards lw
        WHERE lw.locality_id = ?`,
      [localityId]
    );
    mapped = rows;
  } else if (areaId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT lw.ward_number, lw.confidence
         FROM locality_wards lw
         JOIN gcc_localities l ON l.id = lw.locality_id
        WHERE l.area_id = ?`,
      [areaId]
    );
    mapped = rows;
  }

  const filtered = mapped.length > 0;
  const wardNumbers = mapped.map((r) => r.ward_number as number);

  const [rows] = filtered
    ? await pool.query<RowDataPacket[]>(
        `SELECT zw.ward_number, zw.zone_id, z.zone_number, z.zone_name
           FROM zone_wards zw
           JOIN zones z ON z.id = zw.zone_id
          WHERE zw.ward_number IN (?)
          ORDER BY zw.ward_number ASC`,
        [wardNumbers]
      )
    : await pool.query<RowDataPacket[]>(
        `SELECT zw.ward_number, zw.zone_id, z.zone_number, z.zone_name
           FROM zone_wards zw
           JOIN zones z ON z.id = zw.zone_id
          ORDER BY zw.ward_number ASC`
      );

  const wards = rows.map((r) => ({
    wardNumber: r.ward_number as number,
    zoneId: r.zone_id as number,
    zoneNumber: r.zone_number as number,
    zoneName: r.zone_name as string,
    // No official per-ward name exists, so the label identifies the ward by
    // number and its zone rather than inventing a ward name.
    label: `Ward ${r.ward_number} — ${r.zone_name}`
  }));

  return NextResponse.json({
    wards,
    filtered,
    // Surfaced verbatim by the form so the citizen is not led to believe the
    // list has been narrowed to their area when it has not.
    notice: filtered
      ? null
      : "No verified area-to-ward mapping is loaded, so every Greater Chennai Corporation ward is listed. Placing a pin on the map is the reliable way to determine the ward.",
    autofillWard: filtered && wards.length === 1 ? wards[0].wardNumber : null
  });
}
