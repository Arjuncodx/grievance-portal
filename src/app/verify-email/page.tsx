"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Timer
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthHeroPanel from "@/components/AuthHeroPanel";

const CODE_LENGTH = 6;

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = (searchParams.get("email") || "").trim();

  const [maskedEmail, setMaskedEmail] = useState(searchParams.get("masked") || "");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(Number(searchParams.get("cooldown")) || 0);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    setError(null);
    if (clean.length > 1) {
      // Pasted or autofilled code: spread it across the boxes.
      const next = Array(CODE_LENGTH).fill("");
      clean.slice(0, CODE_LENGTH).split("").forEach((d, i) => (next[i] = d));
      setDigits(next);
      inputsRef.current[Math.min(clean.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  const submit = useCallback(
    async (submittedCode: string) => {
      if (submittedCode.length !== CODE_LENGTH || submitting) return;
      setSubmitting(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp: submittedCode })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(
            data.attemptsRemaining !== undefined
              ? `${data.error} ${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? "" : "s"} left.`
              : data.error || "Verification failed."
          );
          setDigits(Array(CODE_LENGTH).fill(""));
          inputsRef.current[0]?.focus();
          setSubmitting(false);
          return;
        }
        setVerified(true);
        setNotice(data.message);
        setTimeout(() => router.push("/login?verified=1"), 1600);
      } catch {
        setError("Something went wrong. Please try again.");
        setSubmitting(false);
      }
    },
    [email, router, submitting]
  );

  // Auto-submit once all six boxes are filled.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !verified) submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(code);
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.maskedEmail) setMaskedEmail(data.maskedEmail);
      if (!res.ok) {
        setError(data.error || "Could not send a new code.");
        if (data.cooldownRemaining) setCooldown(data.cooldownRemaining);
      } else {
        // The API only reports a message when the mail server accepted it.
        setNotice(data.message);
        setCooldown(data.cooldownRemaining || 60);
        setDigits(Array(CODE_LENGTH).fill(""));
        inputsRef.current[0]?.focus();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
        <div className="card w-full text-center">
          <h1 className="text-xl font-extrabold text-ink">Verify your email</h1>
          <p className="mt-2 text-sm text-ink-muted">
            We need to know which address to verify. Please start from the sign-in page.
          </p>
          <Link href="/login" className="btn-primary mt-6 w-full py-3">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-10 sm:px-6">
      <div className="grid w-full animate-fade-up overflow-hidden rounded-3xl border border-canvas-border bg-white shadow-lift lg:grid-cols-[1.1fr_1fr]">
        <AuthHeroPanel
          eyebrow="One last step"
          title={
            <>
              Confirm it&apos;s
              <br />
              really you.
            </>
          }
          description="Verifying your email keeps grievance records tied to a real, reachable citizen — and lets the Corporation notify you as your complaint moves."
          points={[
            { icon: MailCheck, label: "A 6-digit code, valid for 10 minutes" },
            { icon: ShieldCheck, label: "Your account stays locked until it's confirmed" },
            { icon: Timer, label: "Request a new code after 60 seconds" }
          ]}
        />

        <div className="p-7 sm:p-10">
          <div className="mb-7">
            <h1 className="text-[1.75rem] font-extrabold leading-tight text-ink">
              Check your inbox
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              We sent a {CODE_LENGTH}-digit code to{" "}
              <span className="font-semibold text-ink">{maskedEmail || "your email address"}</span>.
            </p>
          </div>

          {verified && (
            <div role="status" className="alert-success mb-5 animate-scale-in">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{notice} Taking you to sign in…</span>
            </div>
          )}
          {!verified && notice && (
            <div role="status" className="alert-success mb-5 animate-scale-in">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div role="alert" className="alert-error mb-5 animate-scale-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={verified || submitting} className="disabled:opacity-60">
              <legend className="form-label mb-2">Verification code</legend>
              <div className="flex gap-2 sm:gap-2.5" role="group" aria-label="6-digit verification code">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={CODE_LENGTH}
                    aria-label={`Digit ${i + 1}`}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    className="h-14 w-full rounded-xl border border-canvas-border bg-canvas text-center font-display text-2xl font-bold tabular-nums text-ink transition focus:border-navy-500 focus:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-navy-600/20"
                  />
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={code.length !== CODE_LENGTH || submitting || verified}
              className="btn-primary group mt-6 w-full py-3 text-[15px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying…
                </>
              ) : (
                <>
                  Verify email
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-canvas-border bg-canvas p-4">
            <p className="text-sm text-ink-muted">
              {cooldown > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                  You can request a new code in{" "}
                  <span className="font-semibold tabular-nums text-ink">{cooldown}s</span>
                </span>
              ) : (
                "Didn't get the email? Check spam, then request a new code."
              )}
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending || verified}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-navy-600 px-3.5 py-2 text-xs font-semibold text-navy transition hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Resend
            </button>
          </div>

          <p className="mt-7 border-t border-canvas-border pt-5 text-center text-sm text-ink-muted">
            Wrong address?{" "}
            <Link href="/register" className="font-semibold text-navy transition hover:underline">
              Register again
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="dotted-canvas flex min-h-screen flex-col bg-canvas">
      <Header />
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
      <Footer />
    </div>
  );
}
