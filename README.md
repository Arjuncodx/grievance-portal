# District Collector Dashboard — Citizen Module

A Next.js (App Router + TypeScript) application for the Greater Chennai
Corporation's Public Grievance Redressal Portal. This delivery covers
**authentication, user profiles, and the full citizen module** (file a
complaint + track status). The codebase is structured so a Collector
dashboard (`/collector`) and a Department Officer dashboard (`/officer`)
can be built on top without refactoring anything here — placeholder pages
for both already exist and are role-protected.

## Tech Stack

- Next.js 14 (App Router), React, TypeScript
- MySQL via `mysql2` (parameterized queries only, no ORM)
- Tailwind CSS
- `bcryptjs` for password hashing, `jose` for JWT (httpOnly cookies), Next.js middleware for role-based route protection
- `nodemailer` for OTP emails
- `zod` for client + server validation
- OpenAI API for "Others" complaint classification (server-side only), with a keyword-based fallback classifier
- Leaflet.js + OpenStreetMap for the complaint-location map (no API key needed)

## 1. Prerequisites

- Node.js 18.18+ (Node 20 LTS recommended)
- MySQL 8.x running locally or reachable over the network
- (Optional) an SMTP account for real OTP emails — Gmail App Passwords work well for testing
- (Optional) an OpenAI API key for AI-based complaint classification

## 2. Setup

```bash
# 1. Install dependencies
npm install

# 2. Create the database and load the schema (creates the DB, all tables, and seed data)
mysql -u root -p < schema.sql

# 3. Configure environment variables
cp .env.example .env
# then edit .env with your DB credentials, JWT secret, SMTP creds, OpenAI key, etc.

# 4. (Optional) Seed 3 sample accounts — one per role, password: Passw0rd!
node scripts/seed-users.js

# 5. Run the dev server
npm run dev
```

The app will be available at http://localhost:3000. Visiting `/` redirects
to `/login` if you're not signed in, or to your role's home page if you are.

### Sample accounts (after running `scripts/seed-users.js`)

| Role | Email | Password |
|---|---|---|
| Collector | collector@chennai.gov.in | Passw0rd! |
| Department Officer (Electrical) | officer.electrical@chennai.gov.in | Passw0rd! |
| Citizen | citizen@example.com | Passw0rd! |

You can also just register fresh accounts via `/register`.

### Dev-mode OTPs

With `NEXT_PUBLIC_DEV_SHOW_OTP=true` in `.env` (the default in
`.env.example`), every OTP-sending endpoint also returns the plaintext OTP
in the API response, and the relevant pages show it in a "[Dev mode]"
banner — handy for testing the OTP flows without a working SMTP/SMS
gateway. **Set this to `false` (or remove it) before deploying to
production.**

## 3. Project Structure

```
district-collector-dashboard/
├── schema.sql                     # Full DB schema + seed data
├── scripts/seed-users.js          # Optional: seeds 3 sample accounts
├── middleware.ts                  # Role-based route protection (Edge-safe JWT verify via `jose`)
├── src/
│   ├── app/
│   │   ├── login/, register/, forgot-password/      # Auth pages
│   │   ├── profile/                                  # Profile page (all roles)
│   │   ├── citizen/                                   # Citizen landing, file-complaint, track-complaints
│   │   ├── officer/, collector/                       # Placeholder role dashboards
│   │   └── api/                                        # All API route handlers (see below)
│   ├── components/                # Header, Footer, MapPicker, StatusTracker, StatusBadge, PasswordStrengthMeter
│   ├── lib/                       # db, auth, jwt, otp, mailer, ai-classifier, validators, rate-limit, crypto, complaint-code, constants
│   └── types/                     # Shared TypeScript types
└── public/uploads/                # profile/ and complaints/ file uploads
```

## 4. Database

`schema.sql` creates:

- `zones`, `localities`, `streets` — the 15 GCC zones with real ward ranges, localities per zone, and generic placeholder streets per locality (documented in the file as needing a real GIS street master eventually)
- `departments` — exactly the 16 GCC departments
- `complaint_types` — the seeded complaint types, each mapped to a department, including "Others"
- `users`, `user_profiles`, `password_resets` (also used for the mobile-OTP and complaint-OTP flows), `complaints`, `complaint_status_history`

Complaint creation and its first status-history row are written inside a
single DB transaction (`withTransaction` in `src/lib/db.ts`).

## 5. Security Notes

- Every API route re-checks the session from the httpOnly JWT cookie server-side; a citizen can only ever read/write their own complaints and profile (enforced by `WHERE user_id = ?` / ownership checks, never by trusting client-supplied IDs).
- All SQL uses parameterized queries via `mysql2`.
- Passwords are hashed with bcrypt (cost factor 10); OTPs are hashed the same way before storage and expire after 10 minutes with a 5-attempt cap and 60-second resend cooldown.
- JWTs are signed with `jose` (HS256) and stored in an httpOnly, sameSite=lax cookie (secure in production).
- Aadhaar numbers are AES-256-GCM encrypted at rest and only ever displayed masked (`XXXX-XXXX-1234`).
- Login/register/forgot-password endpoints are rate-limited per IP and per email (in-memory — swap for Redis if you run multiple server instances).

