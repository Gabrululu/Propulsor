/**
 * AuthCallback — handles Supabase OAuth redirect.
 *
 * Supabase Dashboard → Authentication → URL Configuration:
 *   Site URL:         https://<your-domain>
 *   Redirect URLs:    https://<your-domain>/auth/callback
 *
 * For local dev add:  http://localhost:5173/auth/callback
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/lib/stellar/WalletContext";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { connectSocial } = useWallet();
  const [status, setStatus] = useState("Verificando sesión...");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // No session yet — wait for Supabase to finish exchanging the code
      return;
    }

    const setup = async () => {
      try {
        // Check if user already completed onboarding (returning user)
        const { data: profile } = await supabase
          .from("users_profile")
          .select("onboarding_complete, stellar_public_key")
          .eq("id", user.id)
          .single();

        if (profile?.stellar_public_key) {
          // Returning user — reconnect social wallet state
          setStatus("Bienvenida de vuelta...");
          await connectSocial(user.id); // idempotent: returns existing keys
          if (profile.onboarding_complete) {
            navigate("/dashboard", { replace: true });
          } else {
            navigate("/onboarding", { replace: true });
          }
        } else {
          // New user — create custodial account (no PIN)
          setStatus("Creando tu cuenta Stellar...");
          await connectSocial(user.id);
          navigate("/onboarding", { replace: true });
        }
      } catch (err) {
        console.error("AuthCallback error:", err);
        navigate("/auth", { replace: true });
      }
    };

    setup();
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-mono text-sm text-muted-foreground">{status}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
