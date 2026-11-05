// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
  Query,
  CollectionReference,
  orderBy,
  limit,
  Timestamp,
  doc,    // <--- ÚJ
  getDoc, // <--- ÚJ
} from "firebase/firestore";
import { db, waitForAuth } from "@/lib/firebase"; // <--- db HOZZÁADVA
import { getActiveTurnus } from "@/services/turnus";
import { getIdealTemp } from "@/data/chickenTemperatures";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Home,
  Users,
  FileText,
  PlusCircle,
  Droplets,
  Activity,
  Briefcase,
  TrendingDown,
  CalendarDays,
  CheckCircle2,
  Wind,
  Target,
  Clock,
} from "lucide-react";
import { farmCollection, farmDoc } from "@/lib/farmDb";

// --- Típusok ---

type ActivityItem = {
  id: string;
  textKey: string;
  textParam?: string;
  subText?: string;
  time: string;
  rawTime: number;
  type: "log" | "work" | "alert" | "system";
};

// --- Segédfüggvények ---

async function countSafe<T = unknown>(
  refOrQuery: Query<T> | CollectionReference<T>
): Promise<number> {
  try {
    const agg = await getCountFromServer(refOrQuery);
    return agg.data().count;
  } catch (e) {
    const snap = await getDocs(refOrQuery);
    return snap.size;
  }
}

function getRelativeTime(
  ts: Timestamp | null | undefined,
  t: (key: string) => string
): string {
  if (!ts || !ts.toMillis) return "";
  const diff = Date.now() - ts.toMillis();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return t("common.now");
  if (minutes < 60) return `${minutes} ${t("common.min_ago")}`;
  if (hours < 24) return `${hours} ${t("common.hour_ago")}`;
  return `${days} ${t("common.day_ago")}`;
}

/**
 * Csirke életkor számítás napokban a betelepítési dátum alapján.
 */
