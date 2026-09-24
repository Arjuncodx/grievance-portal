/**
 * Exports the collected complaint dataset to JSON, ready for the spreadsheet
 * writer (scripts/export-to-xlsx.py).
 *
 *   node scripts/export-complaints.js                 # everything
 *   node scripts/export-complaints.js --from 2026-01-01 --to 2026-12-31
 *   node scripts/export-complaints.js --out other.json
 *
 * Usually run via `npm run export:excel`, which chains this with the writer.
 *
 * IDs are resolved to names here rather than in the spreadsheet, so the output
 * is readable on its own: department, zone, complaint category and sub type,
 * and the street — whether it was picked from the GCC list or typed in.
 *
 * CONTAINS PERSONAL DATA: complainant names, mobile numbers, email addresses
 * and map coordinates. Treat the file accordingly.
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { getDbConfig, describeDb } = require("./db-config");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const FROM = arg("--from", null);
const TO = arg("--to", null);
const OUT = arg("--out", path.join(__dirname, "..", "exports", "complaints.json"));

(async () => {
  console.log("Database: " + describeDb());
  const conn = await mysql.createConnection(getDbConfig());

  const where = [];
  const params = [];
  if (FROM) {
    where.push("c.created_at >= ?");
    params.push(FROM + " 00:00:00");
  }
  if (TO) {
    where.push("c.created_at <= ?");
    params.push(TO + " 23:59:59");
  }
  const filter = where.length ? " WHERE " + where.join(" AND ") : "";

  // LEFT JOINs throughout: a complaint uses either the GCC reference data or
  // the original locality/street tables, and a manually typed street has
  // neither, so an INNER JOIN would silently drop rows.
  const [complaints] = await conn.query(
    `SELECT
        c.complaint_code                            AS 'Complaint No',
        DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS 'Filed On',
        c.status                                    AS 'Status',
        c.rejected_stage                            AS 'Rejected At',
        cc.name                                     AS 'Complaint Type',
        COALESCE(cs.label, ct.name)                 AS 'Complaint Sub Type',
        d.name                                      AS 'Department',
        CASE
          WHEN c.needs_manual_review = 1 THEN 'Needs officer review'
          ELSE 'Auto-routed'
        END                                         AS 'Routing',
        cs.mapping_status                           AS 'Routing Basis',
        z.zone_number                               AS 'Zone No',
        z.zone_name                                 AS 'Zone',
        c.ward_number                               AS 'Ward',
        c.ward_source                               AS 'Ward Determined By',
        ga.name                                     AS 'Area',
        COALESCE(gl.name, l.name)                   AS 'Locality',
        COALESCE(
          gs.name,
          NULLIF(TRIM(CONCAT(COALESCE(c.manual_street_name,''),' ',COALESCE(c.street_type,''))), ''),
          s.name
        )                                           AS 'Street',
        CASE WHEN c.gcc_street_id IS NULL AND c.manual_street_name IS NOT NULL
             THEN 'Typed by citizen' ELSE 'From GCC list' END AS 'Street Source',
        c.specific_location                         AS 'Landmark',
        c.location_pincode                          AS 'Location PIN',
        c.latitude                                  AS 'Latitude',
        c.longitude                                 AS 'Longitude',
        c.title                                     AS 'Title',
        c.description                               AS 'Details',
        CASE WHEN c.is_anonymous = 1 THEN 'Yes' ELSE 'No' END AS 'Anonymous',
        CASE WHEN c.is_anonymous = 1 THEN NULL
             ELSE TRIM(CONCAT(COALESCE(c.initials,''),' ',c.first_name,' ',COALESCE(c.last_name,'')))
        END                                         AS 'Complainant',
        CASE WHEN c.is_anonymous = 1 THEN NULL ELSE c.gender END      AS 'Gender',
        CASE WHEN c.is_anonymous = 1 THEN NULL ELSE c.mobile_number END AS 'Mobile',
        CASE WHEN c.is_anonymous = 1 THEN NULL ELSE c.email END        AS 'Email',
        CASE WHEN c.is_anonymous = 1 THEN NULL ELSE c.street_address END AS 'Complainant Address',
        CASE WHEN c.media_path IS NULL THEN 'No' ELSE 'Yes' END       AS 'Photo Attached',
        DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i')                   AS 'Last Updated'
     FROM complaints c
     LEFT JOIN departments d           ON d.id  = c.department_id
     LEFT JOIN complaint_subtypes cs   ON cs.id = c.complaint_subtype_id
     LEFT JOIN complaint_categories cc ON cc.id = cs.category_id
     LEFT JOIN complaint_types ct      ON ct.id = c.complaint_type_id
     LEFT JOIN zones z                 ON z.id  = c.zone_id
     LEFT JOIN gcc_areas ga            ON ga.id = c.gcc_area_id
     LEFT JOIN gcc_localities gl       ON gl.id = c.gcc_locality_id
     LEFT JOIN gcc_streets gs          ON gs.id = c.gcc_street_id
     LEFT JOIN localities l            ON l.id  = c.locality_id
     LEFT JOIN streets s               ON s.id  = c.street_id
     ${filter}
     ORDER BY c.created_at DESC`,
    params
  );

  const [history] = await conn.query(
    `SELECT
        c.complaint_code                             AS 'Complaint No',
        h.status                                     AS 'Status',
        h.stage                                      AS 'Changed By Role',
        h.remarks                                    AS 'Remarks',
        DATE_FORMAT(h.created_at, '%Y-%m-%d %H:%i')  AS 'Changed On'
      FROM complaint_status_history h
      JOIN complaints c ON c.id = h.complaint_id
      ${filter.replace(/\bc\.created_at\b/g, "c.created_at")}
      ORDER BY c.complaint_code, h.created_at`,
    params
  );

  // Aggregates the spreadsheet turns into its summary sheet.
  const [byDept] = await conn.query(
    `SELECT COALESCE(d.name,'(unassigned)') AS name, COUNT(*) AS n
       FROM complaints c LEFT JOIN departments d ON d.id = c.department_id
      GROUP BY d.name ORDER BY n DESC`
  );
  const [byStatus] = await conn.query(
    "SELECT status AS name, COUNT(*) AS n FROM complaints GROUP BY status ORDER BY n DESC"
  );
  const [byZone] = await conn.query(
    `SELECT COALESCE(z.zone_name,'(unknown)') AS name, COUNT(*) AS n
       FROM complaints c LEFT JOIN zones z ON z.id = c.zone_id
      GROUP BY z.zone_name ORDER BY n DESC`
  );
  const [byType] = await conn.query(
    `SELECT COALESCE(cc.name,'(legacy type)') AS name, COUNT(*) AS n
       FROM complaints c
       LEFT JOIN complaint_subtypes cs ON cs.id = c.complaint_subtype_id
       LEFT JOIN complaint_categories cc ON cc.id = cs.category_id
      GROUP BY cc.name ORDER BY n DESC`
  );

  const [[users]] = await conn.query("SELECT COUNT(*) n FROM users");
  const [sources] = await conn.query(
    `SELECT dataset, source_label, is_official, fetched_at, row_count
       FROM reference_data_sources ORDER BY dataset`
  );

  const bundle = {
    generatedAt: new Date().toISOString(),
    database: describeDb(),
    filter: { from: FROM, to: TO },
    counts: {
      complaints: complaints.length,
      statusChanges: history.length,
      registeredAccounts: users.n
    },
    complaints,
    history,
    summary: {
      byDepartment: byDept,
      byStatus: byStatus,
      byZone: byZone,
      byType: byType
    },
    referenceSources: sources.map((r) => ({
      dataset: r.dataset,
      source: r.source_label,
      official: r.is_official === 1 ? "Yes" : "No",
      fetchedAt: r.fetched_at ? new Date(r.fetched_at).toISOString().slice(0, 10) : null,
      rows: r.row_count
    }))
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2), "utf8");

  console.log(
    "Exported " + complaints.length + " complaint(s) and " +
    history.length + " status change(s)"
  );
  console.log("  -> " + OUT);
  if (complaints.length === 0) {
    console.log("  (no complaints yet — the workbook will have headers only)");
  }

  await conn.end();
})().catch((e) => {
  console.error("Export failed:", e.message);
  process.exit(1);
});
