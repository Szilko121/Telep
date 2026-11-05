import React, { useEffect, useState } from "react";
// FONTOS: HashRouter használata (Electron/Static hosting kompatibilitás)
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// UI Komponensek
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Context-ek
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OwnerAuthProvider } from "@/contexts/OwnerAuthContext";
import { FarmProvider, useFarm } from "@/contexts/FarmContext";

// Libs
import { waitForAuth } from "@/lib/firebase";
import Layout from "./components/Layout";

/* ========================================================================
   1. TULAJDONOS (OWNER) OLDALAK - "A" PROJEKT
   ======================================================================== */
import OwnerLoginPage from "./pages/OwnerLoginPage";
import OwnerRegisterPage from "./pages/OwnerRegisterPage";
import FarmManager from "./pages/owner/FarmManager";

/* ========================================================================
   2. DOLGOZÓI (WORKER) OLDALAK - "B" PROJEKT
   ======================================================================== */
// Publikus (belső)
import LoginPage from "./pages/LoginPage";
import HashTool from "./pages/HashTool";


// Védett (belső)
import Index from "./pages/Index";
import NapiLap from "./pages/NapiLap";
import Olak from "./pages/Olak";
import Muszakbeosztas from "./pages/Muszakbeosztas";
import Turnus from "./pages/Turnus";
import Betelepites from "./pages/Betelepites";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import MunkakPage from "@/pages/MunkakPage";
import UzenetekPage from "@/pages/UzenetekPage";
import IstalloTerkep from "@/pages/IstalloTerkep";
import IstalloSzerkeszto from "@/pages/IstalloSzerkeszto";
import ElhulasokPage from "@/pages/ElhulasokPage";
import IntegraciokPage from "@/pages/IntegraciokPage";
import Weights from "@/pages/Weights";
import VitaminPlan from "@/pages/VitaminPlan";

// React Query kliens
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 0,
    },
  },
});

// ----------------------------------------------------------------------
// HELPER: Védett Dolgozói Útvonal (Csak bejelentkezett usernek)
// ----------------------------------------------------------------------
function ProtectedWorker() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await waitForAuth(); // Megvárjuk a Firebase initet
        if (alive) setAuthReady(true);
      } catch {
        if (alive) setAuthReady(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Amíg tölt a Firebase vagy a user profil
  if (loading || !authReady) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-emerald-500" />
        <span>{t("common.loading")}</span>
      </div>
    );
  }

  // Ha nincs user, irány a login
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}

// ----------------------------------------------------------------------
// HELPER: Dolgozói Auth átirányítások
// ----------------------------------------------------------------------
function WorkerAuthSideEffects() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (loading) return;
    queryClient.clear();

    // Publikus route-ok dolgozói módban
    const publicPaths = ["/login", "/hash"];

    if (user) {
      // Ha be van lépve és a login oldalon van -> Főoldal
      if (loc.pathname === "/login") nav("/", { replace: true });
    } else {
      // Ha NINCS belépve, és NEM publikus oldalon van -> Login
      if (!publicPaths.includes(loc.pathname)) {
        nav("/login", { replace: true });
      }
    }
  }, [user, loading, nav, loc.pathname]);

  return null;
}

// ----------------------------------------------------------------------
// HELPER: Layout Wrapper (hogy a Layout hozzáférjen a user adatokhoz)
// ----------------------------------------------------------------------
function AuthedLayout() {
  const { user } = useAuth();
  return (
    <Layout key={user?.username || "anon"}>
      <Outlet />
    </Layout>
  );
}

// ----------------------------------------------------------------------
// FŐ ROUTING LOGIKA (Owner mód vs. Worker mód farmId alapján)
// ----------------------------------------------------------------------
function AppRoutes() {
  const { farmId } = useFarm(); // Contextből jön: van-e kiválasztott telep?

  // === 1. ÁLLAPOT: NINCS TELEP KIVÁLASZTVA -> TULAJDONOSI MÓD ===
  if (!farmId) {
    return (
      <Routes>
        {/* Alap URL: / -> Owner Login */}
        <Route path="/" element={<Navigate to="/owner/login" replace />} />

        <Route path="/owner/login" element={<OwnerLoginPage />} />
        <Route path="/owner/register" element={<OwnerRegisterPage />} />
        <Route path="/owner/farms" element={<FarmManager />} />

        {/* Minden más visszavisz a tulajdonos loginra */}
        <Route path="*" element={<Navigate to="/owner/login" replace />} />
      </Routes>
    );
  }

  // === 2. ÁLLAPOT: VAN TELEP KIVÁLASZTVA -> DOLGOZÓI MÓD ===
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkerAuthSideEffects />

        <Routes>
          {/* HA VALAKI MÉGIS OWNER URL-T ÍR BE DOLGOZÓI MÓDBAN,
              NE LEGYEN 404, HANEM TEGYÜK ÁT A DOLGOZÓI LOGINRA */}
          <Route path="/owner/login" element={<Navigate to="/login" replace />} />
          <Route path="/owner/register" element={<Navigate to="/login" replace />} />
          <Route path="/owner/farms" element={<Navigate to="/login" replace />} />
          <Route path="/owner/*" element={<Navigate to="/login" replace />} />

          {/* Publikus dolgozói login (a kiválasztott telepre) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/hash" element={<HashTool />} />


          {/* Védett dolgozói oldalak */}
          <Route element={<ProtectedWorker />}>
            <Route element={<AuthedLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/napilap" element={<NapiLap />} />
              <Route path="/olak" element={<Olak />} />
              <Route path="/muszakbeosztas" element={<Muszakbeosztas />} />
              <Route path="/turnus" element={<Turnus />} />
              <Route path="/felugyelet" element={<IntegraciokPage />} />
              <Route path="/merlegeles" element={<Weights />} />
              <Route path="/vitamin-terv" element={<VitaminPlan />} />
              <Route path="/betelepites" element={<Betelepites />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/munkak" element={<MunkakPage />} />
              <Route path="/uzenetek" element={<UzenetekPage />} />
              <Route path="/istallo-terkep" element={<IstalloTerkep />} />
              <Route path="/istallo-szerkeszto" element={<IstalloSzerkeszto />} />
              <Route path="/elhulasok" element={<ElhulasokPage />} />

              {/* Dolgozói 404 csak a worker útvonalakra */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          {/* Ha ismeretlen URL a dolgozói módban felső szinten -> Login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

// ----------------------------------------------------------------------
// APP WRAPPER (Context Providers)
// ----------------------------------------------------------------------
const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <OwnerAuthProvider>
        <FarmProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />

            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </TooltipProvider>
        </FarmProvider>
      </OwnerAuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