## 6. API Endpoints

All endpoints are under `/api`. Authenticated endpoints read the session
from the `dcd_session` httpOnly cookie — no bearer tokens needed from the
client.

### Auth

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, confirmPassword, role, departmentId? }` | `departmentId` required only when `role = "department_officer"` |
| POST | `/api/auth/login` | `{ email, password }` | Sets the session cookie; response includes `redirectTo` based on role |
| POST | `/api/auth/logout` | — | Clears the session cookie |
| GET | `/api/auth/me` | — | Returns the logged-in user's basic info |
| POST | `/api/auth/forgot-password/request-otp` | `{ email }` | Always returns a generic message (doesn't reveal if the email exists) |
| POST | `/api/auth/forgot-password/verify-otp` | `{ email, otp }` | |
| POST | `/api/auth/forgot-password/reset-password` | `{ email, otp, newPassword, confirmPassword }` | |

**Example — login**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"citizen@example.com","password":"Passw0rd!"}'
```
```json
{ "message": "Login successful", "redirectTo": "/citizen", "role": "citizen" }
```

### Profile

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/profile` | Returns account info, profile fields, and a computed `completeness` percentage |
| PUT | `/api/profile` | Updates editable profile fields (name, gender, DOB, address, zone/ward, Aadhaar). Login email/role are never editable here. |
| POST | `/api/profile/mobile-otp/request` | `{ mobileNumber }` — starts re-verification of a new mobile number |
| POST | `/api/profile/mobile-otp/verify` | `{ mobileNumber, otp }` — verifies + saves the new number |
| POST | `/api/profile/change-password` | `{ currentPassword, newPassword, confirmPassword }` |
| POST | `/api/profile/photo` | `multipart/form-data`, field `photo` (jpg/png, ≤2MB) |

### Reference data (used by both the profile and complaint forms)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/departments` | All 16 departments |
| GET | `/api/complaint-types` | All complaint types, grouped by department |
| GET | `/api/locations/zones` | All 15 zones with ward ranges |
| GET | `/api/locations/localities?zoneId=9` | Localities in a zone |
| GET | `/api/locations/streets?localityId=17` | Streets in a locality |

### Complaints

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/complaints/otp/request` | `{ mobileNumber }` — the OTP gate on the file-complaint form |
| POST | `/api/complaints/otp/verify` | `{ mobileNumber, otp }` |
| POST | `/api/complaints/media` | `multipart/form-data`, field `media` (jpg/png/mp4, ≤10MB) — returns `mediaPath` to include in the submit call |
| POST | `/api/complaints` | Submits the complaint (see body shape below) |
| GET | `/api/complaints?code=&status=` | Lists the **logged-in citizen's own** complaints, optionally filtered |
| GET | `/api/complaints/:code` | Full detail + status history for one complaint (ownership-checked) |

**Example — submit a complaint**

```bash
curl -X POST http://localhost:3000/api/complaints \
  -H "Content-Type: application/json" \
  --cookie "dcd_session=<your session cookie>" \
  -d '{
    "firstName": "Ravi", "gender": "Male",
    "streetAddress": "12 Main Road", "pincode": "600018",
    "mobileNumber": "9876543210",
    "zoneId": 9, "wardNumber": 100, "localityId": 14, "streetId": 60,
    "specificLocation": "Near bus stop",
    "latitude": 13.0569, "longitude": 80.2425,
    "complaintTypeId": 1,
    "title": "Street light not working",
    "description": "The street light near the bus stop has been off for a week.",
    "isAnonymous": false
  }'
```
```json
{
  "message": "Your complaint has been registered in the Public Grievance Redressal Portal of GCC. You can check the current status of your complaint using your Complaint Number.",
  "complaintCode": "2026-618SGP",
  "department": "Electrical Department",
  "complaintType": "Street Light Not Functioning"
}
```

## 7. Map Provider

The complaint-location map (`src/components/MapPicker.tsx`) uses Leaflet.js
with free OpenStreetMap tiles — no API key required. If you later obtain a
Google Maps API key, swap this component's internals for the Google Maps
JS API (`@vis.gl/react-google-maps` or similar); the parent form only
depends on the `{ value: {lat,lng}, onChange }` prop contract, so nothing
else needs to change.

## 8. What's Next

The `department_officer` (`/officer`) and `collector` (`/collector`)
dashboards are currently placeholder pages, gated by the same
role-based middleware as everything else. Building them out (complaint
review/approval queues, status updates, collector verification) reuses
the same `complaints` / `complaint_status_history` tables and the
`ComplaintStatus` enum already defined in `src/types/index.ts` — no
schema changes needed.
