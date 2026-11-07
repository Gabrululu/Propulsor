import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { NETWORK_PASSPHRASE, SPLIT_CONTRACT_ID } from "@/lib/stellar/client";
import {
  getRulesStrict,
  getSetupTransactionStatus,
} from "@/lib/stellar/contracts";
import type { Json } from "@/integrations/supabase/types";

const profileType = z.enum([
  "jefa_hogar",
  "emprendedora",
  "trabajadora",
  "freelancer",
]);
const draftSchema = z.object({
  version: z.literal(1),
  publicKey: z.string().min(1),
  contractId: z.string(),
  network: z.string(),
  name: z.string().trim().min(1),
  profileType,
  vaultNames: z.array(z.string().trim().min(1)).length(3),
  percentages: z
    .array(z.number().int().min(1).max(98))
    .length(3)
    .refine((values) => values.reduce((a, b) => a + b, 0) === 100),
  transaction: z
    .object({
      hash: z.string().regex(/^[0-9a-f]{64}$/),
      expiresAt: z.number().int().positive(),
    })
    .optional(),
});
export type OnboardingDraft = z.infer<typeof draftSchema>;

export function createDraft(
  input: Pick<
    OnboardingDraft,
    "publicKey" | "name" | "profileType" | "vaultNames" | "percentages"
  >,
): OnboardingDraft {
  return draftSchema.parse({
    ...input,
    version: 1,
    contractId: SPLIT_CONTRACT_ID,
    network: NETWORK_PASSPHRASE,
  });
}

export async function loadDraft(
  userId: string,
  publicKey: string,
): Promise<OnboardingDraft | null> {
  const { data, error } = await supabase
    .from("users_profile")
    .select("onboarding_draft")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("PROFILE_SAVE_FAILED");
  const parsed = draftSchema.safeParse(data?.onboarding_draft);
  if (!parsed.success) return null;
  const draft = parsed.data;
  return draft.publicKey === publicKey &&
    draft.contractId === SPLIT_CONTRACT_ID &&
    draft.network === NETWORK_PASSPHRASE
    ? draft
    : null;
}

export async function saveDraft(
  userId: string,
  draft: OnboardingDraft,
  previousHash: string | null = null,
): Promise<void> {
  const validated = draftSchema.parse(draft);
  const { error } = await supabase.rpc("save_onboarding_draft", {
    p_user_id: userId,
    p_draft: validated as unknown as Json,
    p_expected_hash: previousHash,
  });
  if (error)
    throw new Error(
      error.message.includes("ONBOARDING_CONFLICT")
        ? "ONBOARDING_CONFLICT"
        : "PROFILE_SAVE_FAILED",
    );
}

export async function recoverDraft(
  draft: OnboardingDraft,
): Promise<"confirmed" | "retry" | "pending"> {
  if (!draft.transaction) return "retry";
  const status = await getSetupTransactionStatus(
    draft.transaction.hash,
    draft.transaction.expiresAt,
  );
  if (status === "confirmed") return "confirmed";
  if (status === "pending") return "pending";
  if (status === "failed") return "retry";
  // Old successful transactions can have fallen outside RPC retention. Check
  // actual contract state before offering to sign a replacement transaction.
  const rules = await getRulesStrict(draft.publicKey);
  return rules.length === 3 &&
    draft.percentages.every((percentage, vault_id) =>
      rules.some(
        (rule) => rule.vault_id === vault_id && rule.percentage === percentage,
      ),
    )
    ? "confirmed"
    : "retry";
}

export async function completeDraft(
  userId: string,
  draft: OnboardingDraft,
  hash: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_onboarding", {
    p_user_id: userId,
    p_hash: hash,
  });
  if (error)
    throw new Error(
      error.message.includes("ONBOARDING_CONFLICT")
        ? "ONBOARDING_CONFLICT"
        : "PROFILE_SAVE_FAILED",
    );
}

const onboardedKey = (userId: string) => `propulsor_onboarded:${userId}`;

/**
 * Whether this browser last saw the user as onboarded. Only used to avoid
 * blocking on chain reads; hasCompletedOnboarding still revalidates it.
 */
export function wasOnboardingComplete(userId: string): boolean {
  try {
    return localStorage.getItem(onboardedKey(userId)) === "true";
  } catch {
    return false;
  }
}

function rememberOnboarding(userId: string, complete: boolean) {
  try {
    if (complete) localStorage.setItem(onboardedKey(userId), "true");
    else localStorage.removeItem(onboardedKey(userId));
  } catch {
    // Storage unavailable: the user just waits for the chain read next time
  }
}

/** Repair legacy complete flags only after a successful read of chain state. */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("users_profile")
    .select("onboarding_complete, stellar_public_key")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("PROFILE_SAVE_FAILED");
  if (!data?.onboarding_complete || !data.stellar_public_key) {
    rememberOnboarding(userId, false);
    return false;
  }
  let rules;
  try {
    rules = await getRulesStrict(data.stellar_public_key);
  } catch (error) {
    if (!(error instanceof Error) || !/account not found/i.test(error.message))
      throw error;
    rules = [];
  }
  const valid =
    rules.length === 3 &&
    new Set(rules.map((r) => r.vault_id)).size === 3 &&
    rules.every(
      (r) =>
        r.vault_id >= 0 &&
        r.vault_id <= 2 &&
        r.percentage >= 1 &&
        r.percentage <= 98,
    ) &&
    rules.reduce((sum, r) => sum + r.percentage, 0) === 100;
  if (!valid) {
    const { error: saveError } = await supabase
      .from("users_profile")
      .update({ onboarding_complete: false })
      .eq("id", userId);
    if (saveError) throw new Error("PROFILE_SAVE_FAILED");
  }
  rememberOnboarding(userId, valid);
  return valid;
}
