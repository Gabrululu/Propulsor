import { useConsistentSavingProof } from "@/hooks/useConsistentSavingProof";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";

const ConsistentSavingProofPanel = () => {
  const { job, loading, requesting, requestError, requestProof } = useConsistentSavingProof();

  const isPending = job?.status === "queued" || requesting;

  return (
    <div className="rounded-sm border border-border bg-card p-5 space-y-4">
      <div>
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-primary">
          → PRUEBA PRIVADA
        </span>
        <h3 className="text-lg font-bold text-foreground mt-1">
          Prueba de ahorro constante
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Demuestra que ahorraste en al menos 6 de los últimos 12 meses{" "}
          <span className="text-foreground font-semibold">sin revelar ningún monto</span>.
          La generación tarda varios minutos — corre en un servidor, no en tu dispositivo.
        </p>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground font-mono animate-pulse">Cargando...</p>
      )}

      {!loading && (!job || job.status === "error" || job.status === "not_qualified") && !isPending && (
        <div className="space-y-3">
          {job?.status === "not_qualified" && (
            <div className="p-3 rounded-sm border border-border bg-muted">
              <p className="text-xs text-foreground font-mono">
                Todavía no calificas — ahorraste en {job.months_with_saving} de los últimos 12 meses
                (se necesitan al menos {job.threshold_months}). Sigue separando tu dinero y vuelve a intentarlo.
              </p>
            </div>
          )}
          {job?.status === "error" && (
            <div className="p-3 rounded-sm border border-destructive/30 bg-destructive/10">
              <p className="text-xs text-destructive font-mono">{job.error_message ?? "Ocurrió un error"}</p>
            </div>
          )}
          {requestError && (
            <div className="p-3 rounded-sm border border-destructive/30 bg-destructive/10">
              <p className="text-xs text-destructive font-mono">{requestError}</p>
            </div>
          )}
          <button onClick={requestProof} className="btn-pink w-full rounded-sm text-sm">
            → Generar prueba de ahorro constante
          </button>
        </div>
      )}

      {isPending && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm text-foreground font-mono">
              Generando prueba en un servidor externo (puede tardar varios minutos)...
            </span>
          </div>
          <p className="text-[0.6rem] text-muted-foreground font-mono">
            No necesitas quedarte en esta pantalla — te avisamos aquí apenas termine.
          </p>
        </div>
      )}

      {job?.status === "done" && (
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-secondary font-mono text-sm">✓ Prueba verificada</p>
          </div>

          <div className="bg-muted rounded-sm p-4 space-y-2 font-mono text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Meses con ahorro</span>
              <span className="text-foreground font-semibold">
                ≥ {job.threshold_months} de 12
              </span>
            </div>
            {job.proof_hash && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Código de verificación</span>
                <span className="text-primary truncate max-w-[140px]" title={job.proof_hash}>
                  {job.proof_hash.slice(0, 8)}...{job.proof_hash.slice(-8)}
                </span>
              </div>
            )}
            {job.tx_hash && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Comprobante</span>
                <a
                  href={`${STELLAR_EXPLORER_BASE}/tx/${job.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary hover:underline truncate max-w-[140px]"
                >
                  {job.tx_hash.slice(0, 8)}... →
                </a>
              </div>
            )}
          </div>

          {job.proof_hash && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/verify-saving/${job.proof_hash}`);
                }}
                className="flex-1 text-xs font-mono text-primary hover:text-foreground border border-border rounded-sm py-2 transition-colors"
              >
                Copiar link
              </button>
              <a
                href={`/verify-saving/${job.proof_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs font-mono text-center text-secondary hover:text-foreground border border-border rounded-sm py-2 transition-colors"
              >
                Ver prueba →
              </a>
            </div>
          )}

          <button
            onClick={requestProof}
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            ← Nueva prueba
          </button>
        </div>
      )}
    </div>
  );
};

export default ConsistentSavingProofPanel;
