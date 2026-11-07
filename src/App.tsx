import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { WalletProvider } from "@/lib/stellar/WalletContext";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Simulate from "./pages/Simulate";
import Dashboard from "./pages/Dashboard";
import Bovedas from "./pages/Bovedas";
import Transacciones from "./pages/Transacciones";
import Configuracion from "./pages/Configuracion";
import Onboarding from "./pages/Onboarding";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import VerifyProof from "./pages/VerifyProof";
import VerifyConsistentSavingProof from "./pages/VerifyConsistentSavingProof";

import { hasCompletedOnboarding, wasOnboardingComplete } from "@/lib/onboarding";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { userError } from "@/lib/userErrors";

const queryClient = new QueryClient();

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const needsSetup = pathname.startsWith("/dashboard");
  const setup = useQuery({
    queryKey: ["onboarding", user?.id],
    queryFn: () => hasCompletedOnboarding(user!.id),
    enabled: !!user && !loading && needsSetup,
    // Known-good users get in at once while this revalidates in the background
    initialData: () => (user && wasOnboardingComplete(user.id) ? true : undefined),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (user && needsSetup) {
    // Only block while there is no positive answer yet. A background refetch
    // (e.g. the tab regaining visibility) must not unmount the page, or any
    // in-progress flow such as a wallet signature loses its state.
    if (setup.isPending || (setup.isFetching && !setup.data))
      return (
        <main className="p-6" role="status">
          {language === "es" ? "Verificando tu cuenta…" : "Checking your account…"}
        </main>
      );
    if (setup.isError && !setup.data)
      return (
        <main className="p-6">
          <p role="alert">{userError(setup.error, language)}</p>
          <button className="btn-pink mt-4" onClick={() => setup.refetch()}>
            {language === "es" ? "Reintentar" : "Retry"}
          </button>
        </main>
      );
    if (!setup.data) return <Navigate to="/onboarding" replace />;
  }
  if (loading)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-muted-foreground font-mono text-sm">
          Cargando...
        </span>
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <WalletProvider>
          <LanguageProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/simular" element={<Simulate />} />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/bovedas"
                  element={
                    <ProtectedRoute>
                      <Bovedas />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/transacciones"
                  element={
                    <ProtectedRoute>
                      <Transacciones />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/configuracion"
                  element={
                    <ProtectedRoute>
                      <Configuracion />
                    </ProtectedRoute>
                  }
                />
                <Route path="/verify/:proofHash" element={<VerifyProof />} />
                <Route
                  path="/verify-saving/:proofHash"
                  element={<VerifyConsistentSavingProof />}
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </LanguageProvider>
        </WalletProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
