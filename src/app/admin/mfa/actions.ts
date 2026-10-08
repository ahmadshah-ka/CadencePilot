"use server";

import { z } from "zod";
import { getContainer } from "@/infrastructure/composition";
import { getPrincipal } from "@/presentation/auth/page-guards";

export interface EnrollState {
  factorId?: string;
  qrCodeDataUri?: string;
  secret?: string;
  error?: string;
}

export interface VerifyState {
  verified?: boolean;
  error?: string;
}

const MFA_CODE_PATTERN = /^\d{6}$/;
const verifySchema = z.object({
  factorId: z.uuid(),
  code: z.string().trim().regex(MFA_CODE_PATTERN),
});

/** Owner-only: the owner must be approved and signed in before enrolling an authenticator. */
async function requireOwner() {
  const principal = await getPrincipal();
  return principal?.isOwner && principal.accountStatus === "approved" ? principal : null;
}

export async function enrollTotpAction(): Promise<EnrollState> {
  if (!(await requireOwner())) return { error: "Not allowed." };
  try {
    const enrollment = await getContainer().session.enrollTotp();
    return enrollment;
  } catch {
    return { error: "Could not start setup. Try again." };
  }
}

export async function verifyTotpAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  if (!(await requireOwner())) return { error: "Not allowed." };
  const parsed = verifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter the 6-digit code from your authenticator app." };
  const ok = await getContainer().session.verifyTotp(parsed.data.factorId, parsed.data.code);
  return ok ? { verified: true } : { error: "That code was not accepted. Try again." };
}
