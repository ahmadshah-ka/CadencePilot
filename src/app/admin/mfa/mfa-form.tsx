"use client";

import { useActionState, useState, useTransition } from "react";
import { enrollTotpAction, verifyTotpAction, type EnrollState, type VerifyState } from "./actions";

/** Authenticator-app enrollment (when no factor exists) and code entry (to elevate the session). */
export function MfaForm({ existingFactorId }: { existingFactorId: string | null }) {
  const [enrollment, setEnrollment] = useState<EnrollState | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction, verifying] = useActionState<VerifyState, FormData>(
    verifyTotpAction,
    {},
  );
  const factorId = existingFactorId ?? enrollment?.factorId;

  if (state.verified) {
    return (
      <p role="status">
        Verified.{" "}
        <a className="underline" href="/admin">
          Continue to the owner area
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!factorId ? (
        <button
          type="button"
          disabled={pending}
          className="rounded-md border px-4 py-2"
          onClick={() => startTransition(async () => setEnrollment(await enrollTotpAction()))}
        >
          Set up authenticator app
        </button>
      ) : null}
      {enrollment?.error ? <p role="alert">{enrollment.error}</p> : null}
      {enrollment?.qrCodeDataUri ? (
        <div className="space-y-2">
          <p>Scan this code with an authenticator app, then enter the 6-digit code below.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollment.qrCodeDataUri}
            alt="Authenticator setup QR code"
            width={200}
            height={200}
          />
          <p className="text-sm">
            Or enter this key manually: <code>{enrollment.secret}</code>
          </p>
        </div>
      ) : null}
      {factorId ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="factorId" value={factorId} />
          <label className="block">
            <span className="block text-sm">6-digit code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
              className="mt-1 rounded-md border p-2"
            />
          </label>
          {state.error ? <p role="alert">{state.error}</p> : null}
          <button type="submit" disabled={verifying} className="rounded-md border px-4 py-2">
            Verify
          </button>
        </form>
      ) : null}
    </div>
  );
}
