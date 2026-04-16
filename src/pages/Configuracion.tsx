import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { truncateAddress } from "@/lib/stellar";
import { toast } from "@/hooks/use-toast";

const Configuracion = () => {
  const navigate = useNavigate();
  const { publicKey, mode, disconnect } = useWallet();
  const { user } = useAuth();

  const [profile, setProfile] = useState<{
    name: string;
    profile_type: string | null;
    voice_enabled: boolean;
  }>({ name: "", profile_type: null, voice_enabled: true });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("users_profile")
      .select("name, profile_type, voice_enabled")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const voiceEnabled = data.voice_enabled ?? true;
          setProfile({
            name: data.name ?? "",
            profile_type: data.profile_type,
            voice_enabled: voiceEnabled,
          });
          localStorage.setItem("propulsor_voice_enabled", String(voiceEnabled));
        }
      });
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("users_profile")
        .update({
          name: profile.name,
          profile_type: profile.profile_type as never,
          voice_enabled: profile.voice_enabled,
        })
        .eq("id", user.id);
      if (error) throw error;
      // Sync voice preference to localStorage so useVoice picks it up instantly
      localStorage.setItem("propulsor_voice_enabled", String(profile.voice_enabled));
      toast({ title: "✓ Guardado", description: "Tus preferencias se actualizaron" });
    } catch {
      toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    disconnect();
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const profileLabels: Record<string, string> = {
    jefa_hogar: "Jefa de hogar",
    emprendedora: "Emprendedora",
    trabajadora: "Trabajadora",
    freelancer: "Freelancer",
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-2xl pb-24 md:pb-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">CONFIGURACIÓN</h1>
        <p className="text-body-muted text-xs font-mono mb-8">Gestiona tu perfil y preferencias</p>

        {/* Profile section */}
        <section className="bg-card-dark border border-pink-subtle rounded-sm p-6 mb-6">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Perfil</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                Tipo de perfil
              </label>
              <select
                value={profile.profile_type ?? ""}
                onChange={(e) => setProfile({ ...profile, profile_type: e.target.value || null })}
                className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">No definido</option>
                {Object.entries(profileLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                Correo
              </label>
              <p className="text-sm text-foreground font-mono">{user?.email ?? "—"}</p>
            </div>
          </div>
        </section>

        {/* Wallet section */}
        <section className="bg-card-dark border border-pink-subtle rounded-sm p-6 mb-6">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Wallet Stellar</h2>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">Modo</span>
              <span className="text-sm text-foreground">
                {mode === "custodial" && "🔐 Custodial (PIN)"}
                {mode === "custodial_social" && "🌐 Custodial (Social)"}
                {mode === "external" && "💎 Wallet externa"}
                {!mode && "No conectado"}
              </span>
            </div>

            {publicKey && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">Dirección</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(publicKey);
                    toast({ title: "Copiado", description: "Dirección copiada al portapapeles" });
                  }}
                  className="text-sm font-mono text-pink hover:text-foreground transition-colors"
                >
                  {truncateAddress(publicKey)}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Preferences section */}
        <section className="bg-card-dark border border-pink-subtle rounded-sm p-6 mb-6">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Preferencias</h2>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Asistente de voz</p>
              <p className="text-xs text-muted-foreground">Narración de acciones y confirmaciones</p>
            </div>
            <button
              onClick={() => setProfile({ ...profile, voice_enabled: !profile.voice_enabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                profile.voice_enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-foreground transition-transform ${
                  profile.voice_enabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-pink text-xs py-2.5 px-6 rounded-sm"
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button
            onClick={handleLogout}
            className="btn-outline-pink text-xs py-2.5 px-6 rounded-sm"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Configuracion;
