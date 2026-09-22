"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  Search,
  UserRound,
  X
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

interface Zone {
  id: number;
  zone_number: number;
  zone_name: string;
  ward_start: number;
  ward_end: number;
}
interface Locality {
  id: number;
  zone_id: number;
  name: string;
}
interface Street {
  id: number;
  locality_id: number;
  name: string;
}
interface ComplaintType {
  id: number;
  name: string;
  department_id: number;
  is_frequent: number;
  department_name: string;
}

const FREQUENT_TYPE_NAMES = [
  "Street Light Not Functioning",
  "Garbage Not Collected",
  "Pothole / Road Damage",
  "Sewage Overflow",
  "Stagnation of Water",
  "Illegal Construction",
  "Others"
];

const STEPS = [
  { label: "Your Details", icon: UserRound },
  { label: "Location", icon: MapPin },
  { label: "Type", icon: Building2 },
  { label: "Details", icon: FileText }
];

export default function FileComplaintPage() {
  const [me, setMe] = useState<any>(null);
  const [checkedSession, setCheckedSession] = useState(false);

  const [step, setStep] = useState(1);

  // Step 1: personal details
  const [initials, setInitials] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [personEmail, setPersonEmail] = useState("");

  // Step 2: location
  const [zones, setZones] = useState<Zone[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [streets, setStreets] = useState<Street[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [wardNumber, setWardNumber] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [streetId, setStreetId] = useState("");
  const [specificLocation, setSpecificLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Step 3: department + type
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [typeTab, setTypeTab] = useState<"frequent" | "master">("frequent");
  const [typeSearch, setTypeSearch] = useState("");
  const [complaintTypeId, setComplaintTypeId] = useState("");
  const [otherDescription, setOtherDescription] = useState("");

  // Step 4: details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ complaintCode: string; department: string; complaintType: string } | null>(null);

  const selectedType = complaintTypes.find((t) => String(t.id) === complaintTypeId);
  const selectedZone = zones.find((z) => String(z.id) === zoneId);

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        setMe(meData.user);
        setPersonEmail(meData.user.email);

        const profileRes = await fetch("/api/profile");
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const profile = profileData.profile;
          if (profile) {
            setFirstName(profile.firstName || "");
            setLastName(profile.lastName || "");
            setGender(profile.gender || "");
            setPincode(profile.pincode || "");
            setStreetAddress(profile.doorNoAndStreet || "");
            setMobileNumber(profile.mobileNumber || "");
            if (profile.zoneId) setZoneId(String(profile.zoneId));
            if (profile.wardNumber) setWardNumber(String(profile.wardNumber));
          }
        }
      }
      setCheckedSession(true);
    }
    init();

    fetch("/api/locations/zones").then((r) => r.json()).then((d) => setZones(d.zones || []));
    fetch("/api/complaint-types").then((r) => r.json()).then((d) => setComplaintTypes(d.complaintTypes || []));
  }, []);

  useEffect(() => {
    if (!zoneId) {
      setLocalities([]);
      return;
    }
    fetch(`/api/locations/localities?zoneId=${zoneId}`)
      .then((r) => r.json())
      .then((d) => setLocalities(d.localities || []));
  }, [zoneId]);

  useEffect(() => {
    if (!localityId) {
      setStreets([]);
      return;
    }
    fetch(`/api/locations/streets?localityId=${localityId}`)
      .then((r) => r.json())
      .then((d) => setStreets(d.streets || []));
  }, [localityId]);

  function goToStep(n: number) {
    setSubmitError(null);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateDetails(): string | null {
    if (!firstName.trim()) return "First name is required.";
    if (!gender) return "Please select a gender.";
    if (!streetAddress.trim()) return "Street address is required.";
    if (!/^\d{6}$/.test(pincode)) return "Enter a valid 6-digit pincode.";
    if (mobileNumber && !/^[6-9]\d{9}$/.test(mobileNumber)) {
      return "Enter a valid 10-digit mobile number, or leave it blank.";
    }
    return null;
  }

  function validateLocation(): string | null {
    if (!zoneId) return "Please select a zone.";
    if (!wardNumber) return "Please enter a ward number.";
    if (selectedZone) {
      const w = Number(wardNumber);
      if (w < selectedZone.ward_start || w > selectedZone.ward_end) {
        return `Ward number must be between ${selectedZone.ward_start} and ${selectedZone.ward_end} for this zone.`;
      }
    }
    if (!localityId) return "Please select a locality.";
    if (!streetId) return "Please select a street.";
    return null;
  }

  function validateType(): string | null {
    if (!complaintTypeId) return "Please select a complaint type.";
    if (selectedType?.name === "Others" && !otherDescription.trim()) {
      return "Please describe the issue so it can be routed to the right department.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError("Complaint title is required.");
      return;
    }
    if (!description.trim()) {
      setSubmitError("Complaint details are required.");
      return;
    }

    setSubmitting(true);
    try {
      let mediaPath: string | undefined;
      if (mediaFile) {
        const formData = new FormData();
        formData.append("media", mediaFile);
        const mediaRes = await fetch("/api/complaints/media", { method: "POST", body: formData });
        const mediaData = await mediaRes.json();
        if (!mediaRes.ok) {
          setSubmitError(mediaData.error || "Failed to upload attachment.");
          setSubmitting(false);
          return;
        }
        mediaPath = mediaData.mediaPath;
      }

      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initials,
          firstName,
          lastName,
          gender,
          streetAddress,
          pincode,
          mobileNumber: mobileNumber || null,
          phoneNumber: phoneNumber || null,
          email: personEmail || null,
          zoneId: Number(zoneId),
          wardNumber: Number(wardNumber),
          localityId: Number(localityId),
          streetId: Number(streetId),
          specificLocation,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          departmentId: selectedType?.department_id ?? null,
          complaintTypeId: Number(complaintTypeId),
          otherDescription,
          title,
          description,
          mediaPath,
          isAnonymous
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit complaint.");
        setSubmitting(false);
        return;
      }
      setResult(data);
      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNewComplaint() {
    setResult(null);
    setTitle("");
    setDescription("");
    setMediaFile(null);
    setIsAnonymous(false);
    setComplaintTypeId("");
    setOtherDescription("");
    setSpecificLocation("");
    setCoords(null);
    goToStep(1);
  }

  const filteredMasterList = complaintTypes.filter((t) =>
    t.name.toLowerCase().includes(typeSearch.toLowerCase()) ||
    t.department_name.toLowerCase().includes(typeSearch.toLowerCase())
  );
  const groupedByDept = filteredMasterList.reduce<Record<string, ComplaintType[]>>((acc, t) => {
    acc[t.department_name] = acc[t.department_name] || [];
    acc[t.department_name].push(t);
    return acc;
  }, {});
  const frequentTypes = complaintTypes.filter((t) => FREQUENT_TYPE_NAMES.includes(t.name));

  if (!checkedSession) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <Header homeHref="/citizen" />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
          <div className="skeleton mb-3 h-8 w-56" />
          <div className="skeleton mb-8 h-4 w-72" />
          <div className="card space-y-4">
            <div className="skeleton h-5 w-48" />
            <div className="grid grid-cols-3 gap-4">
              <div className="skeleton h-11" />
              <div className="skeleton h-11" />
              <div className="skeleton h-11" />
            </div>
            <div className="skeleton h-11" />
            <div className="skeleton h-11" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Header userName={me?.email} homeHref="/citizen" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <Link
            href="/citizen"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle transition hover:text-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to dashboard
          </Link>
          <h1 className="mt-3 text-[1.75rem] font-extrabold leading-tight text-ink sm:text-[2rem]">
            File a Complaint
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Public Grievance Redressal &mdash; Greater Chennai Corporation
          </p>
        </div>

        {/* Stepper */}
        {step < 5 && (
          <ol className="mb-8 flex items-start">
            {STEPS.map((s, idx) => {
              const n = idx + 1;
              const done = step > n;
              const current = step === n;
              const Icon = s.icon;
              return (
                <li key={s.label} className="flex flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    <span
                      className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                        idx === 0 ? "bg-transparent" : done || current ? "bg-navy" : "bg-canvas-border"
                      }`}
                    />
                    <span
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border-2 text-xs font-bold transition-all duration-300 ease-spring ${
                        done
                          ? "border-navy bg-navy text-white"
                          : current
                            ? "scale-110 border-navy bg-white text-navy shadow-glow"
                            : "border-canvas-border bg-white text-ink-faint"
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span
                      className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                        idx === STEPS.length - 1 ? "bg-transparent" : done ? "bg-navy" : "bg-canvas-border"
                      }`}
                    />
                  </div>
                  <span
                    className={`mt-2 text-center text-[11px] font-semibold leading-tight transition-colors ${
                      current ? "text-navy" : done ? "text-ink-muted" : "text-ink-faint"
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* STEP 1: PERSONAL DETAILS */}
        {step === 1 && (
          <div className="card animate-fade-up">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">Your Details</h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Prefilled from your profile &mdash; edit anything out of date.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="form-label" htmlFor="initials">Initials</label>
                <input id="initials" className="form-input" value={initials} onChange={(e) => setInitials(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="fname">First Name</label>
                <input id="fname" required className="form-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="lname">Last Name</label>
                <input id="lname" className="form-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="mt-5">
              <span className="form-label">Gender</span>
              <div className="flex flex-wrap gap-2">
                {["Male", "Female", "Transgender"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    aria-pressed={gender === g}
                    className={gender === g ? "chip-active" : "chip-idle"}
                  >
                    {gender === g && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="form-label" htmlFor="streetAddr">Street Address</label>
              <input id="streetAddr" required className="form-input" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="cpincode">Pin Code</label>
                <input id="cpincode" inputMode="numeric" maxLength={6} required className="form-input" value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label className="form-label" htmlFor="cmobile">Mobile Number <span className="normal-case text-ink-faint">(optional)</span></label>
                <input id="cmobile" inputMode="numeric" maxLength={10} className="form-input" value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))} />
                <p className="form-hint">Only if you want SMS updates.</p>
              </div>
              <div>
                <label className="form-label" htmlFor="secPhone">Secondary Phone <span className="normal-case text-ink-faint">(optional)</span></label>
                <input id="secPhone" className="form-input" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="pEmail">Email Address</label>
                <input id="pEmail" type="email" className="form-input" value={personEmail}
                  disabled={!!me} onChange={(e) => setPersonEmail(e.target.value)} />
                {me && <p className="form-hint">From your account.</p>}
              </div>
            </div>

            {submitError && (
              <p className="form-error mt-4">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {submitError}
              </p>
            )}

            <div className="mt-7 flex justify-between border-t border-canvas-border pt-5">
              <Link href="/citizen" className="btn-secondary">Cancel</Link>
              <button
                type="button"
                className="btn-primary group"
                onClick={() => {
                  const err = validateDetails();
                  if (err) { setSubmitError(err); return; }
                  goToStep(2);
                }}
              >
                Next: Location
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LOCATION */}
        {step === 2 && (
          <div className="card animate-fade-up">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">Complaint Location</h2>
                <p className="mt-0.5 text-sm text-ink-muted">Where exactly is the issue?</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="zone">Zone</label>
                <select id="zone" required className="form-input" value={zoneId}
                  onChange={(e) => { setZoneId(e.target.value); setWardNumber(""); setLocalityId(""); setStreetId(""); }}>
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>Zone {z.zone_number} &ndash; {z.zone_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="ward">
                  Ward Number {selectedZone && <span className="normal-case text-ink-faint">({selectedZone.ward_start}&ndash;{selectedZone.ward_end})</span>}
                </label>
                <input id="ward" type="number" required className="form-input" value={wardNumber}
                  disabled={!zoneId} onChange={(e) => setWardNumber(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="locality">Locality / Area</label>
                <select id="locality" required className="form-input" value={localityId} disabled={!zoneId}
                  onChange={(e) => { setLocalityId(e.target.value); setStreetId(""); }}>
                  <option value="">Select locality</option>
                  {localities.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="street">Street</label>
                <select id="street" required className="form-input" value={streetId} disabled={!localityId}
                  onChange={(e) => setStreetId(e.target.value)}>
                  <option value="">Select street</option>
                  {streets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="specificLoc">Specific Location <span className="normal-case text-ink-faint">(door no. / landmark)</span></label>
                <input id="specificLoc" className="form-input" value={specificLocation} onChange={(e) => setSpecificLocation(e.target.value)} />
              </div>
            </div>

            <div className="mt-6">
              <span className="form-label">Mark on Map</span>
              <MapPicker value={coords} onChange={setCoords} />
            </div>

            {submitError && (
              <p className="form-error mt-4">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {submitError}
              </p>
            )}

            <div className="mt-7 flex justify-between border-t border-canvas-border pt-5">
              <button type="button" className="btn-secondary" onClick={() => goToStep(1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                className="btn-primary group"
                onClick={() => {
                  const err = validateLocation();
                  if (err) { setSubmitError(err); return; }
                  goToStep(3);
                }}
              >
                Next: Type
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DEPARTMENT + TYPE */}
        {step === 3 && (
          <div className="card animate-fade-up">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">Complaint Type</h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Pick the closest match &mdash; we&apos;ll route it to the right department.
                </p>
              </div>
            </div>

            <div className="mb-5 inline-flex rounded-xl bg-canvas-sunken p-1">
              {(["frequent", "master"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTypeTab(tab)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
                    typeTab === tab ? "bg-white text-navy shadow-xs" : "text-ink-subtle hover:text-navy"
                  }`}
                >
                  {tab === "frequent" ? "Frequently Filed" : "Master List"}
                </button>
              ))}
            </div>

            {typeTab === "frequent" ? (
              <div className="flex flex-wrap gap-2">
                {frequentTypes.map((t) => {
                  const active = complaintTypeId === String(t.id);
                  const isOther = t.name === "Others";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setComplaintTypeId(String(t.id))}
                      className={
                        active
                          ? "chip-active"
                          : isOther
                            ? "chip border-dashed border-canvas-border bg-white text-ink-subtle hover:-translate-y-0.5 hover:border-navy-300 hover:text-navy"
                            : "chip-idle"
                      }
                    >
                      {active && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                      {isOther ? "Others / Not Listed" : t.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <div className="relative mb-4">
                  <span className="input-affix">
                    <Search className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search types or departments..."
                    className="form-input pl-10"
                    value={typeSearch}
                    onChange={(e) => setTypeSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
                  {Object.entries(groupedByDept).map(([dept, types]) => (
                    <div key={dept}>
                      <p className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-ink-faint">{dept}</p>
                      <div className="space-y-1">
                        {types.map((t) => {
                          const active = complaintTypeId === String(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setComplaintTypeId(String(t.id))}
                              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                active ? "bg-navy-50 font-semibold text-navy" : "text-ink-muted hover:bg-canvas-sunken"
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                  active ? "border-navy bg-navy text-white" : "border-canvas-border"
                                }`}
                              >
                                {active && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                              </span>
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedType && (
              <div className="alert-info mt-5 animate-scale-in">
                <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>
                  Routed to <span className="font-semibold">{selectedType.department_name}</span>
                  {selectedType.name === "Others" && " — adjusted automatically from your description"}.
                </span>
              </div>
            )}

            {selectedType?.name === "Others" && (
              <div className="mt-4 animate-fade-up">
                <label className="form-label" htmlFor="otherDesc">Briefly describe the issue</label>
                <textarea id="otherDesc" rows={3} maxLength={400} className="form-input"
                  placeholder="e.g. A transformer near the park has been sparking for two days."
                  value={otherDescription} onChange={(e) => setOtherDescription(e.target.value)} />
                <p className="form-hint">Used to route your complaint to the correct department.</p>
              </div>
            )}

            {submitError && (
              <p className="form-error mt-4">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {submitError}
              </p>
            )}

            <div className="mt-7 flex justify-between border-t border-canvas-border pt-5">
              <button type="button" className="btn-secondary" onClick={() => goToStep(2)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                className="btn-primary group"
                onClick={() => {
                  const err = validateType();
                  if (err) { setSubmitError(err); return; }
                  goToStep(4);
                }}
              >
                Next: Details
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: COMPLAINT DETAILS */}
        {step === 4 && (
          <form className="card animate-fade-up" onSubmit={handleSubmit} noValidate>
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">Complaint Details</h2>
                <p className="mt-0.5 text-sm text-ink-muted">Describe the issue and attach evidence.</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="form-label" htmlFor="ctitle">Complaint Title</label>
              <input id="ctitle" required maxLength={200} className="form-input"
                placeholder="Short summary of the issue"
                value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="mb-5">
              <label className="form-label" htmlFor="cdesc">Details of Complaint</label>
              <textarea id="cdesc" required rows={5} maxLength={400} className="form-input"
                placeholder="What is the problem, since when, and how is it affecting people?"
                value={description} onChange={(e) => setDescription(e.target.value)} />
              <p className={`mt-1.5 text-right text-xs tabular-nums ${description.length > 360 ? "text-gold-600" : "text-ink-faint"}`}>
                {description.length}/400
              </p>
            </div>

            <div className="mb-5">
              <span className="form-label">Photograph / Video <span className="normal-case text-ink-faint">(optional, max 10MB)</span></span>
              {mediaFile ? (
                <div className="flex items-center gap-3 rounded-xl border border-navy-200 bg-navy-50 p-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-navy">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{mediaFile.name}</p>
                    <p className="text-xs text-ink-subtle">{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMediaFile(null)}
                    aria-label="Remove attachment"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-white hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="media"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-canvas-border bg-canvas px-4 py-7 text-center transition-colors hover:border-navy-300 hover:bg-navy-50/50"
                >
                  <ImagePlus className="h-6 w-6 text-ink-faint" aria-hidden="true" />
                  <span className="text-sm font-medium text-ink-muted">
                    Click to upload a photo or video
                  </span>
                  <span className="text-xs text-ink-faint">JPG, PNG or MP4 &middot; up to 10MB</span>
                  <input id="media" type="file" accept="image/jpeg,image/png,video/mp4" className="sr-only"
                    onChange={(e) => setMediaFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>

            <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-xl border border-canvas-border bg-canvas p-3.5 text-sm text-ink-muted transition hover:border-navy-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              <span>
                <span className="font-medium text-ink">File anonymously</span> &mdash; your name and contact
                details will be hidden from department officers.
              </span>
            </label>

            {submitError && (
              <div role="alert" className="alert-error mb-5 animate-scale-in">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex justify-between border-t border-canvas-border pt-5">
              <button type="button" className="btn-secondary" onClick={() => goToStep(3)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Complaint
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 5: CONFIRMATION */}
        {step === 5 && result && (
          <div className="card animate-scale-in text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-ink">Complaint Registered</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              Your complaint has been registered in the Public Grievance Redressal Portal of GCC. Use your
              Complaint Number to check its status at any time.
            </p>

            <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-2xl border border-canvas-border">
              <div className="border-b border-canvas-border bg-navy-50 px-5 py-4">
                <p className="text-2xs font-semibold uppercase tracking-wide text-navy-600">Complaint Number</p>
                <p className="mt-1 font-mono text-xl font-bold tracking-tight text-navy">{result.complaintCode}</p>
              </div>
              <dl className="grid grid-cols-2 divide-x divide-canvas-border bg-white text-left">
                <div className="px-5 py-3.5">
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">Department</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{result.department}</dd>
                </div>
                <div className="px-5 py-3.5">
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">Type</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{result.complaintType}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/citizen/track-complaints" className="btn-primary group">
                Track Status
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <button type="button" className="btn-secondary" onClick={resetForNewComplaint}>
                File Another Complaint
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
