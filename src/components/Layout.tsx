import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Home,
  Users,
  Calendar,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  Map,
  ClipboardList,
  Skull,
  Activity,
  Scale,
  Beaker,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db, waitForAuth } from "@/lib/firebase";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/services/permissionsService";
import { navigationConfig } from "@/config/navigation";
import { farmCollection } from "@/lib/farmDb"; // <--- FARM DB

/* ----------------------------- Helpers ----------------------------- */
function CountBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);
  return (
    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] leading-none min-w-[18px] h-[18px] px-1">
      {text}
    </span>
  );
}

async function getActiveTurnusId(): Promise<string | null> {
  await waitForAuth();
  const snap = await getDocs(
    query(farmCollection("turnusok"), where("active", "==", true), limit(1))
  );
  if (snap.empty) return null;
  return snap.docs[0].id;
}

function useNavBadges() {
  const { user } = useAuth();
  const uid = user?.uid || (user as any)?.authUid || null;
  const role = user?.role as string | undefined;
  const [notifCount, setNotifCount] = useState<number>(0);
  const [workCount, setWorkCount] = useState<number>(0);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      if (!uid) return;
      try {
        await waitForAuth();
        const notifQ = query(
          farmCollection(`notifications/${uid}/items`),
          where("read", "==", false)
        );
        unsub = onSnapshot(
          notifQ,
          (snap) => setNotifCount(snap.size),
          () => setNotifCount(0)
        );
      } catch {
        setNotifCount(0);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      if (!uid) return;
      try {
        await waitForAuth();
        const base = farmCollection("workRequests");
        if (role === "admin" || role === "főnök") {
          const turnusId = await getActiveTurnusId();
          if (!turnusId) {
            setWorkCount(0);
            return;
          }
          const qForAdmin = query(
            base,
            where("turnusId", "==", turnusId),
            where("status", "==", "pending")
          );
          unsub = onSnapshot(
            qForAdmin,
            (snap) => setWorkCount(snap.size),
            () => setWorkCount(0)
          );
        } else {
          const qForWorker = query(
            base,
            where("createdByUid", "==", uid),
            where("status", "==", "pending")
          );
          unsub = onSnapshot(
            qForWorker,
            (snap) => setWorkCount(snap.size),
            () => setWorkCount(0)
          );
        }
      } catch {
        setWorkCount(0);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [uid, role]);

  return { notifCount, workCount };
}

/* ------------------------------ Layout ----------------------------- */

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  badge?: number;
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { notifCount, workCount } = useNavBadges();
  const { t } = useLanguage();
  const [farmName, setFarmName] = useState("");

  // --- TELEP NEVÉNEK LEKÉRÉSE ---
  useEffect(() => {
    (async () => {
      try {
        await waitForAuth();
        const farmId = localStorage.getItem("current_farm_id");
        if (farmId) {
          const farmSnap = await getDoc(doc(db, "farms", farmId));
          if (farmSnap.exists()) {
            const fData = farmSnap.data();
            setFarmName(fData.name || fData.nev || "Saját Telep");
          }
        }
      } catch (err) {
        console.error("Hiba a telep nevének lekérésekor:", err);
      }
    })();
  }, []);

  const { isRouteAllowed } = usePermissions();

  const navigation: NavItem[] = useMemo(() => {
    return navigationConfig
      .filter(item => isRouteAllowed(user?.role, item.href))
      .map(item => ({
        name: t(item.nameKey) || item.fallbackName || item.nameKey,
        href: item.href,
        icon: item.icon,
        badge: item.href === "/munkak" ? workCount : item.href === "/uzenetek" ? notifCount : undefined
      }));
  }, [notifCount, workCount, t, isRouteAllowed, user?.role]);


  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-card border-r border-border transition-transform duration-300 ease-in-out flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* --- ÚJ HEADER --- */}
        <div className="relative flex flex-col items-center justify-center pt-8 pb-6 border-b border-border bg-card">

          {/* Mobil bezáró gomb */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden absolute top-2 right-2 text-muted-foreground hover:text-destructive"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Logo és Címek */}
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="group flex flex-col items-center gap-3 transition-transform duration-200 active:scale-95"
          >
            {/* LOGO */}
            <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm border border-border/40 group-hover:shadow-md group-hover:border-primary/30 transition-all duration-300">
              <img
                src="/farmlogpro.png"
                alt="FarmLog Pro"
                className="h-full w-full object-contain p-2"
              />
            </div>

            {/* SZÖVEGEK */}
            <div className="flex flex-col items-center text-center">
              {/* 1. App Neve */}
              <span className="font-extrabold text-2xl tracking-tight text-foreground group-hover:text-primary transition-colors">
                FarmLog Pro
              </span>

              {/* 2. "Vezérlőpult" felirat (eredeti) */}
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground group-hover:text-muted-foreground/80 mt-1">
                Vezérlőpult
              </span>

              {/* 3. Telep Neve (Alatta, Nagybetűs, Kiemelt) */}
              {farmName && (
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mt-1 max-w-[180px] truncate">
                  {farmName}
                </span>
              )}
            </div>
          </Link>
        </div>
        {/* --- HEADER VÉGE --- */}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.href ||
                (item.href !== "/" && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
                    isActive
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary" />
                  )}

                  <Icon className={cn("h-5 w-5 shrink-0 transition-colors", isActive ? "text-primary" : "group-hover:text-foreground")} />
                  <span className="truncate">{item.name}</span>
                  <CountBadge count={item.badge} />
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Auth footer */}
        {user && (
          <div className="mt-auto p-4 border-t border-border bg-card/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {user.displayName?.charAt(0) || user.username?.charAt(0) || "U"}
              </div>
              <div className="text-xs text-muted-foreground leading-tight overflow-hidden">
                <div className="font-semibold text-foreground truncate">
                  {user.displayName || (user as any)?.username || "Felhasználó"}
                </div>
                <div className="opacity-80 truncate italic">
                  {t(`role.${(user as any)?.role}`)}
                </div>
              </div>
            </div>
            <Button
              onClick={logout}
              className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              size="sm"
              variant="ghost"
            >
              <LogOut className="h-4 w-4 mr-2" /> {t("menu.logout")}
            </Button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Top bar for mobile */}
        <header className="sticky top-0 z-30 lg:hidden bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between p-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </Button>

            {/* Mobil Header Logo */}
            <div className="flex items-center gap-2">
              <img src="/farmlogpro.png" alt="Logo" className="h-8 w-8 object-contain" />
              <div className="flex flex-col leading-none">
                <span className="font-bold text-base text-foreground">
                  FarmLog Pro
                </span>
                <span className="text-[10px] font-black uppercase text-emerald-600 truncate max-w-[120px]">
                  {farmName || ""}
                </span>
              </div>
            </div>
            <div className="w-10" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
