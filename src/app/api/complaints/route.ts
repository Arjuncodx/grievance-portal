import { NextRequest, NextResponse } from "next/server";
import pool, { withTransaction } from "@/lib/db";
import { getSessionFromCookies } from "@/lib/auth";
import { complaintSubmitSchema } from "@/lib/validators";
import { generateUniqueComplaintCode } from "@/lib/complaint-code";
import { classifyComplaint } from "@/lib/ai-classifier";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    const body = await req.json();
    const parsed = complaintSubmitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const data = parsed.data;

    // Validate ward number against the selected zone's real range.
    const [zoneRows] = await pool.query<RowDataPacket[]>(
      "SELECT ward_start, ward_end FROM zones WHERE id = ?",
      [data.zoneId]
    );
    if (zoneRows.length === 0) {
      return NextResponse.json({ error: "Invalid zone selected." }, { status: 400 });
    }
    const { ward_start, ward_end } = zoneRows[0];
    if (data.wardNumber < ward_start || data.wardNumber > ward_end) {
      return NextResponse.json(
        { error: `Ward number must be between ${ward_start} and ${ward_end} for the selected zone.` },
        { status: 400 }
      );
    }

    // Validate locality belongs to zone, street belongs to locality.
    const [localityRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM localities WHERE id = ? AND zone_id = ?",
      [data.localityId, data.zoneId]
    );
    if (localityRows.length === 0) {
      return NextResponse.json({ error: "Selected locality does not belong to the selected zone." }, { status: 400 });
    }
    const [streetRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM streets WHERE id = ? AND locality_id = ?",
      [data.streetId, data.localityId]
    );
    if (streetRows.length === 0) {
      return NextResponse.json({ error: "Selected street does not belong to the selected locality." }, { status: 400 });
    }

    // Resolve complaint type + department, handling "Others" via AI /
    // keyword classification.
    const [typeRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, department_id FROM complaint_types WHERE id = ?",
      [data.complaintTypeId]
    );
    if (typeRows.length === 0) {
      return NextResponse.json({ error: "Invalid complaint type." }, { status: 400 });
    }
    const complaintType = typeRows[0];

    let departmentId = complaintType.department_id as number;
    let needsManualReview = false;

    if (complaintType.name === "Others") {
      const textToClassify = data.otherDescription?.trim() || data.description;
      const classification = await classifyComplaint(textToClassify);
      needsManualReview = classification.needsManualReview;

      const [deptRows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM departments WHERE name = ?",
        [classification.department]
      );
      departmentId = deptRows.length > 0 ? deptRows[0].id : departmentId;
    } else if (data.departmentId) {
      departmentId = data.departmentId;
    }

    const complaintCode = await generateUniqueComplaintCode();

    const result = await withTransaction(async (conn) => {
      const [insertResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO complaints (
          complaint_code, user_id, initials, first_name, last_name, gender,
          street_address, pincode, mobile_number, phone_number, email,
          zone_id, ward_number, locality_id, street_id, specific_location,
          latitude, longitude, department_id, complaint_type_id, title,
          description, media_path, is_anonymous, needs_manual_review, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Complaint Filed')`,
        [
          complaintCode,
          session?.userId ?? null,
          data.initials || null,
          data.firstName,
          data.lastName || null,
          data.gender,
          data.streetAddress,
          data.pincode,
          data.mobileNumber || null,
          data.phoneNumber || null,
          data.email || null,
          data.zoneId,
          data.wardNumber,
          data.localityId,
          data.streetId,
          data.specificLocation || null,
          data.latitude ?? null,
          data.longitude ?? null,
          departmentId,
          data.complaintTypeId,
          data.title,
          data.description,
          data.mediaPath || null,
          data.isAnonymous ? 1 : 0,
          needsManualReview ? 1 : 0
        ]
      );

      const complaintId = insertResult.insertId;

      await conn.query(
        `INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by)
         VALUES (?, 'Complaint Filed', 'Citizen', 'Complaint registered by citizen.', ?)`,
        [complaintId, session?.userId ?? null]
      );

      return complaintId;
    });

    const [deptNameRows] = await pool.query<RowDataPacket[]>(
      "SELECT name FROM departments WHERE id = ?",
      [departmentId]
    );

    return NextResponse.json({
      message:
        "Your complaint has been registered in the Public Grievance Redressal Portal of GCC. You can check the current status of your complaint using your Complaint Number.",
      complaintCode,
      complaintId: result,
      department: deptNameRows[0]?.name,
      complaintType: complaintType.name
    });
  } catch (err) {
    console.error("[api/complaints POST]", err);
    return NextResponse.json({ error: "Something went wrong while submitting your complaint. Please try again." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "citizen") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code")?.trim();
  const status = searchParams.get("status")?.trim();

  let query = `
    SELECT c.id, c.complaint_code, c.title, c.status, c.rejected_stage, c.remarks,
           c.created_at, c.zone_id, c.locality_id, c.is_anonymous,
           d.name AS department_name, ct.name AS complaint_type_name,
           z.zone_name, l.name AS locality_name
    FROM complaints c
    JOIN departments d ON d.id = c.department_id
    JOIN complaint_types ct ON ct.id = c.complaint_type_id
    JOIN zones z ON z.id = c.zone_id
    JOIN localities l ON l.id = c.locality_id
    WHERE c.user_id = ?`;
  const params: (string | number)[] = [session.userId];

  if (code) {
    query += " AND c.complaint_code LIKE ?";
    params.push(`%${code}%`);
  }
  if (status) {
    query += " AND c.status = ?";
    params.push(status);
  }

  query += " ORDER BY c.created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(query, params);

  return NextResponse.json({ complaints: rows });
}
