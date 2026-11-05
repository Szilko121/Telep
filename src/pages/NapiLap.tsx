import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle, Save, Clock, ArrowRight, User, History, Ban,
  CalendarClock, AlertTriangle, Beaker, Droplets, Leaf, ShieldCheck, Bone, HeartPulse, Zap, Warehouse, Skull
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { waitForAuth } from "@/lib/firebase";
import { getActiveTurnus, getShiftConfig, closeTurnus, type TurnusDoc } from "@/services/turnus";
import { collection, getDoc, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { farmCollection, farmDoc } from "@/lib/farmDb";

// --- TÍPUSOK ---

type Ol = { id: string; nev: string; csoportId?: string };
type Csoport = { id: string; nev: string; betelepitesDatum?: string };
type DayDoc = {
  date: string;
  elhulas?: Record<string, number>;
  elhulasSaved?: boolean;
  operator?: { id: string; nev: string; displayName?: string } | null;
  shiftStart?: string;
  shiftHours?: number;
};

type BarnTaskData = {
  barnId: string;
  barnName: string;
  age: number;
  placementDate: string;
  tasks: Array<{ label: string; value: string; icon: string; type: string }>;
};

// --- HELPEREK & STÍLUSOK ---

const getVitaminIcon = (iconName: string, className?: string) => {
  const props = { className: cn("w-5 h-5", className) };
  switch (iconName) {
    case "shield": return <ShieldCheck {...props} />;
    case "zap": return <Zap {...props} />;
    case "heart": return <HeartPulse {...props} />;
    case "bone": return <Bone {...props} />;
    case "leaf": return <Leaf {...props} />;
    case "flask": return <Beaker {...props} />;
    default: return <Droplets {...props} />;
  }
};

const getTaskStyles = (type: string) => {
  switch (type) {
    case "liquid":
      return {
        card: "bg-cyan-50/80 border-cyan-200",
        iconBg: "bg-white text-cyan-600",
        textLabel: "text-cyan-700",
        textValue: "text-cyan-950",
      };
    case "powder":
      return {
        card: "bg-amber-50/80 border-amber-200",
        iconBg: "bg-white text-amber-600",
        textLabel: "text-amber-700",
        textValue: "text-amber-950",
      };
    default:
      return {
        card: "bg-slate-50/80 border-slate-200",
        iconBg: "bg-white text-slate-600",
        textLabel: "text-slate-600",
        textValue: "text-slate-900",
      };
  }
};

const FALLBACK_COLUMNS = [
  { id: "col_szimbio", label: "Szimbiotikum", icon: "shield", type: "powder" },
  { id: "col_multi", label: "Multivitamin", icon: "zap", type: "liquid" },
  { id: "col_maj", label: "Májvédő", icon: "heart", type: "liquid" },
  { id: "col_csont", label: "Csonterősítés", icon: "bone", type: "liquid" },
  { id: "col_egyeb", label: "Egyéb / Speciál", icon: "droplet", type: "liquid" },
  { id: "col_sav", label: "Savanyítás", icon: "flask", type: "liquid" },
  { id: "col_novenyi", label: "Növényi kiv.", icon: "leaf", type: "powder" },
];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function fromISO(s: string): Date {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
}
function formatHMS(msLeft: number) {
  const t = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

export default function NapiLap() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  // State-ek
  const [loading, setLoading] = useState(true);
  const [turnus, setTurnus] = useState<TurnusDoc | null>(null);
  const [olak, setOlak] = useState<Ol[]>([]);
  const [csoportok, setCsoportok] = useState<Csoport[]>([]);

  const [cfgStart, setCfgStart] = useState<string>("07:00");
  const [cfgHours, setCfgHours] = useState<number>(24);

  const [effectiveISO, setEffectiveISO] = useState<string>("");
  const [targetPrev, setTargetPrev] = useState<boolean>(false);
  const [effectiveOperatorName, setEffectiveOperatorName] = useState<string>("-");

  const [barnTasksList, setBarnTasksList] = useState<BarnTaskData[]>([]);

  const [scheduleMissing, setScheduleMissing] = useState(false);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);

  const [order, setOrder] = useState<string[]>([]);
  const [namesMap, setNamesMap] = useState<Map<string, string>>(new Map());
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const warned30Ref = useRef(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("mortality"); // "mortality" | "vitamin"

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // === FŐ BETÖLTÉS ===
  // === FŐ BETÖLTÉS ===
  const loadData = async () => {
    try {
      await waitForAuth();

      const act = await getActiveTurnus();
      setTurnus(act);

      // ÖSSZES ÓL (farms/{farmId}/olak)
      const oSnap = await getDocs(farmCollection("olak"));
      const olakList = oSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Ol[];
      setOlak(olakList);

      // CSOPORTOK (farms/{farmId}/csoportok)
      const cSnap = await getDocs(farmCollection("csoportok"));
      const csoportokList = cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Csoport[];
      setCsoportok(csoportokList);

      if (act) {
        // Műszak config a turnushoz
        const cfg = await getShiftConfig(act.id);
        setCfgStart(cfg.shiftStart || "07:00");
        setCfgHours(cfg.shiftHours || 24);

        // Műszakos lista (farms/{farmId}/muszakosok)
        const muszSnap = await getDocs(farmCollection("muszakosok"));
        const muszakosok = muszSnap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, nev: data.displayName || data.nev || "Névtelen" };
        });
        const ids = muszakosok.map((m: any) => m.id);

        // Műszak sorend config: farms/{farmId}/turnusok/{turnusId}/muszakBeosztas/config
        const cfgRef = doc(collection(farmDoc("turnusok", act.id), "muszakBeosztas"), "config");
        const cfgSnap = await getDoc(cfgRef);
        const savedOrder = cfgSnap.exists() ? ((cfgSnap.data().order as string[]) || undefined) : undefined;
        const orderMerged = (savedOrder || ids).filter((x: string) => ids.includes(x));

        setOrder(orderMerged.length ? orderMerged : ids);
        setNamesMap(new Map(muszakosok.map((m: any) => [m.id, m.nev])));

        const eff = await computeEffectiveISO(act.id, cfg.shiftStart || "07:00");
        setEffectiveISO(eff.effectiveISO);
        setTargetPrev(eff.targetPrev);

        await loadDayDoc(eff.effectiveISO, act.id, olakList);
        await loadVitaminTasks(eff.effectiveISO, olakList, csoportokList, act);
      }
    } catch (err: any) {
      console.error(err);
      toast({
        title: t("common.error"),
        description: "Betöltési hiba",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [t]);

  // --- VITAMIN TERV LEKÉRÉSE ---
  async function loadVitaminTasks(
    currentDateISO: string,
    currentOlak: Ol[],
    currentGroups: Csoport[],
    activeTurnus: TurnusDoc
  ) {
    try {
      const today = startOfDay(parseISO(currentDateISO));

      // farms/{farmId}/meta/vitamin_global
      const globalSnap = await getDoc(farmDoc("meta", "vitamin_global"));
      let columns = globalSnap.exists() ? (globalSnap.data().columns || []) : [];
      if (columns.length === 0) columns = FALLBACK_COLUMNS;

      // farms/{farmId}/meta/vitamin_plans
      const plansSnap = await getDoc(farmDoc("meta", "vitamin_plans"));
      const allPlans = plansSnap.exists() ? plansSnap.data() : {};

      const resultList: BarnTaskData[] = [];

      for (const barn of currentOlak) {
        let startDateStr = activeTurnus.deploy?.betelepitesDatum;

        // Ha csoport-specifikus betelepítési dátum van, azt használjuk
        if (barn.csoportId) {
          const grp = currentGroups.find((g) => g.id === barn.csoportId);
          if (grp && grp.betelepitesDatum) startDateStr = grp.betelepitesDatum;
        }

        if (!startDateStr) continue;

        const start = startOfDay(parseISO(startDateStr));
        const age = differenceInCalendarDays(today, start);
        if (age < 0) continue;

        const barnPlan = (allPlans as any)[barn.id];
        if (barnPlan && Array.isArray(barnPlan.rows)) {
          const row = barnPlan.rows.find((r: any) => Number(r.day) === age);
          if (row) {
            const tasks: any[] = [];
            columns.forEach((col: any) => {
              if (row[col.id]) {
                tasks.push({
                  label: col.label,
                  value: row[col.id],
                  icon: col.icon,
                  type: col.type,
                });
              }
            });
            if (tasks.length > 0) {
              const realBarn = currentOlak.find((o) => o.id === barn.id);
              resultList.push({
                barnId: barn.id,
                barnName: realBarn ? realBarn.nev : barn.id,
                age,
                placementDate: startDateStr,
                tasks,
              });
            }
          }
        }
      }

      resultList.sort((a, b) =>
        a.barnName.localeCompare(b.barnName, undefined, { numeric: true })
      );
      setBarnTasksList(resultList);
    } catch (err) {
      console.error("Vitamin load error:", err);
    }
  }

  // --- EGYÉB LOGIKA ---
  function rotationInfo(
    tDoc: TurnusDoc | null,
    ord: string[],
    start: string,
    hours: number
  ) {
    if (!tDoc || !ord.length) return null;
    const baseISO = tDoc.deploy?.betelepitesDatum
      ? tDoc.deploy!.betelepitesDatum!
      : toISO(new Date());
    const [hh, mm] = (start || "07:00").split(":").map(Number);
    const anchor = fromISO(baseISO);
    anchor.setHours(hh || 0, mm || 0, 0, 0);
    const now = new Date(nowTick);
    const durMs = (hours || 24) * 3600 * 1000;
    const idx = Math.floor((now.getTime() - anchor.getTime()) / durMs);
    const pos = ((idx % ord.length) + ord.length) % ord.length;
    const currentId = ord[pos];
    const nextId = ord[(pos + 1) % ord.length];
    const nextChange = new Date(anchor.getTime() + (idx + 1) * durMs);
    return {
      currentId,
      nextId,
      nextAt: nextChange,
      nextName: namesMap.get(nextId) || "-",
      currentName: namesMap.get(currentId) || "-",
      digital: formatHMS(nextChange.getTime() - now.getTime()),
    };
  }

  async function computeEffectiveISO(turnusId: string, shiftStart: string) {
    const now = new Date();
    const [hh, mm] = (shiftStart || "07:00").split(":").map(Number);
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hh || 0,
      mm || 0,
      0,
      0
    );
    let effective = toISO(todayStart);
    let targetPrev = false;

    if (now.getTime() < todayStart.getTime()) {
      const yday = new Date(
        todayStart.getFullYear(),
        todayStart.getMonth(),
        todayStart.getDate() - 1
      );
      effective = toISO(yday);
      targetPrev = true;
    }

    // farms/{farmId}/turnusok/{turnusId}/muszakBeosztasDays/{effective}
    const prevRef = doc(
      collection(farmDoc("turnusok", turnusId), "muszakBeosztasDays"),
      effective
    );
    const snap = await getDoc(prevRef);
    if (snap.exists()) {
      const dd = snap.data() as DayDoc;
      if (dd.elhulasSaved === false) targetPrev = true;
    }

    return { effectiveISO: effective, targetPrev };
  }

  async function loadDayDoc(iso: string, turnusId?: string, currentOlak?: Ol[]) {
    if (!turnus && !turnusId) return;
    const tid = turnusId || turnus!.id;

    const ref = doc(
      collection(farmDoc("turnusok", tid), "muszakBeosztasDays"),
      iso
    );
    const snap = await getDoc(ref);

    if (snap.exists()) {
      setScheduleMissing(false);
      const d = snap.data() as DayDoc;
      const nextVals: Record<string, string> = {};
      const targetOlak = currentOlak || olak;

      for (const ol of targetOlak) {
        const n = d.elhulas?.[ol.id];
        if (n !== undefined) nextVals[ol.id] = String(n);
      }
      setValues(nextVals);
      setEffectiveOperatorName(
        d.operator?.displayName || d.operator?.nev || "-"
      );
    } else {
      setScheduleMissing(true);
      setShowExpiredDialog(true);
      setValues({});
      setEffectiveOperatorName("-");
    }
  }

  useEffect(() => {
    if (!effectiveISO || !turnus) return;
    loadDayDoc(effectiveISO);
  }, [effectiveISO, turnus?.id, olak.length]);

  const idsInView = useMemo(() => olak.map((o) => o.id), [olak]);

  function onKeyDownInput(
    e: React.KeyboardEvent<HTMLInputElement>,
    currentId: string
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const idx = idsInView.indexOf(currentId);
    const nextId = e.shiftKey ? idsInView[idx - 1] : idsInView[idx + 1];
    if (!nextId) return;
    const el = document.getElementById(
      `elh-${nextId}`
    ) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }

  function setVal(olId: string, v: string) {
    const clean = v.replace(/\D+/g, "");
    setValues((prev) =>
      prev[olId] === clean ? prev : { ...prev, [olId]: clean }
    );
  }

  useEffect(() => {
    if (!turnus || scheduleMissing) return;
    const [hh, mm] = (cfgStart || "07:00").split(":").map(Number);

    const tick = async () => {
      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hh || 0,
        mm || 0,
        0,
        0
      );
      const end = new Date(
        todayStart.getTime() + (Number(cfgHours) || 24) * 3600 * 1000
      );
      const minsLeft = Math.ceil((end.getTime() - now.getTime()) / 60000);

      if (minsLeft === 30 && !warned30Ref.current) {
        warned30Ref.current = true;
        toast({
          title: t("dailylog.toast.warning_30"),
          description: t("dailylog.toast.warning_30_desc"),
          variant: "destructive",
        });
      }

      if (minsLeft <= 0) {
        const prevISO = toISO(
          new Date(
            todayStart.getFullYear(),
            todayStart.getMonth(),
            todayStart.getDate()
          )
        );

        const prevRef = doc(
          collection(farmDoc("turnusok", turnus.id), "muszakBeosztasDays"),
          prevISO
        );
        const snap = await getDoc(prevRef);
        if (snap.exists()) {
          const dd = snap.data() as DayDoc;
          if (!dd.elhulasSaved) {
            toast({
              title: t("dailylog.toast.missing_prev"),
              description: t("dailylog.toast.missing_prev_desc"),
              variant: "destructive",
            });
            setEffectiveISO(prevISO);
            setTargetPrev(true);
            setEffectiveOperatorName(
              dd.operator?.displayName || dd.operator?.nev || "-"
            );
            await loadDayDoc(prevISO);
          }
        }
      }
    };

    const id = setInterval(tick, 60000);
    tick();
    return () => clearInterval(id);
  }, [turnus?.id, cfgStart, cfgHours, scheduleMissing, t]);

  const header = useMemo(() => {
    if (!turnus || !order.length || scheduleMissing) return null;
    const info = rotationInfo(turnus, order, cfgStart, Number(cfgHours || 24));
    if (!info) return null;
    return { ...info, startText: cfgStart, hours: cfgHours };
  }, [turnus, order, cfgStart, cfgHours, nowTick, scheduleMissing]);

  const total = useMemo(() => {
    let s = 0;
    for (const k in values) {
      const n = Number(values[k]);
      if (!isNaN(n) && n >= 0) s += n;
    }
    return s;
  }, [values]);

  async function saveElhulas() {
    if (!turnus) return;
    if (scheduleMissing) {
      toast({
        title: t("common.error"),
        description: t("dailylog.toast.no_schedule_save"),
        variant: "destructive",
      });
      setShowExpiredDialog(true);
      return;
    }

    try {
      const ref = doc(
        collection(farmDoc("turnusok", turnus.id), "muszakBeosztasDays"),
        effectiveISO
      );
      const snap = await getDoc(ref);
      const prevData = snap.exists() ? (snap.data() as DayDoc) : {};
      const elhulas: Record<string, number> = { ...(prevData.elhulas || {}) };

      for (const ol of olak) {
        const n = Number(values[ol.id] || 0);
        if (!isNaN(n) && n >= 0) elhulas[ol.id] = n;
      }

      const payload: any = {
        date: effectiveISO,
        elhulas,
        elhulasSaved: true,
        savedAt: serverTimestamp(),
      };

      if (!prevData.operator && header) {
        payload.operator = {
          id: header.currentId,
          nev: header.currentName,
          displayName: header.currentName,
        };
        payload.shiftStart = header.startText;
        payload.shiftHours = header.hours;
      }

      await setDoc(ref, payload, { merge: true });

      toast({
        title: t("dailylog.toast.saved"),
        description: t("dailylog.toast.saved_desc", {
          date: effectiveISO,
          suffix: targetPrev ? t("dailylog.toast.suffix_prev") : "",
        }),
      });

      if (targetPrev) setTargetPrev(false);
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleCloseTurnusLocal() {
    if (!turnus) return;
    try {
      await closeTurnus(turnus.id);
      setShowExpiredDialog(false);
      toast({ title: t("common.success") });
      await loadData();
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    }
  }

  function handleExtendRedirect() {
    navigate("/muszakbeosztas");
  }

  // === RENDER ===

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-6">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-32 relative">
      {/* --- HIBA: NINCS BEOSZTÁS --- */}
      {scheduleMissing && (
        <div className="p-4">
          <Alert className="mb-4 border-red-500 bg-red-50/50" variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("dailylog.no_schedule_title")}</AlertTitle>
            <AlertDescription>
              {t("dailylog.no_schedule_desc", { date: effectiveISO })}
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-4 sm:flex-row justify-center">
            <Button variant="outline" onClick={() => setShowExpiredDialog(true)}>
              {t("dailylog.options_btn")}
            </Button>
          </div>
        </div>
      )}

      {/* --- NORMÁL MŰKÖDÉS --- */}
      {!scheduleMissing && (
        <>
          <div className="p-4 space-y-4">
            {/* 1. MŰSZAKVEZETŐ ÉS IDŐZÍTŐ */}
            <div className="flex flex-col md:flex-row gap-4 items-stretch">
              <Card className="flex-1 bg-gradient-to-br from-background to-muted/20 border-l-4 border-l-primary shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      {t("dailylog.shift_leader")}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-xl font-bold truncate">
                        {header ? header.currentName : effectiveOperatorName}
                      </span>
                    </div>
                  </div>
                  {targetPrev && (
                    <Badge variant="destructive" className="ml-2 shadow-sm">
                      {t("dailylog.prev_shift_badge")}
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {header && (
                <Card className="flex-1 bg-gradient-to-br from-background to-muted/20 border-l-4 border-l-blue-500 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      {t("dailylog.time_left")}
                    </p>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-blue-500" />
                        <span className="text-2xl font-mono font-bold tracking-tight tabular-nums">
                          {header.digital}
                        </span>
                      </div>
                      {header.nextName && header.nextName !== "-" && (
                        <div className="text-right text-xs text-muted-foreground border-l pl-3 min-w-[80px]">
                          <span className="block opacity-70">
                            {t("dailylog.next_shift")}
                          </span>
                          <span className="font-semibold block text-foreground flex items-center justify-end gap-1">
                            {header.nextName} <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* FIGYELMEZTETÉS */}
            {targetPrev && (
              <Alert className="animate-in fade-in slide-in-from-top-2 shadow-md" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("dailylog.warning_missing")}</AlertTitle>
                <AlertDescription>
                  {t("dailylog.warning_missing_desc", { date: effectiveISO })}
                </AlertDescription>
              </Alert>
            )}

            {/* --- SZÍNES TABS A FUNKCIÓKHOZ --- */}
            <Tabs
              defaultValue="mortality"
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-6 h-14 bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                <TabsTrigger
                  value="mortality"
                  className="group rounded-xl h-full data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500 font-bold transition-all hover:text-rose-600"
                >
                  <Skull className="w-5 h-5 mr-2" /> Elhullás
                  {total > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 bg-slate-200 text-slate-700 group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white border-0 hidden sm:inline-flex transition-colors"
                    >
                      {total}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="vitamin"
                  className="group rounded-xl h-full data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500 font-bold transition-all hover:text-indigo-600"
                >
                  <Droplets className="w-5 h-5 mr-2" /> Itatás / Vitamin
                  {barnTasksList.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 bg-slate-200 text-slate-700 group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white border-0 hidden sm:inline-flex transition-colors"
                    >
                      {barnTasksList.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* 1. TAB: ELHULLÁS */}
              <TabsContent
                value="mortality"
                className="mt-0 animate-in slide-in-from-left-2 duration-300"
              >
                <Card className="overflow-hidden shadow-md border-muted">
                  <CardHeader className="pb-3 bg-muted/30 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <History className="h-5 w-5 text-muted-foreground" />{" "}
                        {t("dailylog.title")}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="font-mono text-sm bg-background"
                      >
                        {effectiveISO}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableBody>
                        {olak.map((ol, idx) => (
                          <TableRow
                            key={ol.id}
                            className={cn(
                              "transition-colors border-b border-muted last:border-0",
                              idx % 2 === 0
                                ? "bg-background"
                                : "bg-muted/10 hover:bg-muted/20"
                            )}
                          >
                            <TableCell className="py-3 pl-6 font-medium text-base text-foreground/80">
                              {ol.nev}
                            </TableCell>
                            <TableCell className="py-3 pr-4 text-right w-[140px]">
                              <Input
                                id={`elh-${ol.id}`}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={values[ol.id] ?? ""}
                                onChange={(e) =>
                                  setVal(ol.id, e.currentTarget.value)
                                }
                                onKeyDown={(e) => onKeyDownInput(e, ol.id)}
                                className="h-11 text-lg text-center font-semibold shadow-sm"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 2. TAB: VITAMIN / ITATÁS */}
              <TabsContent
                value="vitamin"
                className="mt-0 animate-in slide-in-from-right-2 duration-300"
              >
                {barnTasksList.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <CalendarClock className="w-4 h-4" /> Napi Teendők
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {barnTasksList.map((barn) => (
                        <Card
                          key={barn.barnId}
                          className="border-l-4 border-l-indigo-500 bg-gradient-to-r from-indigo-50/30 to-white shadow-sm hover:shadow-md transition-shadow"
                        >
                          <CardHeader className="pb-2 pt-4 px-4">
                            <div className="flex justify-between items-center">
                              <CardTitle className="text-base font-bold text-indigo-950 flex items-center gap-2">
                                <Warehouse className="w-4 h-4 text-indigo-600" />
                                {barn.barnName}
                              </CardTitle>
                              <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200">
                                {barn.age}. nap
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-4 px-4">
                            <div className="flex flex-col gap-2">
                              {barn.tasks.map((task, idx) => {
                                const styles = getTaskStyles(task.type);
                                return (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "flex items-center gap-3 p-2.5 rounded-lg border shadow-sm transition-all hover:shadow-md",
                                      styles.card
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "p-2 rounded-full flex-shrink-0",
                                        styles.iconBg
                                      )}
                                    >
                                      {getVitaminIcon(task.icon)}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span
                                        className={cn(
                                          "text-[10px] font-extrabold uppercase tracking-widest truncate",
                                          styles.textLabel
                                        )}
                                      >
                                        {task.label}
                                      </span>
                                      <span
                                        className={cn(
                                          "font-semibold text-sm break-words leading-tight",
                                          styles.textValue
                                        )}
                                      >
                                        {task.value}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 bg-muted/10 border border-dashed border-muted rounded-xl text-center">
                    <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                      <CalendarClock className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Nincs előírt vitamin vagy kezelés a mai napra.
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Ellenőrizd, hogy az állományok be vannak-e telepítve.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* --- FOOTER --- */}
          <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-background/95 backdrop-blur-md border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 p-4 safe-area-bottom transition-all duration-300">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {t("dailylog.total_mortality")}
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-primary leading-none">
                  {total}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    db
                  </span>
                </span>
              </div>
              <Button
                onClick={saveElhulas}
                size="lg"
                className="px-6 sm:px-8 shadow-lg shadow-primary/20 transition-transform active:scale-95"
              >
                <Save className="mr-2 h-5 w-5" /> {t("dailylog.save_btn")}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* --- DIALOG: LEJÁRT BEOSZTÁS --- */}
      <AlertDialog open={showExpiredDialog} onOpenChange={setShowExpiredDialog}>
        <AlertDialogContent className="border-l-4 border-red-500">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {t("dailylog.dialog.expired_title")}
            </AlertDialogTitle>
            <AlertDialogDescription
              dangerouslySetInnerHTML={{
                __html: t("dailylog.dialog.expired_desc"),
              }}
            />
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div
              className="flex flex-col gap-2 p-4 border rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={handleExtendRedirect}
            >
              <h4 className="font-semibold flex items-center gap-2 text-primary">
                <CalendarClock className="h-4 w-4" />
                {t("dailylog.dialog.add_shift")}
              </h4>
            </div>
            <div
              className="flex flex-col gap-2 p-4 border rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer border-red-200"
              onClick={handleCloseTurnusLocal}
            >
              <h4 className="font-semibold flex items-center gap-2 text-red-800">
                <Ban className="h-4 w-4" />
                {t("dailylog.dialog.close_batch")}
              </h4>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate("/")}>
              {t("dailylog.dialog.back_home")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
