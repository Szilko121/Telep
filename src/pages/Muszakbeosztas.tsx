import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDocs,
  setDoc,
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore"; // collection és doc már nem kell innen közvetlenül
import { waitForAuth } from "@/lib/firebase"; // db már nem kell innen
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- ÚJ HELPEREK IMPORTÁLÁSA
import {
  getActiveTurnus,
  type TurnusDoc,
  getShiftConfig,
  saveShiftConfig,
  closeTurnus,
} from "@/services/turnus";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  GripVertical,
  Plus,
  Trash2,
  Pencil,
  Settings,
  Timer,
  ArrowRight,
  Info,
  CalendarDays,
  Briefcase,
  CalendarClock,
  AlertTriangle,
  Ban,
  Users,
  ListOrdered,
  Calendar
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

/* ---------- Típusok ---------- */
type Muszakos = {
  id: string;
  nev: string;
  displayName?: string;
};

type Csoport = { id: string; nev: string; betelepitesDatum?: string | null };

type DayDoc = {
  date: string;
  operator: { id: string; nev: string; displayName?: string } | null;
  ages: Record<string, number | null>;
  shiftStart?: string;
  shiftHours?: number;
};

/* ---------- Segédfüggvények ---------- */
function toId(input: string): string {
  if (!input) return "";
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
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
function pad2(n: number) { return String(Math.max(0, n)).padStart(2, "0"); }
function formatHMS(msLeft: number) {
  if (msLeft <= 0) return "00:00:00";
  const t = Math.floor(msLeft / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function sanitizeOrder(order: string[], validIds: string[]): string[] {
  const set = new Set<string>(), valid = new Set(validIds), out: string[] = [];
  for (const id of order) { if (!valid.has(id)) continue; if (!set.has(id)) { set.add(id); out.push(id); } }
  for (const id of validIds) if (!set.has(id)) out.push(id);
  return out;
}
function diffDaysISO(aISO: string, bISO: string): number { return Math.floor((fromISO(aISO).getTime() - fromISO(bISO).getTime()) / 86400000); }
function getAnchorISO(days: DayDoc[], turnus: TurnusDoc | null): string {
  if (days.length) return days[0].date;
  if (turnus?.deploy?.betelepitesDatum) return turnus.deploy.betelepitesDatum;
  return toISO(new Date());
}
function lastKnownOperatorIdInOrder(order: string[], days: DayDoc[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) { const id = days[i]?.operator?.id || null; if (id && order.includes(id)) return id; }
  return null;
}
function resolveOperatorIdForDate(iso: string, order: string[], days: DayDoc[], turnus: TurnusDoc | null): string {
  if (!order.length) return "";
  const lastId = lastKnownOperatorIdInOrder(order, days);
  if (lastId) { const i = order.indexOf(lastId); return order[(i + 1) % order.length]; }
  const anchorISO = getAnchorISO(days, turnus);
  const anchorOpId = days.length ? (days[0].operator?.id || null) : null;
  const baseIdx = anchorOpId && order.includes(anchorOpId) ? order.indexOf(anchorOpId) : 0;
  const offset = diffDaysISO(iso, anchorISO);
  const idx = ((baseIdx + offset) % order.length + order.length) % order.length;
  return order[idx];
}
function dateAtLocal(iso: string, hhmm?: string): Date {
  const [h, m] = (hhmm || "07:00").split(":").map((x) => Number(x) || 0);
  const d = fromISO(iso); d.setHours(h, m, 0, 0); return d;
}

function resolveName(id: string | null | undefined, map: Map<string, Muszakos>, fallbackObj?: { nev?: string, displayName?: string } | null): string {
  if (id && map.has(id)) {
    const m = map.get(id)!;
    return m.displayName || m.nev || "-";
  }
  if (fallbackObj) {
    return fallbackObj.displayName || fallbackObj.nev || "-";
  }
  return "-";
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
}

/* ====================================================================== */
/*                           FŐ KOMPONENS                                 */
/* ====================================================================== */
export default function Muszakbeosztas() {
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const role = user?.role;
  const canManage = role === "admin" || role === "főnök";

  const [loading, setLoading] = useState(true);
  const [turnus, setTurnus] = useState<TurnusDoc | null>(null);
  const [muszakosok, setMuszakosok] = useState<Muszakos[]>([]);
  const [csoportok, setCsoportok] = useState<Csoport[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [daysDocs, setDaysDocs] = useState<DayDoc[]>([]);
  const [cfgShiftStart, setCfgShiftStart] = useState<string>("07:00");
  const [cfgShiftHours, setCfgShiftHours] = useState<number>(24);

  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => { const id = setInterval(() => setNowTick(Date.now()), 1000); return () => clearInterval(id); }, []);

  const [scheduleExpired, setScheduleExpired] = useState(false);
  const [expiredDialogOpen, setExpiredDialogOpen] = useState(false);
  const [extendDaysInput, setExtendDaysInput] = useState<number>(3);

  const [newNev, setNewNev] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetDate, setDeleteTargetDate] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTargetDate, setEditTargetDate] = useState<string | null>(null);
  const [editSelectedOperator, setEditSelectedOperator] = useState<string>("");
  const [dragId, setDragId] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [genStart, setGenStart] = useState<string>("");
  const [genDays, setGenDays] = useState<number>(14);
  const [genShiftStart, setGenShiftStart] = useState<string>("07:00");
  const [genShiftHours, setGenShiftHours] = useState<number>(24);

  const canEditTurnus = !!turnus && turnus.active === true;
  const canEdit = canManage && canEditTurnus;

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLTableRowElement>(null);

  // --- BETÖLTÉS ---
  const loadData = async () => {
    try {
      setLoading(true);
      await waitForAuth();

      // JAVÍTVA: farmCollection használata a sima collection helyett
      const [muszSnap, usersSnap, csSnap, t] = await Promise.all([
        getDocs(farmCollection("muszakosok")),
        getDocs(farmCollection("users")),
        getDocs(farmCollection("csoportok")),
        getActiveTurnus() // Fontos: Ellenőrizd, hogy a service is farm-kompatibilis-e!
      ]);

      const usersList = usersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      const mergedMuszakosok = muszSnap.docs.map((d) => {
        const mData = d.data() as any;
        const mId = d.id;
        const linkedUser = usersList.find(u => u.id === mId || u.muszakosId === mId);
        return {
          id: mId,
          nev: mData.nev,
          displayName: linkedUser?.displayName || mData.displayName || mData.nev
        } as Muszakos;
      });

      setMuszakosok(mergedMuszakosok);

      const cs = csSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Csoport[];
      setCsoportok(cs);

      setTurnus(t);

      if (t) {
        const cfg = await getShiftConfig(t.id);
        setCfgShiftStart(cfg.shiftStart || "07:00");
        setCfgShiftHours(cfg.shiftHours || 24);
        setGenShiftStart(cfg.shiftStart || "07:00");

        // JAVÍTVA: farmDoc használata
        const cfgRef = farmDoc("turnusok", t.id, "muszakBeosztas", "config");
        const cfgSnap = await getDoc(cfgRef);
        const saved = cfgSnap.exists() ? (cfgSnap.data().order as string[] | undefined) : undefined;

        const baseIds = mergedMuszakosok.map((b) => b.id);
        const startOrder = saved && saved.length
          ? saved
          : [...mergedMuszakosok]
            .sort((a, b) => (a.displayName || a.nev).localeCompare(b.displayName || b.nev))
            .map((x) => x.id);

        setOrder(sanitizeOrder(startOrder, baseIds));

        // JAVÍTVA: farmCollection használata algyűjteményhez (path stringgel)
        const daysRef = farmCollection(`turnusok/${t.id}/muszakBeosztasDays`);
        const dSnap = await getDocs(daysRef);
        const arr = dSnap.docs.map((d) => d.data() as any) as DayDoc[];
        const sorted = arr.filter((x) => x && x.date).sort((a, b) => a.date.localeCompare(b.date));
        setDaysDocs(sorted);

        if (t.deploy?.betelepitesDatum) setGenStart(t.deploy.betelepitesDatum);
        else setGenStart(toISO(new Date()));

      } else {
        setOrder(sanitizeOrder([], mergedMuszakosok.map(m => m.id)));
        setDaysDocs([]);
        setGenStart(toISO(new Date()));
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (loading || !daysDocs.length || !turnus?.active) return;
    const lastDay = daysDocs[daysDocs.length - 1];
    const todayISOStr = toISO(new Date());
    if (lastDay.date < todayISOStr) {
      setScheduleExpired(true);
      if (!expiredDialogOpen) setExpiredDialogOpen(true);
    } else {
      setScheduleExpired(false);
    }
  }, [daysDocs, loading, turnus?.active]);

  useEffect(() => {
    if (!daysDocs.length) return;
    const now = new Date(nowTick);
    const current = daysDocs.find(d => {
      const start = dateAtLocal(d.date, d.shiftStart || cfgShiftStart);
      const end = new Date(start.getTime() + (d.shiftHours || cfgShiftHours) * 3600000);
      return start <= now && now < end;
    });
    if (current && currentRowRef.current) {
      setTimeout(() => {
        currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 500);
    }
  }, [daysDocs.length, loading]);

  const muszakosMap = useMemo(() => new Map(muszakosok.map((m) => [m.id, m])), [muszakosok]);

  const headerInfo = useMemo(() => {
    if (!daysDocs.length) return null;
    const now = new Date(nowTick);
    const enhanced = [...daysDocs].map((d) => {
      const start = dateAtLocal(d.date, d.shiftStart ?? cfgShiftStart);
      const hours = Number(d.shiftHours ?? cfgShiftHours) || 24;
      const end = new Date(start.getTime() + hours * 3600_000);
      return { ...d, start, end, hours };
    }).sort((a, b) => a.start.getTime() - b.start.getTime());

    const current = enhanced.find((x) => x.start.getTime() <= now.getTime() && now.getTime() < x.end.getTime()) || null;
    const next = current ? enhanced.find((x) => x.start.getTime() >= current.end.getTime()) : enhanced.find((x) => x.start.getTime() > now.getTime());
    let nextChange: Date | null = null;
    if (current) nextChange = current.end; else if (next) nextChange = next.start;

    const currentName = current ? resolveName(current.operator?.id, muszakosMap, current.operator) : t("schedule.no_shift");
    const currentStartISO = current?.date || null;

    let nextName = "-";
    const nextOpId = next?.operator?.id;
    if (nextOpId) {
      nextName = resolveName(nextOpId, muszakosMap, next?.operator);
    } else if (current?.operator?.id && order.length) {
      const i = order.indexOf(current.operator.id);
      if (i >= 0) {
        const nid = order[(i + 1) % order.length];
        const predictedName = resolveName(nid, muszakosMap, null);
        nextName = `(${t("schedule.table.current_badge")}: ${predictedName})`;
      }
    }

    const msLeft = nextChange ? nextChange.getTime() - now.getTime() : 0;
    const digital = nextChange ? formatHMS(msLeft) : t("schedule.expired_badge");

    return { currentName, nextName, digital, currentStartISO, isExpired: !current && !next };
  }, [daysDocs, cfgShiftStart, cfgShiftHours, nowTick, muszakosMap, order, t]);

  useEffect(() => { if (turnus?.deploy?.betelepitesDatum) setGenStart(turnus.deploy?.betelepitesDatum); else setGenStart(toISO(new Date())); }, [turnus]);

  function ageFor(iso: string, cs: Csoport, turnus: TurnusDoc | null): number | null {
    if (!turnus || !turnus.active) return null;
    const deployDate = turnus.deploy?.betelepitesDatum || null;
    const groupDate = cs.betelepitesDatum || null;
    if (!deployDate || !groupDate) return null;
    if (groupDate < deployDate) return null;

    const startMs = fromISO(groupDate).getTime();
    const targetMs = fromISO(iso).getTime();
    const diff = Math.floor((targetMs - startMs) / 86400000);

    return diff < 0 ? null : diff;
  }

  async function saveShiftCfg() {
    if (!canEdit) return;
    if (!turnus) return;
    try {
      await saveShiftConfig(turnus.id, { shiftStart: cfgShiftStart, shiftHours: cfgShiftHours });
      toast({ title: t("common.saved") });
    } catch (e: any) {
      if (e.code === 'permission-denied') toast({ title: t("schedule.toast.no_perm"), variant: "destructive" });
      else toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    }
  }

  async function generateDays() {
    if (!canEdit) return;
    if (!turnus || !genStart || !order.length) return;
    const useStart = genShiftStart || "07:00";
    const useHours = Number(genShiftHours || 24);
    try {
      const start = fromISO(genStart);
      for (let i = 0; i < Math.max(1, genDays); i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const iso = toISO(d);
        const opId = order[i % order.length];

        const opNev = resolveName(opId, muszakosMap, null);
        const ages: Record<string, number | null> = {};
        for (const cs of csoportok) {
          ages[cs.id] = ageFor(iso, cs, turnus);
        }

        // JAVÍTVA: farmDoc használata
        await setDoc(farmDoc("turnusok", turnus.id, "muszakBeosztasDays", iso), {
          date: iso,
          operator: { id: opId, nev: opNev, displayName: opNev },
          ages,
          savedAt: serverTimestamp(),
          shiftStart: useStart,
          shiftHours: useHours
        }, { merge: true });
      }
      await loadData();
      toast({ title: t("schedule.toast.gen_done"), description: t("schedule.toast.gen_desc", { count: genDays }) });
    } catch (e: any) {
      if (e.code === 'permission-denied') toast({ title: t("schedule.toast.no_perm"), variant: "destructive" });
      else toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    }
  }

  async function handleExtendShift() {
    if (!canEdit) return;
    if (!turnus || !order.length) return;
    try {
      const count = extendDaysInput; if (count <= 0) return;
      const lastISO = daysDocs.length ? daysDocs[daysDocs.length - 1].date : toISO(new Date());
      let currentLast = fromISO(lastISO);
      for (let i = 0; i < count; i++) {
        currentLast.setDate(currentLast.getDate() + 1);
        const nextISO = toISO(currentLast);
        const lastDayDoc = daysDocs[daysDocs.length - 1];
        const lastOpId = lastDayDoc?.operator?.id;
        let nextOpId = "";
        if (lastOpId) { const idx = order.indexOf(lastOpId); nextOpId = order[(idx + 1 + i) % order.length]; }
        else { nextOpId = order[i % order.length]; }

        const opNev = resolveName(nextOpId, muszakosMap, null);
        const ages: Record<string, number | null> = {};
        for (const cs of csoportok) {
          ages[cs.id] = ageFor(nextISO, cs, turnus);
        }

        // JAVÍTVA: farmDoc használata
        await setDoc(farmDoc("turnusok", turnus.id, "muszakBeosztasDays", nextISO), {
          date: nextISO,
          operator: { id: nextOpId, nev: opNev, displayName: opNev },
          ages,
          savedAt: serverTimestamp(),
          shiftStart: cfgShiftStart,
          shiftHours: cfgShiftHours
        }, { merge: true });
      }
      await loadData();
      setExpiredDialogOpen(false);
      toast({ title: t("schedule.toast.extended"), description: t("schedule.toast.extended_desc", { count }) });
    } catch (e: any) {
      if (e.code === 'permission-denied') toast({ title: t("schedule.toast.no_perm"), description: t("schedule.toast.only_leader"), variant: "destructive" });
      else toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    }
  }

  async function addNextDay() {
    if (!canEdit) return;
    if (!turnus || !order.length) return;
    try {
      setIsAdding(true);
      const lastISO = daysDocs.length ? daysDocs[daysDocs.length - 1].date : null;
      const base = lastISO ?? (turnus.deploy?.betelepitesDatum || toISO(new Date()));
      const nextISO = lastISO ? (() => { const d = fromISO(lastISO); d.setDate(d.getDate() + 1); return toISO(d); })() : base;
      const opId = resolveOperatorIdForDate(nextISO, order, daysDocs, turnus);

      const opNev = resolveName(opId, muszakosMap, null);

      const ages: Record<string, number | null> = {};
      for (const cs of csoportok) {
        ages[cs.id] = ageFor(nextISO, cs, turnus);
      }

      const newDoc = {
        date: nextISO,
        operator: { id: opId, nev: opNev, displayName: opNev },
        ages,
        savedAt: serverTimestamp(),
        shiftStart: cfgShiftStart,
        shiftHours: cfgShiftHours
      };

      // JAVÍTVA: farmDoc használata
      await setDoc(farmDoc("turnusok", turnus.id, "muszakBeosztasDays", nextISO), newDoc, { merge: true });

      const updated = [...daysDocs, newDoc as any];
      updated.sort((a, b) => a.date.localeCompare(b.date));
      setDaysDocs(updated);
      setTimeout(() => { if (bodyScrollRef.current) bodyScrollRef.current.scrollTo({ top: bodyScrollRef.current.scrollHeight, behavior: 'smooth' }); }, 100);
      toast({ title: t("schedule.toast.day_added"), description: `${nextISO} • ${opNev}` });

    } catch (e: any) {
      if (e.code === 'permission-denied') toast({ title: t("schedule.toast.no_perm"), description: t("schedule.toast.only_leader"), variant: "destructive" });
      else toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally { setIsAdding(false); }
  }

  async function handleEditDay() {
    if (!canEdit || !editTargetDate || !editSelectedOperator) return;
    try {
      const opNev = resolveName(editSelectedOperator, muszakosMap, null);
      // JAVÍTVA: farmDoc használata
      await updateDoc(farmDoc("turnusok", turnus!.id, "muszakBeosztasDays", editTargetDate), {
        operator: { id: editSelectedOperator, nev: opNev, displayName: opNev },
        updatedAt: serverTimestamp()
      });
      setDaysDocs(daysDocs.map((d) => d.date === editTargetDate ? { ...d, operator: { id: editSelectedOperator, nev: opNev, displayName: opNev } } : d));
      toast({ title: t("common.saved") });
    } catch (e: any) { toast({ title: t("common.error"), description: t("schedule.toast.no_perm"), variant: "destructive" }); } finally { setEditDialogOpen(false); }
  }

  async function handleDeleteDay() {
    if (!canEdit || !turnus || !deleteTargetDate) return;
    try {
      // JAVÍTVA: farmDoc használata
      await deleteDoc(farmDoc("turnusok", turnus.id, "muszakBeosztasDays", deleteTargetDate));
      setDaysDocs(daysDocs.filter((d) => d.date !== deleteTargetDate));
      toast({ title: t("common.success") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: t("schedule.toast.no_perm"), variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
    }
  }

  async function handleCloseTurnusUI() { if (!turnus || !canManage) return; try { await closeTurnus(turnus.id); setExpiredDialogOpen(false); toast({ title: t("common.success") }); await loadData(); } catch (e: any) { toast({ title: t("common.error"), description: e.message, variant: "destructive" }); } }

  async function saveOrderToTurnus() {
    if (!canEdit || !turnus) return;
    try {
      const clean = sanitizeOrder(order, muszakosok.map((m) => m.id));
      // JAVÍTVA: farmDoc használata
      const ref = farmDoc("turnusok", turnus.id, "muszakBeosztas", "config");
      await setDoc(ref, { order: clean, savedAt: serverTimestamp() }, { merge: true });
      setOrder(clean);
      toast({ title: t("schedule.toast.order_saved") });
    } catch (e: any) { toast({ title: t("common.error"), description: t("schedule.toast.no_perm"), variant: "destructive" }); }
  }

  function onDragStart(e: React.DragEvent, id: string) { if (!canEdit) return; setDragId(id); e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e: React.DragEvent) { if (!canEdit) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  function onDrop(e: React.DragEvent, overId: string) { if (!canEdit) return; e.preventDefault(); setOrder((prev) => { if (!dragId || dragId === overId) return prev; const list = [...prev]; const from = list.indexOf(dragId); const to = list.indexOf(overId); if (from === -1 || to === -1) return prev; const [moved] = list.splice(from, 1); list.splice(from < to ? to - 1 : to, 0, moved); return sanitizeOrder(list, muszakosok.map((m) => m.id)); }); setDragId(null); }
  function onDragEnd() { setDragId(null); }

  if (loading) return <div className="flex items-center justify-center h-[50vh] text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="max-w-[1200px] mx-auto p-4 sm:p-6 space-y-6 pb-24">
      {/* HERO SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
        <Card className={cn("md:col-span-2 border-l-4 shadow-md", headerInfo?.isExpired || !headerInfo?.currentName ? "bg-amber-50/80 border-l-amber-500" : "bg-gradient-to-br from-background to-muted/30 border-l-emerald-500")}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Briefcase className="w-3 h-3" /> {t("schedule.current_shift")}</span>
              <div className="flex items-center gap-3">
                <Avatar className={cn("h-12 w-12 border-2", headerInfo?.isExpired ? "border-amber-200" : "border-emerald-100")}>
                  <AvatarFallback className={cn("font-bold text-lg", headerInfo?.isExpired ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                    {headerInfo?.currentName ? getInitials(headerInfo.currentName) : "!"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className={cn("text-3xl font-bold leading-none tracking-tight", headerInfo?.isExpired ? "text-amber-800" : "text-foreground")}>{headerInfo?.currentName}</h2>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <CalendarDays className="h-3 w-3" /> {headerInfo?.currentStartISO || toISO(new Date())}
                    <span className="opacity-50">|</span>
                    <Timer className="h-3 w-3" /> {cfgShiftStart}
                  </p>
                </div>
              </div>
            </div>
            {headerInfo && (<div className="text-right hidden sm:block"><Badge variant="outline" className={cn("px-3 py-1 text-sm", headerInfo.isExpired ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>{headerInfo.isExpired ? t("schedule.no_shift") : t("dashboard.status.active")}</Badge></div>)}
          </CardContent>
        </Card>

        <Card className={cn("border-l-4 shadow-md", headerInfo?.digital === t("schedule.expired_badge") ? "border-l-red-500 bg-red-50/30" : "border-l-blue-500 bg-blue-50/10")}>
          <CardContent className="p-5 flex flex-col justify-center h-full space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" /> {t("schedule.next_shift")}</span>
            <div className={cn("text-4xl font-mono font-bold tracking-tight", headerInfo?.digital === t("schedule.expired_badge") ? "text-red-600" : "text-foreground")}>{headerInfo?.digital || "--:--:--"}</div>
            {headerInfo?.nextName && (<div className="text-xs text-muted-foreground pt-2 border-t flex items-center justify-between"><span>{t("common.next")}:</span><span className="font-semibold text-foreground">{headerInfo.nextName}</span></div>)}
          </CardContent>
        </Card>
      </div>

      {/* MAIN CONTENT */}
      <Card className="overflow-hidden border shadow-lg flex flex-col h-[65vh] animate-in fade-in duration-700">
        <CardHeader className="py-4 px-5 bg-muted/10 border-b flex flex-row items-center justify-between shrink-0">
          <div><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" /> {t("schedule.title")}</CardTitle><CardDescription className="hidden sm:block">{t("schedule.subtitle")}</CardDescription></div>

          {canManage && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-all">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("schedule.settings_title")}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[100%] sm:w-[540px] overflow-y-auto border-l-2 border-primary/10">
                <SheetHeader className="mb-6 space-y-1">
                  <SheetTitle className="text-2xl flex items-center gap-2">
                    <Settings className="w-6 h-6 text-primary" /> {t("schedule.settings_title")}
                  </SheetTitle>
                  <SheetDescription>
                    {t("schedule.settings_desc")}
                  </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="muszakosok" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-6 bg-muted/40 p-1 rounded-xl">
                    <TabsTrigger value="muszakosok" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all"><Users className="w-4 h-4 mr-2 hidden sm:block" /> {t("schedule.tab.people")}</TabsTrigger>
                    <TabsTrigger value="sorrend" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all"><ListOrdered className="w-4 h-4 mr-2 hidden sm:block" /> {t("schedule.tab.order")}</TabsTrigger>
                    <TabsTrigger value="generalas" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all"><CalendarClock className="w-4 h-4 mr-2 hidden sm:block" /> {t("schedule.tab.generate")}</TabsTrigger>
                    <TabsTrigger value="param" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all"><Info className="w-4 h-4 mr-2 hidden sm:block" /> {t("schedule.tab.info")}</TabsTrigger>
                  </TabsList>

                  {/* TAB: MŰSZAKOSOK */}
                  <TabsContent value="muszakosok" className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <Card className="border-none shadow-none bg-transparent">
                      <CardHeader className="px-0 pt-0">
                        <CardTitle className="text-lg">{t("schedule.people.add_title")}</CardTitle>
                      </CardHeader>
                      <div className="flex gap-2 p-1 bg-muted/30 rounded-xl border border-border/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all mb-6">
                        <Input
                          placeholder={t("schedule.people.placeholder")}
                          value={newNev}
                          onChange={e => setNewNev(e.target.value)}
                          className="flex-1 border-0 focus-visible:ring-0 bg-transparent text-lg h-12"
                        />
                        <Button
                          size="lg"
                          className="h-12 px-6 rounded-lg"
                          onClick={async () => {
                            const name = newNev.trim();
                            if (!name) return;
                            const id = toId(name);
                            // JAVÍTVA: farmDoc használata
                            await setDoc(farmDoc("muszakosok", id), { nev: name, displayName: name, createdAt: serverTimestamp() }, { merge: true });
                            setNewNev("");
                            await loadData();
                            toast({ title: t("schedule.toast.added"), description: t("schedule.toast.added_desc", { name }) });
                          }}
                        >
                          <Plus className="h-5 w-5 mr-2" /> {t("schedule.people.add_btn")}
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("schedule.people.list_title")} ({muszakosok.length})</h3>
                        <div className="grid gap-3">
                          {muszakosok.map(m => (
                            <div key={m.id} className="group flex items-center justify-between p-3 bg-card hover:bg-accent/5 rounded-xl border border-border/40 shadow-sm transition-all hover:shadow-md hover:border-primary/20">
                              <div className="flex items-center gap-4">
                                <Avatar className="h-10 w-10 border bg-muted text-muted-foreground group-hover:border-primary/50 transition-colors">
                                  <AvatarFallback>{getInitials(resolveName(m.id, muszakosMap, null))}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold text-base">{resolveName(m.id, muszakosMap, null)}</p>
                                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded w-fit">@{m.id}</p>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 w-9 rounded-lg transition-colors"
                                onClick={async () => {
                                  const nameToShow = resolveName(m.id, muszakosMap, null);
                                  if (confirm(`Biztosan törlöd ${nameToShow}-t?`)) {
                                    // JAVÍTVA: farmDoc használata
                                    await deleteDoc(farmDoc("muszakosok", m.id));
                                    setMuszakosok(p => p.filter(x => x.id !== m.id));
                                    toast({ title: t("common.success") });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </TabsContent>

                  {/* TAB: SORREND */}
                  <TabsContent value="sorrend" className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 rounded-xl text-sm border border-blue-100 dark:border-blue-900/50 flex items-start gap-3">
                      <Info className="w-5 h-5 shrink-0 mt-0.5" />
                      <p>{t("schedule.order.info")}</p>
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                      {order.map((id, idx) => {
                        const m = muszakosMap.get(id);
                        if (!m) return null;
                        const dName = resolveName(id, muszakosMap, null);
                        return (
                          <div
                            key={m.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, m.id)}
                            onDragOver={onDragOver}
                            onDrop={(e) => onDrop(e, m.id)}
                            onDragEnd={onDragEnd}
                            className={cn(
                              "relative flex items-center gap-4 p-3 bg-card rounded-xl border shadow-sm cursor-move transition-all hover:border-primary/50 hover:shadow-md group select-none",
                              dragId === m.id && "opacity-40 border-dashed border-2 border-primary scale-[0.98]"
                            )}
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-muted group-hover:bg-primary/50 rounded-l-xl transition-colors" />
                            <span className="text-xs font-bold text-muted-foreground/50 w-6 text-center ml-2">{idx + 1}.</span>

                            <Avatar className="h-9 w-9 border bg-background">
                              <AvatarFallback className="text-xs font-bold">{getInitials(dName)}</AvatarFallback>
                            </Avatar>

                            <span className="font-medium text-base flex-1">{dName}</span>

                            <div className="p-2 rounded-lg bg-muted/30 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              <GripVertical className="h-4 w-4" />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="pt-4 border-t mt-4">
                      <Button onClick={saveOrderToTurnus} className="w-full h-12 text-base shadow-lg" size="lg">
                        <Save className="mr-2 h-5 w-5" /> {t("schedule.order.save_btn")}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* TAB: GENERÁLÁS */}
                  <TabsContent value="generalas" className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">{t("schedule.gen.title")}</CardTitle>
                        <CardDescription>{t("schedule.gen.desc")}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-primary" /> {t("schedule.gen.start_date")}
                            </label>
                            <Input type="date" value={genStart} onChange={e => setGenStart(e.target.value)} className="h-11" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                              <ListOrdered className="w-4 h-4 text-primary" /> {t("schedule.gen.days_count")}
                            </label>
                            <Input type="number" min={1} max={60} value={genDays} onChange={e => setGenDays(Number(e.target.value))} className="h-11" />
                          </div>
                        </div>
                        <Separator />
                        <Button onClick={generateDays} className="w-full h-12 text-base shadow-md" size="lg">
                          <CalendarClock className="mr-2 h-5 w-5" /> {t("schedule.gen.start_btn")}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* TAB: PARAMÉTEREK */}
                  <TabsContent value="param" className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">{t("schedule.param.title")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">{t("schedule.param.start_time")}</label>
                            <Input type="time" className="h-11" value={cfgShiftStart} onChange={e => setCfgShiftStart(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">{t("schedule.param.duration")}</label>
                            <Input type="number" className="h-11" value={cfgShiftHours} onChange={e => setCfgShiftHours(Number(e.target.value))} />
                          </div>
                        </div>
                        <Button onClick={saveShiftCfg} variant="outline" className="w-full h-11 border-primary/20 hover:bg-primary/5 hover:text-primary">
                          {t("schedule.param.save_btn")}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </SheetContent>
            </Sheet>
          )}
        </CardHeader>

        {/* --- SCROLLABLE TABLE (EGYETLEN TÁBLÁZAT) --- */}
        <div ref={bodyScrollRef} className="flex-1 overflow-auto relative scrollbar-hide">
          <Table className="min-w-[800px]">
            <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
              <TableRow className="hover:bg-background border-b-2">
                <TableHead className="w-[140px] bg-background pl-6">{t("schedule.table.date")}</TableHead>
                <TableHead className="w-[220px] bg-background">{t("schedule.table.operator")}</TableHead>
                {csoportok.map(cs => (
                  <TableHead key={cs.id} className="text-center bg-background min-w-[100px]">{cs.nev}</TableHead>
                ))}
                {canEdit && <TableHead className="text-right bg-background pr-6">{t("schedule.table.action")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {daysDocs.map((d) => {
                const isToday = d.date === toISO(new Date());
                const isCurrent = headerInfo?.currentStartISO === d.date;
                const opName = resolveName(d.operator?.id, muszakosMap, d.operator);

                return (
                  <TableRow
                    key={d.date}
                    ref={isCurrent ? currentRowRef : null}
                    className={cn(
                      "transition-colors h-16",
                      isCurrent ? "bg-emerald-50/60 hover:bg-emerald-100/50 border-l-4 border-l-emerald-500" : "border-l-4 border-l-transparent",
                      d.date < toISO(new Date()) && "opacity-60 bg-muted/10",
                      isToday && !isCurrent && "bg-blue-50/30"
                    )}
                  >
                    <TableCell className="font-medium pl-6 relative">
                      <div className="flex flex-col justify-center">
                        <span className="text-base">{d.date} <span className="opacity-70 text-sm ml-1 font-normal capitalize">({fromISO(d.date).toLocaleDateString(language === 'hu' ? 'hu-HU' : 'en-US', { weekday: 'long' })})</span></span>
                        {isToday && <Badge variant="secondary" className="w-fit mt-1 text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-100">{t("schedule.table.today_badge")}</Badge>}
                        {isCurrent && <Badge variant="secondary" className="w-fit mt-1 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{t("schedule.table.current_badge")}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className={cn("h-9 w-9", isCurrent ? "ring-2 ring-emerald-400 ring-offset-2" : "")}>
                          <AvatarFallback className={cn("text-xs font-bold", isCurrent ? "bg-emerald-200 text-emerald-800" : "bg-muted text-muted-foreground")}>
                            {opName !== "-" ? getInitials(opName) : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn("font-medium text-base", opName === "-" && "text-muted-foreground italic")}>{opName}</span>
                      </div>
                    </TableCell>
                    {csoportok.map(cs => {
                      const val = ageFor(d.date, cs, turnus);

                      return (
                        <TableCell key={cs.id} className="text-center">
                          {val !== null && val !== undefined && val >= 0 ? (
                            <Badge variant="outline" className="font-mono text-xs font-normal bg-background/50">
                              {val} {t("dashboard.days")}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )
                    })}
                    {canEdit && (
                      <TableCell className="text-right pr-4">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-muted" onClick={() => { setEditTargetDate(d.date); setEditSelectedOperator(d.operator?.id || ""); setEditDialogOpen(true); }} title={t("common.edit")}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-100 hover:text-red-600 group" onClick={() => { setDeleteTargetDate(d.date); setDeleteDialogOpen(true); }} title={t("common.delete")}><Trash2 className="h-4 w-4 text-muted-foreground/50 group-hover:text-red-600 transition-colors" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* --- STICKY FOOTER ACTION --- */}
        <div className="border-t p-4 bg-background flex justify-center shrink-0">
          <Button
            onClick={addNextDay}
            disabled={!canEdit || !order.length || isAdding}
            className="rounded-full px-8 shadow-lg bg-primary hover:bg-primary/90 transition-all active:scale-95"
          >
            {isAdding ? t("common.loading") : <><Plus className="mr-2 h-5 w-5" /> {t("schedule.add_next_day")}</>}
          </Button>
        </div>
      </Card>

      {/* --- DIALOG: ELFOGYOTT A BEOSZTÁS --- */}
      <Dialog open={expiredDialogOpen} onOpenChange={setExpiredDialogOpen}>
        <DialogContent className="sm:max-w-md border-red-500 border-l-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {t("schedule.expired_title")}
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              {t("schedule.expired_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {canEdit ? (
              <div className="flex flex-col gap-2 p-4 border rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExtendDaysInput(3)}>
                <h4 className="font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  {t("schedule.extend_title")}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t("schedule.extend_desc")}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    className="w-20 h-8"
                    value={extendDaysInput}
                    onChange={(e) => setExtendDaysInput(Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm">{t("integration.feed.days")}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 border rounded-lg bg-gray-50 text-gray-500 text-sm text-center">
                {t("schedule.toast.only_leader")}
              </div>
            )}

            {canEdit && (
              <div className="flex flex-col gap-2 p-4 border rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer border-red-200"
                onClick={handleCloseTurnusUI}>
                <h4 className="font-semibold flex items-center gap-2 text-red-800">
                  <Ban className="h-4 w-4" />
                  {t("schedule.close_batch_title")}
                </h4>
                <p className="text-sm text-red-600/80">
                  {t("schedule.close_batch_desc")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="ghost" onClick={() => setExpiredDialogOpen(false)}>{t("common.cancel")}</Button>
            {canEdit && (
              <Button onClick={handleExtendShift} className="gap-2">
                {t("schedule.extend_title")} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- EGYÉB DIALOGOK --- */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("schedule.delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription dangerouslySetInnerHTML={{ __html: t("schedule.delete_confirm_desc", { date: deleteTargetDate || "" }) }} />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDay} className="bg-destructive text-white">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("schedule.edit_title", { date: editTargetDate || "" })}</DialogTitle></DialogHeader>
          <div className="py-4">
            <Select value={editSelectedOperator} onValueChange={setEditSelectedOperator}>
              <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
              <SelectContent>
                {order.map(id => {
                  const m = muszakosMap.get(id);
                  const dName = resolveName(id, muszakosMap, null);
                  return m ? <SelectItem key={m.id} value={m.id}>{dName}</SelectItem> : null;
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleEditDay}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
