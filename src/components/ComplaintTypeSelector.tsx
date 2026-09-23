"use client";

/**
 * Complaint-type selection modelled on the GCC "Register Complaint" page:
 * a "Frequently Filed Complaint Types" dropdown at the top, then one dropdown
 * per category laid out in two columns on desktop and one on mobile.
 *
 * Exactly one subcomplaint can be active across the whole section. Choosing
 * from any dropdown clears the others, so the selection is never ambiguous —
 * the frequent list holds the same canonical subtype ids as the category
 * dropdowns, so picking "Non burning of Street lights" from either place
 * selects the identical record.
 */

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export interface Subcomplaint {
  id: number;
  gccId: number;
  label: string;
  categoryId: number;
  departmentId: number | null;
  departmentName: string | null;
  mappingStatus: "mapped" | "unmapped";
}

export interface ComplaintCategory {
  id: number;
  name: string;
  sortOrder: number;
  subcomplaints: Subcomplaint[];
}

export interface TaxonomySource {
  url: string;
  label: string;
  fetchedAt: string;
  notes?: string;
}

interface Props {
  categories: ComplaintCategory[];
  frequent: Subcomplaint[];
  selectedId: number | null;
  onSelect: (subcomplaint: Subcomplaint | null) => void;
  source?: TaxonomySource | null;
  loading?: boolean;
}

export default function ComplaintTypeSelector({
  categories,
  frequent,
  selectedId,
  onSelect,
  source,
  loading
}: Props) {
  const byId = new Map<number, Subcomplaint>();
  for (const c of categories) for (const s of c.subcomplaints) byId.set(s.id, s);
  for (const f of frequent) if (!byId.has(f.id)) byId.set(f.id, f);

  const selected = selectedId != null ? byId.get(selectedId) ?? null : null;
  const selectedCategory = selected
    ? categories.find((c) => c.id === selected.categoryId) ?? null
    : null;

  function handleChange(value: string) {
    if (!value) return onSelect(null);
    onSelect(byId.get(Number(value)) ?? null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-11 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-11" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Frequently filed */}
      {frequent.length > 0 && (
        <div className="mb-6 rounded-2xl border border-gold-200 bg-gold-50 p-4">
          <label htmlFor="frequent-complaint-type" className="form-label text-gold-800">
            Frequently Filed Complaint Types
          </label>
          <select
            id="frequent-complaint-type"
            className="form-input bg-white"
            value={selected && frequent.some((f) => f.id === selected.id) ? String(selected.id) : ""}
            onChange={(e) => handleChange(e.target.value)}
          >
            <option value="">Choose</option>
            {frequent.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gold-800">
            These are the most commonly reported issues. Anything else is in the
            category lists below.
          </p>
        </div>
      )}

      {/* Category dropdowns: two columns on desktop, one on mobile */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        {categories.map((category) => {
          const activeHere = selected && selected.categoryId === category.id;
          return (
            <div key={category.id}>
              <label htmlFor={`category-${category.id}`} className="form-label">
                {category.name}
              </label>
              <select
                id={`category-${category.id}`}
                className={`form-input ${activeHere ? "border-navy-500 ring-4 ring-navy-600/10" : ""}`}
                value={activeHere ? String(selected!.id) : ""}
                onChange={(e) => handleChange(e.target.value)}
              >
                {/* The first option is the category heading, exactly as the
                    GCC page renders it — it is a placeholder, not selectable
                    as a complaint. */}
                <option value="">{category.name}</option>
                {category.subcomplaints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Current selection */}
      <div className="mt-6">
        {selected ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2
                className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-wide text-emerald-700">
                  {selectedCategory?.name ?? "Selected category"}
                </p>
                <p className="mt-0.5 text-sm font-bold text-ink">{selected.label}</p>
                {selected.mappingStatus === "mapped" && selected.departmentName ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    Routed to <span className="font-semibold">{selected.departmentName}</span>
                  </p>
                ) : (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    The Corporation does not publish a department for this complaint type, so it
                    will be reviewed and routed by an officer rather than assigned automatically.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="ml-auto flex-shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-sm text-ink-muted">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden="true" />
            Choose one complaint type &mdash; from the frequent list or from any one category.
            Selecting a new one replaces the previous choice.
          </p>
        )}
      </div>

      {source && (
        <p className="mt-4 border-t border-canvas-border pt-3 text-2xs leading-relaxed text-ink-faint">
          Complaint types imported from the Greater Chennai Corporation grievance portal (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-navy"
          >
            source
          </a>
          ) on {new Date(source.fetchedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
          })}
          .
        </p>
      )}
    </div>
  );
}
