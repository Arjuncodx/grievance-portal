import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

/**
 * Wards the citizen may choose from.
 *
 * With `?areaId=`, the list is narrowed using `area_wards`. That mapping is
 * DERIVED (OpenStreetMap geocode of the area name intersected with GCC ward
 * polygons), never published by GCC, so the response says so and the form
 * labels the list as approximate. A ward resolved from an actual map pin
 * always overrides this.
 *
 * When no mapping exists for the area, every GCC ward is returned with
 * `filtered: false` so the caller cannot present it as area-specific.
 *
 * Labels are "Ward N", with the zone as a secondary line. GCC publishes no
 * official name per ward, so none is invented.
 */
export async function GET(req: NextRequest) {
  const areaId = Number(req.nextUrl.searchParams.get("areaId")) || null;
  const localityId = Number(req.nextUrl.searchParams.get("localityId")) || null;

  let mapped: RowDataPacket[] = [];
  let confidence: "verified" | "derived" | null = null;

  if (areaId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ward_number, is_primary, confidence
         FROM area_wards WHERE area_id = ?
        ORDER BY is_primary DESC, ward_number ASC`,
      [areaId]
    );
    mapped = rows;
  } else if (localityId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ward_number, 0 AS is_primary, confidence
         FROM locality_wards WHERE locality_id = ?`,
      [localityId]
    );
    mapped = rows;
  }

  if (mapped.length > 0) {
    confidence = (mapped[0].confidence as "verified" | "derived") ?? "derived";
  }

  const filtered = mapped.length > 0;
  const wardNumbers = mapped.map((r) => r.ward_number as number);
  const primaryWard = mapped.find((r) => r.is_primary === 1)?.ward_number as
    | number
    | undefined;

  const [rows] = filtered
    ? await pool.query<RowDataPacket[]>(
        `SELECT zw.ward_number, zw.zone_id, z.zone_number, z.zone_name
           FROM zone_wards zw JOIN zones z ON z.id = zw.zone_id
          WHERE zw.ward_number IN (?)
          ORDER BY zw.ward_number ASC`,
        [wardNumbers]
      )
    : await pool.query<RowDataPacket[]>(
        `SELECT zw.ward_number, zw.zone_id, z.zone_number, z.zone_name
           FROM zone_wards zw JOIN zones z ON z.id = zw.zone_id
          ORDER BY zw.ward_number ASC`
      );

  const wards = rows.map((r) => ({
    wardNumber: r.ward_number as number,
    zoneId: r.zone_id as number,
    zoneNumber: r.zone_number as number,
    zoneName: r.zone_name as string,
    isPrimary: (r.ward_number as number) === primaryWard,
    label: `Ward ${r.ward_number}`,
    zoneLabel: r.zone_name as string
  }));

  // Order the likeliest ward first when the derivation found one.
  wards.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.wardNumber - b.wardNumber);

  return NextResponse.json({
    wards,
    filtered,
    confidence,
    totalWards: 200,
    // Shown verbatim by the form: never imply more precision than exists.
    notice: !filtered
      ? "No ward mapping is available for this area, so all 200 Greater Chennai Corporation wards are listed. Placing a pin on the map is the reliable way to determine the ward."
      : confidence === "derived"
      ? `Approximate list for this area — ${wards.length} of 200 wards. It is estimated from map data, not published by the Corporation, so please confirm. Placing a pin on the map determines the ward exactly.`
      : null,
    // Only offered as a suggestion; the form never auto-commits a derived ward.
    suggestedWard: filtered && primaryWard ? primaryWard : null
  });
}