function calcChickenAgeDays(betelepitesDatum?: string | null): number {
  if (!betelepitesDatum) return 0;

  let parts: string[] = [];
  if (betelepitesDatum.includes("-")) {
    parts = betelepitesDatum.split("-");
  } else if (betelepitesDatum.includes(".")) {
    parts = betelepitesDatum.split(".");
  } else {
    return 0;
  }

  if (parts.length < 3) return 0;

  const [yStr, mStr, dStr] = parts;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return 0;

  const start = new Date(y, m - 1, d);
  const now = new Date();
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffMs = now.getTime() - start.getTime();
  if (diffMs < 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [farmName, setFarmName] = useState(""); // <--- ÚJ STATE A TELEP NEVÉNEK

  const [stats, setStats] = useState({
    olak: 0,
    csoportok: 0,
    muszakosok: 0,
    turnusok: 0,
    turnusAktiv: 0,
  });

  const [stockStats, setStockStats] = useState({
    initial: 0,
    current: 0,
    mortalityCount: 0,
    mortalityRate: 0,
    dayAge: 0,
    hasActive: false,
    statusKey: "dashboard.status.no_active",
  });

  const [weather, setWeather] = useState<{
    temp: number | null;
    humidity: number | null;
  }>({ temp: null, humidity: null });
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // --- 1. Adatbetöltés ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await waitForAuth();

        // --- TELEP NEVÉNEK LEKÉRÉSE ---
        const farmId = localStorage.getItem("current_farm_id");
        if (farmId) {
          const farmSnap = await getDoc(doc(db, "farms", farmId));
          if (farmSnap.exists()) {
            const fData = farmSnap.data();
            // Feltételezzük, hogy 'name' vagy 'nev' mezőben van a név
            setFarmName(fData.name || fData.nev || "Saját Telep");
          }
        }
        // -----------------------------

        // *** MINDEN GYŰJTEMÉNY A FARMon BELÜL ***
        const olakRef = farmCollection("olak");
        const csoportokRef = farmCollection("csoportok");
        const muszakosokRef = farmCollection("muszakosok");
        const turnusokRef = farmCollection("turnusok");
        const aktivTurnusQ = query(turnusokRef, where("active", "==", true));

        const [
          olakCnt,
          csoportokCnt,
          muszakosokCnt,
          turnusokCnt,
          aktivTurnusCnt,
        ] = await Promise.all([
          countSafe(olakRef),
          countSafe(csoportokRef),
          countSafe(muszakosokRef),
          countSafe(turnusokRef),
          countSafe(aktivTurnusQ),
        ]);

        if (mounted) {
          setStats({
            olak: olakCnt,
            csoportok: csoportokCnt,
            muszakosok: muszakosokCnt,
            turnusok: turnusokCnt,
            turnusAktiv: aktivTurnusCnt,
          });
        }

        const activeTurnus = await getActiveTurnus();

        if (activeTurnus && mounted) {
          const daysCol = collection(
            farmDoc("turnusok", activeTurnus.id),
            "muszakBeosztasDays"
          );
          let totalMortality = 0;
          const logActivities: ActivityItem[] = [];
          let maxAgeFromDocs = 0;

          try {
            const daysSnap = await getDocs(
              query(daysCol, orderBy("savedAt", "desc"), limit(20))
            );
            daysSnap.docs.forEach((docSnap) => {
              const data = docSnap.data() as any;

              if (data.elhulas) {
                Object.values(data.elhulas).forEach(
                  (v: any) => (totalMortality += Number(v) || 0)
                );
              }

              if (data.ages) {
                const agesValues = Object.values(data.ages).map(
                  (v: any) => Number(v) || 0
                );
                const currentDocMaxAge = Math.max(...agesValues);
                if (currentDocMaxAge > maxAgeFromDocs)
                  maxAgeFromDocs = currentDocMaxAge;
              }

              if (data.elhulasSaved) {
                const opName =
                  data.operator?.displayName ||
                  data.operator?.nev ||
                  "Unknown";
                logActivities.push({
                  id: docSnap.id,
                  textKey: "dashboard.events.log_text",
                  subText: `${data.date} • ${opName}`,
                  time: "",
                  rawTime: data.savedAt?.toMillis() || 0,
                  type: "log",
                });
              }
            });
          } catch (err) {
            console.warn("Hiba muszakBeosztasDays olvasáskor:", err);
          }

          let workActivities: ActivityItem[] = [];
          try {
            const workQ = query(
              farmCollection("workRequests"),
              orderBy("submittedAt", "desc"),
              limit(5)
            );
            const workSnap = await getDocs(workQ);
            workActivities = workSnap.docs.map((d) => {
              const w = d.data() as any;
              return {
                id: d.id,
                textKey: "dashboard.events.work_text",
                textParam: w.task,
                subText: `${w.createdByName} • ${w.hours}h`,
                time: "",
                rawTime: w.submittedAt?.toMillis() || 0,
                type: "work",
              };
            });
          } catch (err) {
            console.warn("Error workRequests olvasáskor:", err);
          }

          const merged = [...logActivities, ...workActivities]
            .sort((a, b) => b.rawTime - a.rawTime)
            .slice(0, 10);
          setActivities(merged);

          const deployData = (activeTurnus as any).deploy || {};
          const initial = Number(deployData.osszesCsirke) || 0;
          const current = Math.max(0, initial - totalMortality);
          const rate = initial > 0 ? (totalMortality / initial) * 100 : 0;

          let dayAge = calcChickenAgeDays(
            (deployData.betelepitesDatum as string | null) || null
          );

          if (dayAge <= 0 && maxAgeFromDocs > 0) {
            dayAge = maxAgeFromDocs;
          }

          setStockStats({
            initial,
            current,
            mortalityCount: totalMortality,
            mortalityRate: rate,
            dayAge,
            hasActive: true,
            statusKey:
              initial > 0
                ? "dashboard.status.active"
                : "dashboard.status.no_data",
          });
        } else {
          setStockStats((prev) => ({
            ...prev,
            hasActive: false,
            statusKey: "dashboard.status.no_active",
          }));
        }
      } catch (error) {
        console.error("Hiba Dashboard betöltéskor:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [language]);

  // --- Időjárás ---
  useEffect(() => {
    let mounted = true;
    async function fetchWeather() {
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=47.3527&longitude=17.5826&current=temperature_2m,relative_humidity_2m&timezone=auto"
        );
        if (!res.ok) throw new Error("Időjárás hiba");
        const data = await res.json();
        if (mounted && data.current) {
          setWeather({
            temp: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setWeatherLoading(false);
      }
    }
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const idealTemp = getIdealTemp(stockStats.dayAge);

  const getWeatherAdvice = () => {
    if (weather.temp == null) return t("common.loading");
    const isHu = language === "hu";

    if (stockStats.hasActive && stockStats.dayAge > 0) {
      const diff = weather.temp - idealTemp;
      if (diff > 5)
        return isHu
          ? `Kint túl meleg van (${Math.round(
              weather.temp
            )}°C). Hűtés/szellőzés kritikus! Cél: ${idealTemp}°C`
          : `Too hot outside (${Math.round(
              weather.temp
            )}°C). Cooling critical! Target: ${idealTemp}°C`;
      if (diff < -15)
        return isHu
          ? `Kint hideg van (${Math.round(
              weather.temp
            )}°C). Fűtés ellenőrzése ajánlott! Cél: ${idealTemp}°C`
          : `Cold outside (${Math.round(
              weather.temp
            )}°C). Check heating! Target: ${idealTemp}°C`;
    }
    if (weather.temp > 28)
      return isHu
        ? "Hőségriadó! Hűtés fokozása."
        : "Heat alert! Increase cooling.";
    if (weather.temp < 2)
      return isHu
        ? "Fagyveszély! Vízhálózat védelme."
        : "Frost danger! Protect water lines.";
    if (weather.humidity != null && weather.humidity > 85)
      return isHu
        ? "Magas pára! Alom ellenőrzése."
        : "High humidity! Check litter.";
    return isHu
      ? "Külső körülmények elfogadhatóak."
      : "External conditions acceptable.";
  };

  const quickActions = [
    {
      label: t("dashboard.qa.daily"),
      icon: FileText,
      path: "/napilap",
      color: "bg-blue-600 hover:bg-blue-700",
    },
    {
      label: t("dashboard.qa.schedule"),
      icon: Briefcase,
      path: "/muszakbeosztas",
      color: "bg-indigo-600 hover:bg-indigo-700",
    },
    {
      label: t("dashboard.qa.work"),
      icon: Clock,
      path: "/munkak",
      color: "bg-violet-600 hover:bg-violet-700",
    },
    {
      label: t("dashboard.qa.barns"),
      icon: Home,
      path: "/olak",
      color: "bg-slate-700 hover:bg-slate-800",
    },
  ];

  const displayStatus = (() => {
    if (stockStats.statusKey === "dashboard.status.active")
      return t("dashboard.status.active");
    if (stockStats.statusKey === "dashboard.status.no_data")
      return t("dashboard.status.no_data");
    if (stockStats.statusKey === "dashboard.status.no_active")
      return t("dashboard.status.no_active");
    return "-";
  })();

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("dashboard.title")}
          </h1>
          
          {/* --- TELEP NEVE (NAGYBETŰS, PROFI STÍLUS) --- */}
          <h2 className="text-2xl font-black text-emerald-600 uppercase tracking-widest mt-1">
            {farmName || "..."}
          </h2>
          {/* --------------------------------------------- */}

          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {new Date().toLocaleDateString(
              language === "hu" ? "hu-HU" : "en-US",
              {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {stats.turnusAktiv === 0 && (
            <Button
              onClick={() => navigate("/betelepites")}
              className="bg-emerald-600 hover:bg-emerald-700 animate-pulse"
            >
              <PlusCircle className="mr-2 h-4 w-4" />{" "}
              {t("dashboard.new_turnus")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-emerald-500 shadow-sm bg-emerald-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-900">
              {t("dashboard.stats.stock")}
            </CardTitle>
            <Users className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {stockStats.hasActive && stockStats.initial > 0
                ? `${stockStats.current.toLocaleString()} ${t(
                    "dashboard.unit.pcs"
                  )}`
                : displayStatus}
            </div>
            <p className="text-xs text-emerald-600/80 mt-1">
              {stockStats.initial > 0
                ? `${t("dashboard.stats.initial")}: ${stockStats.initial.toLocaleString()}`
                : t("dashboard.stats.missing_initial")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-rose-500 shadow-sm bg-rose-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-rose-900">
              {t("dashboard.stats.mortality")}
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">
              {stockStats.hasActive
                ? `${stockStats.mortalityCount} ${t("dashboard.unit.pcs")}`
                : "-"}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {stockStats.initial > 0 ? (
                <>
                  <Progress
                    value={stockStats.mortalityRate * 5}
                    className="h-1.5 bg-rose-200 w-24"
                  />
                  <span className="text-xs text-rose-600 font-medium">
                    {stockStats.mortalityRate.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs text-rose-600">
                  {t("dashboard.stats.unknown_percent")}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-blue-500 shadow-sm bg-blue-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-900">
              {t("dashboard.stats.age")}
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {stockStats.dayAge > 0
                ? `${stockStats.dayAge}. ${t("dashboard.day_nth")}`
                : stockStats.dayAge === 0 && stockStats.hasActive
                ? `0. ${t("dashboard.day_nth")}`
                : "-"}
            </div>
            <p className="text-xs text-blue-600/80 mt-1">
              {stockStats.dayAge >= 0 && stockStats.hasActive
                ? t("dashboard.stats.since_start")
                : t("dashboard.stats.unknown_date")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-violet-500 shadow-sm bg-violet-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-violet-900">
              {t("dashboard.stats.workers")}
            </CardTitle>
            <Briefcase className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-700">
              {stats.muszakosok} {t("dashboard.unit.head")}
            </div>
            <p className="text-xs text-violet-600/80 mt-1">
              {t("dashboard.stats.workers_sub")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* BAL OSZLOP (4 wide) */}
        <div className="md:col-span-4 space-y-6">
          {/* GYORS MŰVELETEK */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>{t("dashboard.qa.title")}</CardTitle>
              <CardDescription>{t("dashboard.qa.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.label}
                      variant="default"
                      className={`h-20 flex flex-col items-center justify-center gap-1 text-lg shadow-sm transition-all hover:scale-[1.02] active:scale-95 ${action.color}`}
                      onClick={() => navigate(action.path)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-6 w-6" />
                        <span className="font-semibold">{action.label}</span>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* LEGUTÓBBI ESEMÉNYEK */}
          <Card className="flex flex-col shadow-sm h-[350px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                {t("dashboard.events.title")}
              </CardTitle>
              <CardDescription>{t("dashboard.events.desc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden relative">
              <ScrollArea className="h-full px-6 pb-4">
                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                    {loading
                      ? t("common.loading")
                      : t("dashboard.events.empty")}
                  </div>
                ) : (
                  <div className="space-y-5 pt-2">
                    {activities.map((act) => {
                      let displayTitle = t(act.textKey);
                      if (act.textParam) {
                        displayTitle = `${displayTitle}: ${act.textParam}`;
                      }

                      const timeStr = getRelativeTime(
                        { toMillis: () => act.rawTime } as any,
                        t
                      );

                      return (
                        <div
                          key={act.id}
                          className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0 group"
                        >
                          {act.type === "log" ? (
                            <div className="bg-blue-100 p-1.5 rounded-full mt-0.5">
                              <FileText className="h-4 w-4 text-blue-600" />
                            </div>
                          ) : (
                            <div className="bg-amber-100 p-1.5 rounded-full mt-0.5">
                              <Briefcase className="h-4 w-4 text-amber-600" />
                            </div>
                          )}
                          <div className="space-y-0.5 flex-1">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-medium leading-none text-foreground group-hover:text-primary transition-colors">
                                {displayTitle}
                              </p>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap bg-muted px-1.5 py-0.5 rounded">
                                {timeStr}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {act.subText}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* JOBB OSZLOP (3 wide) */}
        <div className="md:col-span-3 space-y-6">
          {/* IDŐJÁRÁS WIDGET */}
          <Card className="bg-gradient-to-br from-sky-50 to-indigo-50 border-sky-200 shadow-md overflow-hidden relative">
            <div className="absolute -right-6 -top-6 bg-sky-200/30 h-32 w-32 rounded-full blur-2xl" />
            <CardHeader className="pb-2 relative z-10">
              <CardTitle className="text-base flex items-center gap-2 text-sky-900">
                <Wind className="h-4 w-4" /> {t("dashboard.weather.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex justify-between items-center mb-4">
                <div className="text-center">
                  <span className="text-4xl font-bold text-sky-950">
                    {weatherLoading
                      ? "--"
                      : weather.temp !== null
                      ? `${Math.round(weather.temp)}°`
                      : "N/A"}
                  </span>
                  <p className="text-xs font-medium text-sky-700 uppercase tracking-wide mt-1">
                    {t("dashboard.weather.outside")}
                  </p>
                </div>
                <div className="h-10 w-[1px] bg-sky-200/60" />
                <div className="text-center">
                  <span className="text-4xl font-bold text-sky-950">
                    {weatherLoading
                      ? "--"
                      : weather.humidity !== null
                      ? `${weather.humidity}%`
                      : "N/A"}
                  </span>
                  <p className="text-xs font-medium text-sky-700 uppercase tracking-wide flex items-center gap-1 justify-center mt-1">
                    <Droplets className="h-3 w-3" />{" "}
                    {t("dashboard.weather.humidity")}
                  </p>
                </div>
              </div>

              {stockStats.hasActive && stockStats.dayAge >= 0 && (
                <div className="mb-4 bg-white/60 backdrop-blur-md rounded-lg p-3 flex justify-between items-center border border-sky-100/50 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="bg-sky-100 p-1.5 rounded-full text-sky-700">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-sky-800 font-bold uppercase tracking-wider">
                        {t("dashboard.weather.age_label")}
                      </p>
                      <p className="text-sm font-extrabold text-sky-950">
                        {stockStats.dayAge} {t("dashboard.days")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-[10px] text-sky-800 font-bold uppercase tracking-wider">
                        {t("dashboard.weather.ideal_label")}
                      </p>
                      <p className="text-sm font-extrabold text-sky-950">
                        {idealTemp}°C
                      </p>
                    </div>
                    <div className="bg-orange-100 p-1.5 rounded-full text-orange-600">
                      <Target className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white/60 backdrop-blur-sm p-3 rounded-lg border border-sky-100 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-sky-900 uppercase">
                    {t("dashboard.weather.advice_label")}
                  </p>
                  <p className="text-xs text-sky-800 leading-tight mt-0.5">
                    {getWeatherAdvice()}
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-center text-sky-400 mt-3">
                {t("dashboard.weather.location")} •{" "}
                {t("dashboard.weather.updated")}:{" "}
                {new Date().toLocaleTimeString(
                  language === "hu" ? "hu-HU" : "en-US",
                  { hour: "2-digit", minute: "2-digit" }
                )}
              </div>
            </CardContent>
          </Card>

          {/* RENDSZER INFO */}
          <Card className="border-dashed shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("dashboard.sys.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between">
                <span>{t("dashboard.sys.db")}</span>
                <span className="text-emerald-600 font-bold">
                  {t("dashboard.sys.active")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("dashboard.sys.barns_count")}</span>
                <span className="font-medium">
                  {stats.olak} {t("dashboard.unit.pcs")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("dashboard.sys.groups_count")}</span>
                <span className="font-medium">
                  {stats.csoportok} {t("dashboard.unit.pcs")}
                </span>
              </div>
              <div className="pt-2 border-t text-center text-muted-foreground/50">
                v1.0.0 • Cseke Szilárd
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
