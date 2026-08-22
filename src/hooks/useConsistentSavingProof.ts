/**
 * useConsistentSavingProof — drives the Proof-of-Consistent-Saving flow.
 *
 * Generation can't run in the browser (RISC Zero's Groth16 step needs
 * Docker) — this hook just requests a job (via the request-consistent-saving-
 * proof Edge Function, which dispatches a GitHub Actions run) and follows its
 * status live through a `zk_proof_jobs` realtime subscription. The workflow
 * itself reports back through the zk-proof-webhook Edge Function.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SUPABASE_URL } from "@/lib/supabase/config";

export interface ConsistentSavingJob {
  id: string;
  status: "queued" | "done" | "not_qualified" | "error";
  months_with_saving: number | null;
  threshold_months: number | null;
  proof_hash: string | null;
  tx_hash: string | null;
  error_message: string | null;
}

export function useConsistentSavingProof() {
  const { user, session } = useAuth();
  const [job, setJob] = useState<ConsistentSavingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");

  // Load the most recent job for this user, if any
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }

    supabase
      .from("zk_proof_jobs")
      .select("id, status, months_with_saving, threshold_months, proof_hash, tx_hash, error_message")
      .eq("user_id", user.id)
      .eq("proof_type", "consistent_saving")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setJob(data as unknown as ConsistentSavingJob);
        setLoading(false);
      });
  }, [user?.id]);

  // Realtime updates on that job (status moves queued → done/not_qualified/error)
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("zk-proof-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zk_proof_jobs", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setJob(payload.new as unknown as ConsistentSavingJob);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const requestProof = useCallback(async () => {
    if (!session?.access_token) {
      setRequestError("Inicia sesión para generar una prueba");
      return;
    }

    setRequesting(true);
    setRequestError("");

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-consistent-saving-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const body = await res.json() as { job_id?: string; error?: string };
      if (!res.ok || !body.job_id) {
        throw new Error(body.error ?? "No se pudo iniciar la generación de la prueba");
      }

      setJob({
        id: body.job_id,
        status: "queued",
        months_with_saving: null,
        threshold_months: null,
        proof_hash: null,
        tx_hash: null,
        error_message: null,
      });
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setRequesting(false);
    }
  }, [session]);

  return { job, loading, requesting, requestError, requestProof };
}
