import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/onboarding");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setVerificationSent(true);
        toast.success("Revisa tu correo para verificar tu cuenta");
      }
    } catch (err: any) {
      toast.error(err.message || "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <span className="text-4xl">📧</span>
          <h1 className="text-2xl font-bold text-foreground">Verifica tu correo</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Te enviamos un link de verificación a <span className="text-primary font-mono">{email}</span>.
            Haz clic en el link para activar tu cuenta.
          </p>
          <button
            onClick={() => { setVerificationSent(false); setIsLogin(true); }}
            className="text-xs font-mono text-primary hover:text-foreground transition-colors"
          >
            ← Volver al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <span className="font-mono text-xs text-muted-foreground tracking-widest">PROPULSOR</span>
        <h1 className="text-3xl font-bold mt-2 mb-6">
          <span className="text-foreground">{isLogin ? "INICIA " : "CREA TU "}</span>
          <span className="text-primary">{isLogin ? "SESIÓN" : "CUENTA"}</span>
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="tu@correo.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-pink w-full rounded-sm text-center"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Procesando..." : isLogin ? "Entrar →" : "Crear cuenta →"}
          </button>
        </form>

        <p className="text-sm text-muted-foreground text-center mt-6">
          {isLogin ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary font-mono hover:text-foreground transition-colors"
          >
            {isLogin ? "Regístrate" : "Inicia sesión"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;
