import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase auto-sets session from the recovery link hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setHasSession(true);
      }
    });

    // Also check if already in a session (e.g. page refresh)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message || "No se pudo actualizar la contraseña");
    } else {
      setSuccess(true);
      toast.success("Contraseña actualizada correctamente ✓");
      setTimeout(() => navigate("/dashboard"), 2000);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(145,65%,80%)]/20 animate-pulse">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-['Space_Grotesk']">
            Contraseña actualizada
          </h1>
          <p className="text-sm text-muted-foreground">
            Redirigiendo al dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <span className="font-mono text-xs text-muted-foreground tracking-widest">PROPULSOR</span>
        <h1 className="text-3xl font-bold mt-2 mb-6 font-['Space_Grotesk']">
          <span className="text-foreground">NUEVA </span>
          <span className="text-primary">CONTRASEÑA</span>
        </h1>

        {!hasSession && (
          <div className="rounded-sm border border-border bg-card px-4 py-3 mb-4">
            <p className="text-sm text-muted-foreground">
              Abrí el link que te enviamos por correo para continuar.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
              disabled={!hasSession}
            />
          </div>

          <div>
            <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Repetí tu contraseña"
              minLength={6}
              required
              disabled={!hasSession}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !hasSession}
            className="btn-pink w-full rounded-sm text-center"
            style={{ opacity: loading || !hasSession ? 0.6 : 1 }}
          >
            {loading ? "Actualizando..." : "Cambiar contraseña →"}
          </button>
        </form>

        <button
          onClick={() => navigate("/auth")}
          className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors mt-6 block"
        >
          ← Volver al login
        </button>
      </div>
    </div>
  );
};

export default ResetPassword;
