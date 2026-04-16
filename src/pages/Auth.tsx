import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWallet } from "@/lib/stellar/WalletContext";
import {
  kit,
  FREIGHTER_ID,
  XBULL_ID,
  ALBEDO_ID,
  LOBSTR_ID,
  type WalletId,
} from "@/lib/stellar/wallets-kit";

const stellarWallets: { id: WalletId; name: string; icon: string; recommended?: boolean }[] = [
  { id: FREIGHTER_ID, name: "Freighter", icon: "🚀", recommended: true },
  { id: XBULL_ID, name: "xBull", icon: "🐂" },
  { id: ALBEDO_ID, name: "Albedo", icon: "🌅" },
  { id: LOBSTR_ID, name: "Lobstr", icon: "🦞" },
];

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const { reconnect } = useWallet();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      if (isLogin) {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Check profile to restore wallet state and navigate correctly
        const userId = signInData.user?.id;
        if (userId) {
          const { data: profile } = await supabase
            .from("users_profile")
            .select("onboarding_complete, stellar_public_key")
            .eq("id", userId)
            .single();

          if (profile?.stellar_public_key) {
            reconnect(profile.stellar_public_key, "custodial");
          }

          navigate(profile?.onboarding_complete ? "/dashboard" : "/onboarding");
        } else {
          navigate("/onboarding");
        }
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

  const handleSocialLogin = async (provider: "google" | "github") => {
    setSocialLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      toast.error(error.message || "Error con login social");
      setSocialLoading(null);
    }
    // On success Supabase redirects the browser — no further action needed
  };

  const walletInstallUrls: Record<string, string> = {
    [FREIGHTER_ID]: "https://freighter.app",
    [XBULL_ID]: "https://xbull.app",
    [ALBEDO_ID]: "https://albedo.link",
    [LOBSTR_ID]: "https://lobstr.co",
  };

  const handleWalletLogin = async (walletId: WalletId) => {
    const walletName = stellarWallets.find(w => w.id === walletId)?.name ?? walletId;
    setWalletLoading(walletId);
    setWalletError("");

    try {
      // Check availability
      const available = await kit.isAvailable(walletId);
      if (!available) {
        const url = walletInstallUrls[walletId];
        toast.error(`${walletName} no detectada`, {
          description: `Instala la extensión desde ${url}`,
          action: url
            ? { label: "Instalar →", onClick: () => window.open(url, "_blank") }
            : undefined,
          duration: 6000,
        });
        setWalletError(`${walletName} no está instalada.`);
        setWalletLoading(null);
        return;
      }

      // Request access — this opens the wallet popup for user approval
      kit.setWallet(walletId);
      const { address } = await kit.requestAccess();
      if (!address) throw new Error("No se obtuvo dirección de la wallet");

      // Use the Stellar public key as a deterministic email+password for Supabase auth
      const syntheticEmail = `${address.slice(0, 16).toLowerCase()}@stellar.propulsor.app`;
      const syntheticPassword = `stlr_${address}`;

      // Try to sign in first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: syntheticPassword,
      });

      if (signInError) {
        // If sign-in fails, create account
        const { error: signUpError } = await supabase.auth.signUp({
          email: syntheticEmail,
          password: syntheticPassword,
          options: {
            data: {
              stellar_public_key: address,
              auth_method: "stellar_wallet",
            },
          },
        });

        if (signUpError) throw signUpError;

        // Sign in after signup
        const { error: retryError } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password: syntheticPassword,
        });

        if (retryError) {
          toast.info("Cuenta creada. Por seguridad, verifica tu correo para continuar.");
          setWalletLoading(null);
          return;
        }
      }

      toast.success(`Conectado con ${walletName}`);
      navigate("/onboarding");
    } catch (err: any) {
      console.error("Wallet auth error:", err);
      const msg = err?.message || "No se pudo conectar la wallet";

      // Friendly messages for common errors
      if (msg.includes("no está instalado") || msg.includes("not installed")) {
        toast.error(`${walletName} no está instalada`, {
          description: "Asegúrate de tener la extensión activa y recarga la página.",
          duration: 5000,
        });
      } else if (msg.includes("popup") || msg.includes("bloqueado")) {
        toast.error("Popup bloqueado", {
          description: "Permite popups en tu navegador e intenta de nuevo.",
          duration: 5000,
        });
      } else if (msg.includes("User declined") || msg.includes("rejected") || msg.includes("cancelled")) {
        toast.warning("Conexión cancelada", {
          description: "Aceptá la solicitud en tu wallet para continuar.",
          duration: 4000,
        });
      } else {
        toast.error(`Error con ${walletName}`, {
          description: msg,
          duration: 5000,
        });
      }
      setWalletError(msg);
    } finally {
      setWalletLoading(null);
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

        {/* Email/password form */}
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

        {/* Social login divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[0.6rem] text-muted-foreground uppercase tracking-wider">
            O continúa con
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Social buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleSocialLogin("google")}
            disabled={!!socialLoading}
            className="flex items-center justify-center gap-2 p-3 rounded-sm border border-border bg-muted hover:bg-card hover:border-primary transition-all text-sm text-foreground disabled:opacity-50"
          >
            {socialLoading === "google" ? (
              <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-lg">G</span>
            )}
            <span className="font-mono text-xs">Google</span>
          </button>
          <button
            onClick={() => handleSocialLogin("github")}
            disabled={!!socialLoading}
            className="flex items-center justify-center gap-2 p-3 rounded-sm border border-border bg-muted hover:bg-card hover:border-primary transition-all text-sm text-foreground disabled:opacity-50"
          >
            {socialLoading === "github" ? (
              <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-lg">⌥</span>
            )}
            <span className="font-mono text-xs">GitHub</span>
          </button>
        </div>

        {/* Stellar wallet divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[0.6rem] text-muted-foreground uppercase tracking-wider">
            O conecta tu wallet
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Stellar wallet buttons */}
        <div>
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-secondary">
            → WALLET STELLAR
          </span>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {stellarWallets.map((w) => (
              <button
                key={w.id}
                onClick={() => handleWalletLogin(w.id)}
                disabled={!!walletLoading}
                className="relative p-3.5 rounded-sm border border-border bg-muted hover:border-secondary hover:bg-card transition-all text-left group disabled:opacity-50"
              >
                {w.recommended && (
                  <span className="absolute top-2 right-2 font-mono text-[0.5rem] text-secondary uppercase tracking-wider">
                    Recomendado
                  </span>
                )}
                <span className="text-2xl block mb-1">
                  {walletLoading === w.id ? (
                    <span className="inline-block w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    w.icon
                  )}
                </span>
                <span className="text-sm text-foreground">{w.name}</span>
              </button>
            ))}
          </div>

          {walletError && (
            <div className="mt-3 p-3 rounded-sm border border-border bg-card">
              <p className="text-xs text-destructive font-mono">{walletError}</p>
              {walletError.includes("no está instalada") && (
                <a
                  href={walletInstallUrls[stellarWallets.find(w => walletError.includes(w.name))?.id ?? FREIGHTER_ID]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-secondary hover:underline mt-1 inline-block"
                >
                  Instalar extensión →
                </a>
              )}
            </div>
          )}
        </div>

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
