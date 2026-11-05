import { useEffect, useMemo, useState } from "react";
import {
  Save, Cog, ArrowRight, ArrowLeft, Check, History,
  Users, Calendar, AlertTriangle, PlusCircle,
  Calculator, CheckCircle2, FileText, Warehouse, RefreshCw, ArrowDownToLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
// Dialog komponensek
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { waitForAuth } from "@/lib/firebase"; // db már nem kell közvetlenül
import { getActiveTurnus, closeTurnus, saveDeploy, type TurnusDoc } from "@/services/turnus";
import {
  getDocs,
  setDoc,
  getDoc,
  serverTimestamp,
  query,
  where,
  // collection törölve, mert farmCollection-t használunk
} from "firebase/firestore";
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- FONTOS: farm helperek
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

// --- TÍPUSOK ---
type Csoport = { id: string; nev: string };
type Ol = { id: string; nev: string; csoportId?: string };
type PastTurnus = {
  id: string;
  turnusId?: string;
  deploy?: {
    betelepitesDatum?: string;
    osszesCsirke?: number;
  };
};

// --- SEGÉDFÜGGVÉNYEK ---
function toId(input: string): string {
  return input ? input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
}
function todayISO(): string { return new Date().toISOString().split("T")[0]; }
function pickNev(data: any): string {
  return data?.nev ?? data?.name ?? data?.label ?? data?.olaszam ?? "No Name";
}

export default function Betelepites() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const role = user?.role;
  const canManage = role === "admin" || role === "főnök";

  const [loading, setLoading] = useState(true);
  const [turnus, setTurnus] = useState<TurnusDoc | null>(null);
  const [closing, setClosing] = useState(false);

  const [csoportok, setCsoportok] = useState<Csoport[]>([]);
  const [allOlak, setAllOlak] = useState<Ol[]>([]);
  const [filteredOlak, setFilteredOlak] = useState<Ol[]>([]);
  const [pastTurnusok, setPastTurnusok] = useState<PastTurnus[]>([]);

  // --- ÚJ TURNUS DIALOG STATE ---
  const [isNewTurnusOpen, setIsNewTurnusOpen] = useState(false);
  const [newTurnusIdInput, setNewTurnusIdInput] = useState("");

  // --- FORM STATE ---
  const [step, setStep] = useState(1);
  const [csoportId, setCsoportId] = useState<string>("");
  const [datum, setDatum] = useState<string>("");
  const [plannedTotal, setPlannedTotal] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [olSzamlalok, setOlSzamlalok] = useState<Record<string, string>>({});

  const baseCanEdit = !!turnus && turnus.active === true;
  const canEdit = baseCanEdit && canManage;

  // --- SZÁMÍTÁSOK ---
  const currentTotal = useMemo(() => {
    return Object.values(olSzamlalok).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [olSzamlalok]);

  const plannedNum = Number(plannedTotal) || 0;
  const difference = plannedNum > 0 ? plannedNum - currentTotal : 0;
  const isMatch = plannedNum > 0 && difference === 0;

  // --- BETÖLTÉS ---
  // --- BETÖLTÉS ---
  const loadData = async () => {
    try {
      await waitForAuth();

      // JAVÍTVA: farmCollection
      const snapCsoport = await getDocs(farmCollection("csoportok"));
      setCsoportok(
        snapCsoport.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      );

      // JAVÍTVA: farmCollection
      const snapOlak = await getDocs(farmCollection("olak"));
      const loadedAllOlak = snapOlak.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Ol[];

      loadedAllOlak.sort((a, b) => {
        const nevA = a.nev || "";
        const nevB = b.nev || "";
        return nevA.localeCompare(nevB, undefined, { numeric: true });
      });

      setAllOlak(loadedAllOlak);

      const act = await getActiveTurnus();
      setTurnus(act);

      if (act?.deploy) {
        const dpl: any = act.deploy;
        setCsoportId(dpl.csoportId || "");
        setDatum(dpl.betelepitesDatum || "");
        setPlannedTotal(String(dpl.osszesCsirke || ""));

        if (Array.isArray(dpl.olak)) {
          const m: Record<string, string> = {};
          dpl.olak.forEach((o: any) => {
            if (o.olId) m[o.olId] = String(o.csirkeDb ?? "");
          });
          setOlSzamlalok(m);
        }
      }

      // JAVÍTVA: farmCollection
      const ps = await getDocs(
        query(farmCollection("turnusok"), where("active", "==", false))
      );
      setPastTurnusok(ps.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Szűrés
  useEffect(() => {
    if (!csoportId) {
      setFilteredOlak([]);
      return;
    }
    const matches = allOlak.filter(ol => ol.csoportId === csoportId);
    setFilteredOlak(matches);
  }, [csoportId, allOlak]);

  // --- FUNKCIÓK ---

  const handleAutoDistribute = () => {
    if (!plannedNum || filteredOlak.length === 0) return;
    const base = Math.floor(plannedNum / filteredOlak.length);
    const remainder = plannedNum % filteredOlak.length;

    const newVals = { ...olSzamlalok };

    filteredOlak.forEach((ol, idx) => {
      const extra = idx < remainder ? 1 : 0;
      newVals[ol.id] = String(base + extra);
    });
    setOlSzamlalok(newVals);
    toast({
      title: t("deploy.alert.auto_success"),
      description: t("deploy.alert.auto_desc", { count: filteredOlak.length })
    });
  };

  const openNewTurnusDialog = () => {
    if (!canManage) {
      toast({ title: t("deploy.alert.no_perm"), description: t("deploy.alert.only_leader"), variant: "destructive" });
      return;
    }
    const suggested = `turnus-${todayISO()}`;
    setNewTurnusIdInput(suggested);
    setIsNewTurnusOpen(true);
  };

  const handleCreateTurnus = async () => {
    const fixedId = toId(newTurnusIdInput.trim());
    if (!fixedId) return;

    try {
      setLoading(true);
      // JAVÍTVA: farmDoc
      const ref = farmDoc("turnusok", fixedId);
      const ex = await getDoc(ref);
      if (ex.exists() && ex.data()?.active) {
        toast({
          title: t("common.error"),
          description: t("deploy.alert.exists"),
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      await setDoc(
        ref,
        { id: fixedId, turnusId: fixedId, active: true, createdAt: serverTimestamp() },
        { merge: true }
      );
      setTurnus(await getActiveTurnus());
      setIsNewTurnusOpen(false);
      toast({ title: t("common.success"), description: t("deploy.alert.created") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!turnus || !canEdit) return;
    try {
      const existingData = (turnus.deploy?.olak as any[]) || [];
      const deploymentMap = new Map<string, any>();

      existingData.forEach(item => {
        if (item.olId) deploymentMap.set(item.olId, item);
      });

      allOlak.forEach(ol => {
        const newVal = olSzamlalok[ol.id];
        const numVal = Number(newVal);

        if (newVal !== undefined && numVal > 0) {
          deploymentMap.set(ol.id, {
            olId: ol.id,
            olNev: ol.nev,
            csirkeDb: numVal
          });
        }
        else if (newVal !== undefined && numVal === 0) {
          deploymentMap.delete(ol.id);
        }
      });

      const finalOlakList = Array.from(deploymentMap.values());

      await saveDeploy(turnus.id, {
        csoportId: csoportId || null,
        betelepitesDatum: datum || null,
        osszesCsirke: currentTotal > 0 ? currentTotal : null,
        olak: finalOlakList
      });

      setTurnus(prev => prev ? ({ ...prev, deploy: { ...prev.deploy, olak: finalOlakList } }) : null);

      toast({ title: t("common.saved"), description: t("deploy.alert.saved_db") });
    } catch (e) {
      console.error(e);
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  // --- RENDER ---

  if (loading) return (
    <div className="p-10 flex justify-center text-muted-foreground">
      <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mr-2"></div>
      {t("common.loading")}
    </div>
  );

  if (!turnus) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-in fade-in duration-500">
        <Card className="border-dashed border-2 shadow-none bg-muted/10 mb-8">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 bg-white rounded-full mb-4 shadow-sm">
              <PlusCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-foreground">{t("deploy.no_active_title")}</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {t("deploy.no_active_desc")}
            </p>
            {canManage ? (
              <Button onClick={openNewTurnusDialog} size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20">
                {t("deploy.start_new_btn")} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Badge variant="secondary">{t("deploy.wait_admin")}</Badge>
            )}
          </CardContent>
        </Card>

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <History className="h-4 w-4" /> {t("deploy.history")}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pastTurnusok.map(pt => (
              <div key={pt.id} className="flex flex-col bg-card border rounded-xl p-4 hover:border-primary/50 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-lg group-hover:text-primary transition-colors">{pt.turnusId}</span>
                  <Badge variant="outline" className="bg-muted">{t("deploy.closed_badge")}</Badge>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
                  <Calendar className="h-3 w-3" /> {pt.deploy?.betelepitesDatum || "-"}
                </div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-3 w-3" /> {pt.deploy?.osszesCsirke?.toLocaleString() ?? 0} db
                </div>
              </div>
            ))}
          </div>
        </div>

        <Dialog open={isNewTurnusOpen} onOpenChange={setIsNewTurnusOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("deploy.alert.prompt_new")}</DialogTitle>
              <DialogDescription>
                Kérlek, add meg az új turnus azonosítóját (pl. turnus-2024-tavasz).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label>Turnus ID</Label>
              <Input
                value={newTurnusIdInput}
                onChange={(e) => setNewTurnusIdInput(e.target.value)}
                placeholder="turnus-..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewTurnusOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleCreateTurnus} className="bg-emerald-600 hover:bg-emerald-700">
                {t("common.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- ACTIVE TURNUS UI ---
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-24">

      {/* FEJLÉC */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-100">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-extrabold text-emerald-950 tracking-tight">{turnus.turnusId}</h1>
            <Badge className="bg-emerald-600 hover:bg-emerald-700 shadow-sm">{t("deploy.active_badge")}</Badge>
          </div>
          <p className="text-emerald-700/80 font-medium">{t("deploy.subtitle")}</p>
        </div>
        {canManage && (
          <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300" onClick={() => setClosing(true)}>
            <Cog className="mr-2 h-4 w-4" /> {t("deploy.close_turnus")}
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">

        {/* BAL OSZLOP - WIZARD */}
        <Card className="lg:col-span-2 shadow-lg border-muted overflow-hidden flex flex-col bg-white">
          {/* Progress Steps */}
          <div className="grid grid-cols-3 text-center text-sm font-medium border-b bg-muted/30">
            {[1, 2, 3].map(s => {
              let label = "";
              if (s === 1) label = t("deploy.step1");
              if (s === 2) label = t("deploy.step2");
              if (s === 3) label = t("deploy.step3");
              return (
                <div
                  key={s}
                  className={cn(
                    "py-3 relative transition-colors cursor-pointer",
                    step === s ? "text-primary font-bold bg-background" : "text-muted-foreground hover:bg-muted/50",
                    step > s && "text-emerald-600 bg-emerald-50/30"
                  )}
                  onClick={() => step > s && setStep(s)}
                >
                  {step > s ? <Check className="inline-block w-4 h-4 mr-1" /> : `${s}. `} {label}
                  {step === s && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-in slide-in-from-left duration-300" />}
                </div>
              );
            })}
          </div>

          <CardContent className="p-6 md:p-8 min-h-[450px] relative">

            {/* LÉPÉS 1: ALAPADATOK */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>{t("deploy.group_label")}</Label>
                    <Select value={csoportId} onValueChange={setCsoportId} disabled={!canEdit}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="..." /></SelectTrigger>
                      <SelectContent>
                        {csoportok.map(c => <SelectItem key={c.id} value={c.id}>{c.nev}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("deploy.date_label")}</Label>
                    <Input
                      type="date"
                      className="h-12 text-base"
                      value={datum}
                      onChange={e => setDatum(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label className="flex justify-between">
                    <span>{t("deploy.planned_label")}</span>
                    <span className="text-muted-foreground font-normal text-xs">{t("deploy.planned_desc")}</span>
                  </Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="number"
                      className="pl-10 h-12 text-lg font-semibold"
                      placeholder="pl. 25000"
                      value={plannedTotal}
                      onChange={e => setPlannedTotal(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="pt-8 flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!csoportId || !datum} size="lg" className="gap-2 px-8">
                    {t("common.next")} <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* LÉPÉS 2: ELOSZTÁS */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted/20 p-4 rounded-lg border">
                  <div>
                    <h3 className="font-semibold text-foreground">{t("deploy.distribute_title")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {filteredOlak.length > 0
                        ? t("deploy.barn_count_info", { count: filteredOlak.length })
                        : "Nincs ól ebben a csoportban."}
                    </p>
                  </div>
                  {canEdit && plannedNum > 0 && filteredOlak.length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleAutoDistribute}
                      className="gap-2 bg-white shadow-sm hover:bg-gray-50 border"
                    >
                      <RefreshCw className="h-4 w-4 text-primary" /> {t("deploy.auto_dist_btn")}
                    </Button>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                  {filteredOlak.map((ol) => (
                    <div key={ol.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {ol.nev.replace(/[^0-9]/g, '') || "?"}
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground mb-1 block">{ol.nev}</Label>
                        <Input
                          type="number"
                          className="h-9 font-mono font-medium"
                          placeholder="0"
                          value={olSzamlalok[ol.id] ?? ""}
                          onChange={(e) => setOlSzamlalok(prev => ({ ...prev, [ol.id]: e.target.value }))}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-6 flex justify-between border-t mt-2">
                  <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> {t("common.back")}
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={currentTotal === 0} className="gap-2">
                    {t("deploy.check_btn")} <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* LÉPÉS 3: ELLENŐRZÉS */}
            {step === 3 && (
              <div className="space-y-8 animate-in zoom-in-95 duration-300">
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold">{t("deploy.final_check_title")}</h3>
                  <p className="text-muted-foreground">{t("deploy.final_check_desc")}</p>
                </div>

                {/* TÁBLÁZATOS ÖSSZEGZÉS */}
                <Card>
                  <CardHeader className="pb-2 bg-muted/20">
                    <CardTitle className="text-sm uppercase text-muted-foreground font-bold flex items-center gap-2">
                      <ArrowDownToLine className="w-4 h-4" /> Részletes lista (Teljes telep)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-white sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-1/2">Ól</TableHead>
                          <TableHead className="text-right">Darabszám</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allOlak.map((ol) => {
                          const val = Number(olSzamlalok[ol.id]) || 0;
                          if (val === 0) return null; // Csak azokat mutatjuk, ahol van szám
                          return (
                            <TableRow key={ol.id}>
                              <TableCell className="font-medium flex items-center gap-2">
                                <Warehouse className="w-4 h-4 text-muted-foreground" /> {ol.nev}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-slate-700">
                                {val.toLocaleString()} db
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                  <div className="p-4 border-t bg-muted/10 flex justify-between items-center">
                    <span className="font-bold text-muted-foreground uppercase text-xs">Összesen</span>
                    <span className="font-bold text-xl text-primary">{currentTotal.toLocaleString()} db</span>
                  </div>
                </Card>

                <div className="space-y-2">
                  <Label>{t("deploy.note_label")}</Label>
                  <Textarea
                    placeholder={t("deploy.note_placeholder")}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="resize-none"
                  />
                </div>

                <div className="pt-2 flex justify_between items-center">
                  <Button variant="ghost" onClick={() => setStep(2)}>{t("deploy.modify_btn")}</Button>
                  <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 h-12 px-8 shadow-lg gap-2">
                    <Save className="h-5 w-5" /> {t("deploy.finalize_btn")}
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {/* JOBB OSZLOP - ÖSSZEGZŐ */}
        <div className="space-y-6">

          <Card className={cn(
            "border-2 shadow-sm transition-colors duration-500",
            isMatch ? "border-emerald-500/50 bg-emerald-50/30" : "border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-foreground/80">
                <Calculator className="h-4 w-4" /> {t("deploy.card.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-foreground mb-1 tracking-tight">
                {currentTotal.toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t("deploy.card.unit")}</p>

              {/* RÉSZLETES LISTA (ALL OLAK) */}
              <div className="bg-white/50 rounded-lg p-2 mb-4 border shadow-inner max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  {allOlak.map((ol) => {
                    const val = Number(olSzamlalok[ol.id]) || 0;
                    if (val === 0) return null;
                    return (
                      <div
                        key={ol.id}
                        className="flex justify-between items-center text-sm p-2 hover:bg-white/80 rounded transition-colors border-b last:border-0 border-slate-100"
                      >
                        <span className="text-muted-foreground flex items-center gap-2 font-medium">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          {ol.nev}
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {val.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                  {currentTotal === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-2">
                      Még nincs adat.
                    </div>
                  )}
                </div>
              </div>

              {plannedNum > 0 && (
                <div className="space-y-3 pt-4 border-t border-foreground/10">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("deploy.card.planned")}:</span>
                    <span className="font-medium">{plannedNum.toLocaleString()}</span>
                  </div>

                  {difference !== 0 ? (
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-bold text-sm">
                        {t("deploy.card.diff")}: {difference > 0 ? "-" : "+"}{Math.abs(difference)} db
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-100/50 px-3 py-2 rounded-md border border-emerald-200">
                      <Check className="h-4 w-4" />
                      <span className="font-bold text-sm">{t("deploy.card.match")}</span>
                    </div>
                  )}
                  <Progress
                    value={Math.min((currentTotal / plannedNum) * 100, 100)}
                    className={cn("h-2", isMatch ? "bg-emerald-200 [&>div]:bg-emerald-500" : "")}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-yellow-50/50 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase text-yellow-700 flex items-center gap-2">
                <FileText className="h-3 w-3" /> {t("deploy.tip.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-yellow-800/80">
              {t("deploy.tip.text")}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* LEZÁRÁS MODAL */}
      <AlertDialog open={canManage && closing} onOpenChange={(v) => canManage && setClosing(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deploy.dialog.close_title")}</AlertDialogTitle>
            <AlertDialogDescription
              dangerouslySetInnerHTML={{ __html: t("deploy.dialog.close_desc", { id: turnus.turnusId }) }}
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await closeTurnus(turnus.id);
                  setClosing(false);
                  toast({ title: t("common.success") });
                  await loadData();
                } catch (e) {
                  toast({ title: t("common.error"), variant: "destructive" });
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("deploy.dialog.confirm_close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
