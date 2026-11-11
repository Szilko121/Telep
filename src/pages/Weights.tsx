import { useEffect, useState, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { format, differenceInCalendarDays, addDays, isValid, parseISO } from "date-fns";
import { 
  Scale, Calculator, History, ChevronDown, ChevronUp, 
  Archive, TrendingUp, TrendingDown, Minus, 
  Activity, CalendarClock, Settings, ArrowRight, Plus, Target, Database, Calendar as CalendarIcon, 
  Upload, FileText, CheckCircle2, AlertCircle, BarChart3,
  Wheat, CloudSun, Download, FileSpreadsheet, Printer, Skull, TrendingUp as TrendingIcon, LayoutGrid, AlertTriangle, ArrowUpRight, Signal,
  Pencil, Trash2, Save 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

// Exportáláshoz
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Firebase & Services
import { waitForAuth } from "@/lib/firebase"; // db már nem kell innen közvetlenül
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- ÚJ IMPORT
import { getDocs, query, where, orderBy, setDoc, serverTimestamp, getDoc, doc } from "firebase/firestore"; // collection törölve, doc megtartva típusnak ha kell, de függvényként farmDoc lesz
import { getActiveTurnus, type TurnusDoc } from "@/services/turnus";
import { addWeightMeasurement, getWeightsByBatch, deleteWeightMeasurement, updateWeightMeasurement, type WeightMeasurement } from "@/services/weightService";
import { getRossTarget, predictWeightAtTime } from "@/lib/weightPrediction";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type Barn = { id: string; nev: string };

// ==================================================================================
// --- ROSS 308 ADATBÁZIS (2024 - As Hatched / Vegyes Ivar) ---
// ==================================================================================
// Ross targets and hourly interpolation live in src/lib/weightPrediction.ts.

function toId(input: string): string {
  return input ? input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
}

// ==================================================================================
// --- SEGÉD KOMPONENSEK ---
// ==================================================================================

function SmartDateInput({ value, onChange, className }: { value: string; onChange: (val: string) => void; className?: string }) {
  const [inputValue, setInputValue] = useState(value);
  useEffect(() => { setInputValue(value); }, [value]);
  const handleBlur = () => {
    let cleanVal = inputValue.replace(/[.\s]/g, "-");
    if (cleanVal.endsWith("-")) cleanVal = cleanVal.slice(0, -1);
    const dateObj = new Date(cleanVal);
    if (!isNaN(dateObj.getTime()) && cleanVal.length >= 8) {
      const formatted = format(dateObj, "yyyy-MM-dd");
      setInputValue(formatted); onChange(formatted);
    } else { if (value) setInputValue(value); }
  };
  return (
    <div className={cn("relative flex items-center group", className)}>
      <Input 
        type="text" 
        placeholder="ÉÉÉÉ.HH.NN" 
        value={inputValue} 
        onChange={(e) => setInputValue(e.target.value)} 
        onBlur={handleBlur} 
        className="pr-10 font-mono text-sm bg-white border-slate-200 group-hover:border-slate-300 focus:border-primary transition-colors shadow-sm" 
      />
      <div className="absolute right-0 top-0 h-full w-10 flex items-center justify-center">
        <CalendarIcon className="h-4 w-4 text-slate-400 pointer-events-none absolute z-10 group-hover:text-primary transition-colors" />
        <input type="date" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" value={isValid(new Date(value)) ? value : ""} onChange={(e) => { setInputValue(e.target.value); onChange(e.target.value); }} tabIndex={-1} />
      </div>
    </div>
  );
}

function WeightTable({ 
    data, 
    emptyMessage, 
    onDelete, 
    onEdit, 
    canEdit 
}: { 
    data: any[], 
    emptyMessage: string,
    onDelete: (id: string) => void,
    onEdit: (item: any) => void,
    canEdit: boolean
}) {
  const findPrev = (idx: number, barnId: string) => {
    for (let i = idx + 1; i < data.length; i++) {
      if (data[i].barnId === barnId) return data[i];
    }
    return null;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[120px] font-semibold text-slate-900">Dátum</TableHead>
            <TableHead className="font-semibold text-slate-900">Ól</TableHead>
            <TableHead className="text-center font-semibold text-slate-900">Kor</TableHead>
            <TableHead className="text-right font-semibold text-slate-900">Súly</TableHead>
            <TableHead className="text-center font-semibold text-slate-900">Ross %</TableHead>
            <TableHead className="text-right font-semibold text-slate-900">FCR</TableHead>
            <TableHead className="text-center font-semibold text-slate-900 w-[100px]">Klíma</TableHead>
            {canEdit && <TableHead className="text-right font-semibold text-slate-900 w-[100px]">Műv.</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow><TableCell colSpan={canEdit ? 8 : 7} className="text-center h-32 text-muted-foreground flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-slate-50 rounded-full"><History className="h-6 w-6 text-slate-300"/></div>
                <span>{emptyMessage}</span>
            </TableCell></TableRow>
          ) : (
            data.map((item, idx) => {
              const std = getRossTarget(item.ageInDays);
              const diff = item.averageWeight - std;
              const diffPercent = (diff / std) * 100;
              
              const prev = findPrev(idx, item.barnId);
              let dailyGain = null;
              if (prev) {
                const wDiff = item.averageWeight - prev.averageWeight;
                const dDiff = item.ageInDays - prev.ageInDays;
                if (dDiff > 0) dailyGain = (wDiff / dDiff) * 1000;
              }

              return (
                <TableRow key={item.id || idx} className="hover:bg-slate-50/80 transition-colors group">
                  <TableCell className="font-mono text-sm text-slate-600">{item.date}{item.measuredTime ? ` ${item.measuredTime}` : ""}</TableCell>
                  <TableCell><Badge variant="secondary" className="bg-slate-100 text-slate-700 font-medium border-slate-200">{item.barnName}</Badge></TableCell>
                  <TableCell className="text-center"><span className="text-sm font-medium text-slate-700">{item.ageInDays} nap</span></TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-slate-900 tabular-nums text-base">{item.averageWeight.toFixed(3)} <span className="text-xs font-normal text-slate-400">kg</span></span>
                      {dailyGain !== null && (
                          <div className={cn("text-[10px] flex items-center gap-1 font-medium", dailyGain > 0 ? "text-emerald-600" : "text-rose-600")}>
                              {dailyGain > 0 ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
                              {dailyGain.toFixed(0)} g/nap
                          </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={cn("font-bold border px-2 py-0.5", diff >= 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200")}>
                      {diff > 0 ? "+" : ""}{diffPercent.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.fcr ? (
                       <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-mono">{item.fcr.toFixed(3)}</Badge>
                    ) : <span className="text-slate-300">-</span>}
                  </TableCell>
                  <TableCell className="text-center">
                      {item.weather ? (
                          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 bg-blue-50/50 py-1 px-2 rounded-full border border-blue-100/50" title="Hőmérséklet méréskor">
                              <CloudSun className="w-3.5 h-3.5 text-blue-500" />
                              {Math.round(item.weather.temp)}°C
                          </div>
                      ) : <span className="text-slate-300">-</span>}
                  </TableCell>
                  
                  {/* SZERKESZTÉS ÉS TÖRLÉS GOMBOK */}
                  {canEdit && (
                      <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-blue-600 hover:bg-blue-50" onClick={() => onEdit(item)}>
                                  <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(item.id)}>
                                  <Trash2 className="w-4 h-4" />
                              </Button>
                          </div>
                      </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ==================================================================================
// --- ARCHÍV TURNUS DIALOG ---
// ==================================================================================
function CreatePastTurnusDialog({
    open, onClose, onSuccess
}: { open: boolean; onClose: () => void; onSuccess: () => void; }) {
    const [name, setName] = useState("");
    const [date, setDate] = useState("");
    const [count, setCount] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if(!name || !date) {
            toast({title: "Hiba", description: "Név és dátum kötelező!", variant: "destructive"});
            return;
        }
        const fixedId = toId(name);
        setLoading(true);
        try {
            // JAVÍTVA: farmDoc használata
            const ref = farmDoc("turnusok", fixedId);
            const exists = await getDoc(ref);
            if(exists.exists()) {
                toast({title: "Hiba", description: "Ez a turnus ID már létezik.", variant: "destructive"});
                setLoading(false);
                return;
            }
            await setDoc(ref, {
                id: fixedId, turnusId: name, active: false, createdAt: serverTimestamp(),
                deploy: { betelepitesDatum: date, osszesCsirke: Number(count) || 0, csoportId: null, olak: [] }
            });
            toast({title: "Siker", description: "Régi turnus létrehozva."});
            onSuccess(); onClose(); setName(""); setDate(""); setCount("");
        } catch(e: any) { toast({title: "Hiba", description: e.message, variant: "destructive"}); } 
        finally { setLoading(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Archive className="w-5 h-5 text-slate-500"/> Archív Turnus Létrehozása</DialogTitle>
                    <DialogDescription>Múltbeli adatok rögzítéséhez hozz létre egy lezárt turnust.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Turnus Azonosító</Label>
                        <Input placeholder="pl. turnus-2023-osz" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Kezdés Dátuma</Label>
                        <SmartDateInput value={date} onChange={(val) => setDate(val)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Induló létszám</Label>
                        <Input type="number" placeholder="pl. 25000" value={count} onChange={e => setCount(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Mégse</Button>
                    <Button onClick={handleCreate} disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "..." : "Létrehozás"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==================================================================================
// --- IMPORT VARÁZSLÓ ---
// ==================================================================================
interface CSVRow { turnus_id: string; sex: string; week1: string; week2: string; week3: string; week4: string; week5: string; }

function HistoricalImportDialog({ 
  open, onClose, pastTurnuses, barns, onSuccess 
}: { 
  open: boolean; onClose: () => void; pastTurnuses: TurnusDoc[]; barns: Barn[]; onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"wizard" | "csv">("wizard");
  const [step, setStep] = useState<'setup' | 'input' | 'interim'>('setup');
  const [selectedTurnusId, setSelectedTurnusId] = useState<string>("");
  const [selectedBarns, setSelectedBarns] = useState<string[]>([]);
  const [currentAge, setCurrentAge] = useState<number>(0);
  const [isExtraMeasurement, setIsExtraMeasurement] = useState(false);
  const [customDate, setCustomDate] = useState<string>("");
  const [inputData, setInputData] = useState<Record<string, { count: string, weight: string }>>({});
  const countRefs = useRef<(HTMLInputElement | null)[]>([]);
  const weightRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
  const [csvMapping, setCsvMapping] = useState<{ F: string; A: string }>({ F: "", A: "" });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLog, setImportLog] = useState<string[]>([]);

  const handleStartWizard = () => {
    if (!selectedTurnusId || selectedBarns.length === 0) {
      toast({ title: "Hiba", description: "Válassz turnust és legalább egy ólat!", variant: "destructive" });
      return;
    }
    setStep('input'); setCurrentAge(0); setInputData({}); setIsExtraMeasurement(false);
  };

  const getTurnusStartDate = () => {
    const t = pastTurnuses.find(p => p.id === selectedTurnusId);
    return t?.deploy?.betelepitesDatum || format(new Date(), "yyyy-MM-dd");
  };

  const getCurrentDate = () => {
    if (isExtraMeasurement && customDate) return customDate;
    const start = new Date(getTurnusStartDate());
    return format(addDays(start, currentAge), "yyyy-MM-dd");
  };

  const handleKeyDown = (e: React.KeyboardEvent, barnIndex: number, field: 'count' | 'weight') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'count') { weightRefs.current[barnIndex]?.focus(); } 
      else {
        const nextIndex = barnIndex + 1;
        if (nextIndex < selectedBarns.length) { countRefs.current[nextIndex]?.focus(); } 
        else { handleSubmitStep(); }
      }
    }
  };

  const updateInput = (barnId: string, field: 'count' | 'weight', value: string) => {
    setInputData(prev => ({ ...prev, [barnId]: { ...prev[barnId], [field]: value } }));
  };

  const handleSubmitStep = async () => {
    const dateISO = getCurrentDate();
    const promises = selectedBarns.map(async (barnId) => {
      const data = inputData[barnId];
      if (!data || !data.count || !data.weight) return;
      const count = parseFloat(data.count);
      const totalWeight = parseFloat(data.weight);
      const avgWeight = totalWeight / count;
      const barnName = barns.find(b => b.id === barnId)?.nev || "Ismeretlen";
      await addWeightMeasurement({
        batchId: selectedTurnusId, barnId: barnId, barnName: barnName, date: dateISO,
        ageInDays: isExtraMeasurement ? differenceInCalendarDays(new Date(dateISO), new Date(getTurnusStartDate())) : currentAge,
        headCount: count, totalWeight: totalWeight, averageWeight: avgWeight, note: "Utólagos import"
      });
    });
    await Promise.all(promises);
    toast({ title: "Mentve", description: `${currentAge}. nap rögzítve.` });
    setInputData({}); setStep('interim');
  };

  useEffect(() => { if (step === 'interim') setTimeout(() => nextButtonRef.current?.focus(), 100); }, [step]);

  const handleInterimDecision = (hasExtra: boolean) => {
    if (hasExtra) {
      setIsExtraMeasurement(true); setCustomDate(format(addDays(new Date(getTurnusStartDate()), currentAge + 1), "yyyy-MM-dd")); setStep('input');
    } else {
      const nextAge = currentAge + 7;
      if (nextAge > 42) { onSuccess(); onClose(); } else { setIsExtraMeasurement(false); setCurrentAge(nextAge); setStep('input'); }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { setCsvFile(e.target.files[0]); parseCSV(e.target.files[0]); }
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const rows: CSVRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length >= 2) rows.push({ turnus_id: cols[0].trim(), sex: cols[1].trim(), week1: cols[2]?.trim(), week2: cols[3]?.trim(), week4: cols[4]?.trim(), week4: cols[5]?.trim(), week5: cols[6]?.trim() });
      }
      setParsedRows(rows);
    };
    reader.readAsText(file);
  };

  const processCSVImport = async () => {
    if (!csvMapping.F || !csvMapping.A) { toast({ title: "Hiba", variant: "destructive" }); return; }
    setImporting(true); setImportLog([]); setImportProgress(0);
    let processed = 0;
    const log = (msg: string) => setImportLog(prev => [...prev, msg]);

    try {
      const turnusGroups: Record<string, CSVRow[]> = {};
      parsedRows.forEach(row => { if(!turnusGroups[row.turnus_id]) turnusGroups[row.turnus_id] = []; turnusGroups[row.turnus_id].push(row); });

      for (const turnusId of Object.keys(turnusGroups)) {
        // JAVÍTVA: farmDoc használata
        const turnusRef = farmDoc("turnusok", turnusId);
        const turnusSnap = await getDoc(turnusRef);
        let startDateStr = "";
        if (!turnusSnap.exists()) {
          const extractedDate = turnusId.replace("turnus-", "");
          if (isValid(new Date(extractedDate))) {
            startDateStr = extractedDate;
            await setDoc(turnusRef, { id: turnusId, turnusId: turnusId, active: false, createdAt: serverTimestamp(), deploy: { betelepitesDatum: startDateStr, osszesCsirke: 0, csoportId: null, olak: [] } });
            log(`[ÚJ] Turnus létrehozva: ${turnusId}`);
          } else { log(`[SKIP] Érvénytelen ID: ${turnusId}`); continue; }
        } else { 
            const tData = turnusSnap.data() as TurnusDoc; 
            startDateStr = tData.deploy?.betelepitesDatum || ""; 
        }
        if (!startDateStr) continue;
        const startDate = new Date(startDateStr);

        for (const row of turnusGroups[turnusId]) {
          const barnId = row.sex === 'F' ? csvMapping.F : csvMapping.A;
          const barnName = barns.find(b => b.id === barnId)?.nev || "Ismeretlen";
          const weeks = [ { w: 1, val: row.week1 }, { w: 2, val: row.week2 }, { w: 3, val: row.week3 }, { w: 4, val: row.week4 }, { w: 5, val: row.week5 } ];
          for (const weekData of weeks) {
             if (weekData.val && !isNaN(parseFloat(weekData.val))) {
                const avgWeight = parseFloat(weekData.val);
                const ageDays = weekData.w * 7;
                const measureDate = format(addDays(startDate, ageDays), "yyyy-MM-dd");
                await addWeightMeasurement({ batchId: turnusId, barnId: barnId, barnName: barnName, date: measureDate, ageInDays: ageDays, headCount: 100, totalWeight: avgWeight * 100, averageWeight: avgWeight, note: "CSV Import" });
             }
          }
          processed++; setImportProgress(Math.round((processed / parsedRows.length) * 100));
        }
      }
      log("KÉSZ!"); toast({ title: "Kész", description: "Adatok importálva." });
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (e: any) { log(`HIBA: ${e.message}`); } finally { setImporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b">
            <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-primary"/> Adat Importálás</DialogTitle>
            <DialogDescription>Múltbeli adatok tömeges betöltése varázslóval vagy CSV-ből.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full flex-1 overflow-hidden flex flex-col">
           <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="wizard">Manuális Varázsló</TabsTrigger><TabsTrigger value="csv">CSV Feltöltés</TabsTrigger></TabsList>
           </div>
           <TabsContent value="wizard" className="flex-1 overflow-y-auto p-6 mt-0">
             {step === 'setup' && (
                <div className="grid gap-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Turnus Kiválasztása</Label><Select onValueChange={setSelectedTurnusId}><SelectTrigger><SelectValue placeholder="Válassz..." /></SelectTrigger><SelectContent>{pastTurnuses.map(t => (<SelectItem key={t.id} value={t.id}>{t.turnusId}</SelectItem>))}</SelectContent></Select></div>
                    </div>
                    <div className="space-y-3"><Label>Ólak Kijelölése</Label><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{barns.map(barn => (<div key={barn.id} className={cn("flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors", selectedBarns.includes(barn.id) ? "bg-primary/5 border-primary" : "hover:bg-slate-50")} onClick={() => { if(selectedBarns.includes(barn.id)) setSelectedBarns(selectedBarns.filter(id => id !== barn.id)); else setSelectedBarns([...selectedBarns, barn.id]); }}><Checkbox checked={selectedBarns.includes(barn.id)} /><label className="text-sm font-medium cursor-pointer">{barn.nev}</label></div>))}</div></div>
                    <Button onClick={handleStartWizard} className="w-full mt-4" size="lg">Varázsló Indítása</Button>
                </div>
            )}
            {step === 'input' && (
                <div className="grid gap-4">
                    <div className="flex justify-between items-center bg-primary/5 p-4 rounded-xl border border-primary/20">
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-primary uppercase tracking-wide">Mérési Időpont</span>
                            <span className="font-bold text-2xl text-slate-800">{isExtraMeasurement ? 'Egyedi Dátum' : `${currentAge}. nap`}</span>
                        </div>
                        {isExtraMeasurement ? <SmartDateInput value={customDate} onChange={setCustomDate} className="w-[160px]" /> : <Badge variant="outline" className="text-lg py-1 px-3 bg-white font-mono">{getCurrentDate()}</Badge>}
                    </div>
                    <div className="space-y-3 pr-2">
                        {selectedBarns.map((barnId, idx) => {
                            const barn = barns.find(b => b.id === barnId);
                            return (
                            <div key={barnId} className="grid grid-cols-12 gap-4 items-center p-3 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
                                <div className="col-span-3 font-semibold text-slate-700 flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-slate-400"/> {barn?.nev}</div>
                                <div className="col-span-4 relative"><Input placeholder="0" type="number" className="pl-8" autoFocus={idx === 0} ref={el => countRefs.current[idx] = el} onKeyDown={(e) => handleKeyDown(e, idx, 'count')} value={inputData[barnId]?.count || ''} onChange={e => updateInput(barnId, 'count', e.target.value)} /><span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">DB</span></div>
                                <div className="col-span-5 relative"><Input placeholder="0.00" type="number" className="pl-8" ref={el => weightRefs.current[idx] = el} onKeyDown={(e) => handleKeyDown(e, idx, 'weight')} value={inputData[barnId]?.weight || ''} onChange={e => updateInput(barnId, 'weight', e.target.value)} /><span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">KG</span></div>
                            </div>
                            )
                        })}
                    </div>
                    <Button onClick={handleSubmitStep} size="lg" className="w-full mt-2">Adatok Mentése & Tovább</Button>
                </div>
            )}
            {step === 'interim' && (
                 <div className="py-12 space-y-6 text-center flex flex-col items-center justify-center h-full">
                   <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2 animate-in zoom-in"><CheckCircle2 className="h-8 w-8 text-emerald-600"/></div>
                   <h3 className="text-2xl font-bold text-slate-800">Sikeres rögzítés!</h3>
                   <div className="grid gap-3 w-full max-w-sm">
                       <Button ref={nextButtonRef} onClick={() => handleInterimDecision(false)} size="lg" className="w-full">Következő hét ({currentAge + 7}. nap) <ArrowRight className="ml-2 w-4 h-4"/></Button>
                       <Button onClick={() => handleInterimDecision(true)} variant="outline" className="w-full">Másik dátum megadása</Button>
                       <Button onClick={onClose} variant="ghost" className="text-slate-500 hover:text-slate-700">Befejezés és Kilépés</Button>
                   </div>
                 </div>
            )}
           </TabsContent>
           <TabsContent value="csv" className="flex-1 overflow-y-auto p-6 space-y-4 mt-0">
             {!importing && (
                 <div className="space-y-6">
                     <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                         <FileText className="h-10 w-10 text-slate-300 mb-3"/>
                         <Label htmlFor="file-upload" className="cursor-pointer text-primary font-medium hover:underline">Kattints ide a CSV feltöltéséhez</Label>
                         <Input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                         {csvFile && <div className="mt-2 text-sm font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {csvFile.name}</div>}
                     </div>
                     {parsedRows.length > 0 && (
                         <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                             <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-2"><Label>F (Tojó) Ól</Label><Select onValueChange={(v) => setCsvMapping(prev => ({...prev, F: v}))}><SelectTrigger><SelectValue placeholder="Válassz..." /></SelectTrigger><SelectContent>{barns.map(b => <SelectItem key={b.id} value={b.id}>{b.nev}</SelectItem>)}</SelectContent></Select></div>
                                 <div className="space-y-2"><Label>A (Kakas) Ól</Label><Select onValueChange={(v) => setCsvMapping(prev => ({...prev, A: v}))}><SelectTrigger><SelectValue placeholder="Válassz..." /></SelectTrigger><SelectContent>{barns.map(b => <SelectItem key={b.id} value={b.id}>{b.nev}</SelectItem>)}</SelectContent></Select></div>
                             </div>
                             <Button onClick={processCSVImport} className="w-full" size="lg">Importálás Indítása ({parsedRows.length} sor)</Button>
                         </div>
                     )}
                 </div>
             )}
             {importing && (
                 <div className="text-center py-10 space-y-6">
                     <Progress value={importProgress} className="h-2 w-full" />
                     <p className="text-sm text-slate-500 font-medium">Feldolgozás... {importProgress}%</p>
                     <div className="h-48 overflow-y-auto bg-slate-900 rounded-lg p-4 text-xs font-mono text-emerald-400 text-left shadow-inner">
                         {importLog.map((l, i) => <div key={i} className="border-b border-white/10 pb-1 mb-1 last:border-0">{l}</div>)}
                     </div>
                 </div>
             )}
           </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ==================================================================================
// --- FŐ OLDAL (WEIGHTS) ---
// ==================================================================================
export default function Weights() {
  const { user } = useAuth();
  // Csak admin vagy főnök szerkeszthet/törölhet
  const canEdit = user?.role === "admin" || user?.role === "főnök";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [turnus, setTurnus] = useState<TurnusDoc | null>(null);
  const [barns, setBarns] = useState<Barn[]>([]);
  const [history, setHistory] = useState<any[]>([]); // WeightMeasurement + extra fields

  const [pastTurnuses, setPastTurnuses] = useState<TurnusDoc[]>([]);
  const [expandedTurnusId, setExpandedTurnusId] = useState<string | null>(null);
  const [pastWeightsCache, setPastWeightsCache] = useState<Record<string, WeightMeasurement[]>>({});
  const [loadingPastWeights, setLoadingPastWeights] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCreatePastOpen, setIsCreatePastOpen] = useState(false);

  // Form state
  const [selectedBarnId, setSelectedBarnId] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [headCount, setHeadCount] = useState<string>(""); 
  const [totalWeight, setTotalWeight] = useState<string>("");
  const [measuredTime, setMeasuredTime] = useState<string>("");
  const [forecastAgeInput, setForecastAgeInput] = useState<string>("");
  const [forecastTimeInput, setForecastTimeInput] = useState<string>("11:00");
  const [consumedFeed, setConsumedFeed] = useState<string>(""); 

  // --- SZERKESZTÉS STATE ---
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WeightMeasurement | null>(null);
  const [editForm, setEditForm] = useState({
      date: "",
       measuredTime: "",
       barnId: "",
      headCount: "",
      totalWeight: "",
      ageInDays: "" // <--- ÚJ: Kézzel szerkeszthető életkor
  });

  // Időjárás state
  const [currentWeather, setCurrentWeather] = useState<{temp: number, humidity: number} | null>(null);

  // Számított
  const [calculatedAvg, setCalculatedAvg] = useState<number>(0);
  const [calculatedFCR, setCalculatedFCR] = useState<number>(0); // FCR
  const [calculatedAge, setCalculatedAge] = useState<number>(0);
  const [previousWeightForBarn, setPreviousWeightForBarn] = useState<number | null>(null);
  const [todayAge, setTodayAge] = useState<number>(0);
  
  // Ól statisztika a pontos FCR-hez
  const [barnStats, setBarnStats] = useState<{initial: number, mortality: number, current: number}>({ initial: 0, mortality: 0, current: 0 });
  
  // --- ÚJ: ÓL-SPECIFIKUS STATISZTIKÁK ---
  const [barnPredictions, setBarnPredictions] = useState<Record<string, { 
      latest: number, // Legutóbbi mért súly
      diff: number,   // Eltérés a Ross sztenderdtől %-ban
      projected: number, // Várható súly 1 hét múlva
      age: number // A mérés kora
  }>>({});

  // --- IDŐJÁRÁS LEKÉRÉSE ---
  useEffect(() => {
      async function fetchWeather() {
          try {
              const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=47.3527&longitude=17.5826&current=temperature_2m,relative_humidity_2m&timezone=auto");
              const data = await res.json();
              if (data.current) {
                  setCurrentWeather({ temp: data.current.temperature_2m, humidity: data.current.relative_humidity_2m });
              }
          } catch(e) { console.warn("Időjárás hiba", e); }
      }
      fetchWeather();
  }, []);

  // --- ADATBETÖLTÉS ---
  const loadData = async () => {
      try {
        await waitForAuth();
        const activeT = await getActiveTurnus();
        setTurnus(activeT);

        // JAVÍTVA: farmCollection használata
        const barnsSnap = await getDocs(farmCollection("olak"));
        const barnsList = barnsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Barn));
        
        // JAVÍTÁS: Ellenőrzés, hogy a 'nev' létezik-e rendezés előtt
        setBarns(barnsList.sort((a,b) => {
            const nevA = a.nev || "";
            const nevB = b.nev || "";
            return nevA.localeCompare(nevB, undefined, {numeric:true});
        }));

        if (activeT) {
           const historyData = await getWeightsByBatch(activeT.id);
           setHistory(historyData);
        }

        // JAVÍTVA: farmCollection használata
        const pastQuery = query(farmCollection("turnusok"), where("active", "==", false));
        const pastSnap = await getDocs(pastQuery);
        setPastTurnuses(pastSnap.docs.map(d => ({ id: d.id, ...d.data() } as TurnusDoc)));
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  // --- ÓLANKÉNTI KÁRTYA ADATOK SZÁMÍTÁSA ---
  useEffect(() => {
      if (!history.length || !barns.length) { setBarnPredictions({}); return; }

      const stats: Record<string, any> = {};

      barns.forEach(barn => {
          const lastMeasure = history.find(h => h.barnId === barn.id);
          if (lastMeasure) {
              const currentAge = lastMeasure.ageInDays;
              const currentWeight = lastMeasure.averageWeight;
              const currentStd = getRossTarget(currentAge);
              let diffPercent = 0;
              if (currentStd > 0) { diffPercent = ((currentWeight - currentStd) / currentStd) * 100; }
              const performanceRatio = currentStd > 0 ? currentWeight / currentStd : 1;
              const nextWeekStd = getRossTarget(currentAge + 7);
              const timed = lastMeasure.measuredTime
                  ? predictWeightAtTime(currentWeight, currentAge, lastMeasure.measuredTime, currentAge + 7, lastMeasure.measuredTime)
                  : NaN;
               const projected = Number.isFinite(timed) ? timed : nextWeekStd * performanceRatio;
               stats[barn.id] = { latest: currentWeight, diff: diffPercent, projected, age: currentAge, measuredTime: lastMeasure.measuredTime || "" };
          }
      });
      setBarnPredictions(stats);
  }, [history, barns]);

  // --- SZÁMÍTÁSOK (Formhoz) ---
  
  useEffect(() => {
    if (!turnus?.deploy?.betelepitesDatum) { setTodayAge(0); return; }
    const start = new Date(turnus.deploy.betelepitesDatum);
    const now = new Date();
    start.setHours(0,0,0,0); now.setHours(0,0,0,0);
    setTodayAge(Math.max(0, differenceInCalendarDays(now, start)));
  }, [turnus]);

  useEffect(() => {
    if (!turnus?.deploy?.betelepitesDatum || !date) { setCalculatedAge(0); return; }
    if (!isValid(new Date(date))) { setCalculatedAge(0); return; }
    const start = new Date(turnus.deploy.betelepitesDatum);
    const meas = new Date(date);
    setCalculatedAge(Math.max(0, differenceInCalendarDays(meas, start)));
  }, [date, turnus]);

  useEffect(() => {
      const fetchBarnStats = async () => {
          if(!selectedBarnId || !turnus || !date) {
              setBarnStats({ initial: 0, mortality: 0, current: 0 });
              return;
          }
          let initial = 0;
          if (turnus.deploy?.olak && Array.isArray(turnus.deploy.olak)) {
              const found = turnus.deploy.olak.find((o: any) => o.olId === selectedBarnId);
              if(found) initial = Number(found.csirkeDb) || 0;
          } else if (turnus.deploy?.olak && typeof turnus.deploy.olak === 'object') {
              const record = turnus.deploy.olak as Record<string, number>;
              initial = record[selectedBarnId] || 0;
          }
          let totalMortality = 0;
          try {
              // JAVÍTVA: farmCollection használata algyűjteményhez
              const daysRef = farmCollection(`turnusok/${turnus.id}/muszakBeosztasDays`);
              const q = query(daysRef, where("date", "<=", date)); 
              const snap = await getDocs(q);
              snap.docs.forEach(doc => {
                  const dData = doc.data();
                  if (dData.elhulas && dData.elhulas[selectedBarnId]) {
                      totalMortality += Number(dData.elhulas[selectedBarnId]) || 0;
                  }
              });
          } catch (e) { console.error("Elhullás lekérdezési hiba", e); }
          setBarnStats({ initial, mortality: totalMortality, current: Math.max(0, initial - totalMortality) });
      };
      fetchBarnStats();
  }, [selectedBarnId, date, turnus]);

  useEffect(() => {
    const count = parseFloat(headCount) || 0;
    const weight = parseFloat(totalWeight) || 0;
    const feed = parseFloat(consumedFeed) || 0;
    const avgWeight = count > 0 ? weight / count : 0;
    setCalculatedAvg(avgWeight);
    if (feed > 0 && barnStats.current > 0 && avgWeight > 0) {
        const totalLiveWeight = barnStats.current * avgWeight;
        setCalculatedFCR(feed / totalLiveWeight);
    } else {
        setCalculatedFCR(0);
    }
  }, [headCount, totalWeight, consumedFeed, barnStats]);

  useEffect(() => {
      if(!selectedBarnId || !history.length) { setPreviousWeightForBarn(null); return; }
      const curDate = new Date(date);
      const prev = history.find(h => h.barnId === selectedBarnId && new Date(h.date) < curDate);
      setPreviousWeightForBarn(prev ? prev.averageWeight : null);
  }, [selectedBarnId, date, history]);

  // --- EXPORT PDF ---
  const handleExportPDF = () => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Mérlegelési Napló", 14, 22);
      doc.setFontSize(11);
      doc.text(`Turnus: ${turnus?.turnusId || "-"}`, 14, 30);
      doc.text(`Generálva: ${new Date().toLocaleDateString()}`, 14, 36);

      const rows = history.map(h => [
          h.date, h.barnName, `${h.ageInDays} nap`, `${h.averageWeight.toFixed(3)} kg`,
          h.fcr ? h.fcr.toFixed(3) : "-", h.weather ? `${Math.round(h.weather.temp)} °C` : "-"
      ]);
      autoTable(doc, { head: [["Dátum", "Ól", "Kor", "Átlag", "FCR", "Időjárás"]], body: rows, startY: 42 });
      doc.save("merlegelesi_naplo.pdf");
  };

  const handleExportCSV = () => {
      const header = ["Dátum", "Idő", "Ól", "Kor (nap)", "Darab", "Összsúly (kg)", "Átlag (kg)", "FCR", "Hőmérséklet"];
      const rows = history.map(h => [h.date, h.measuredTime || "", h.barnName, h.ageInDays, h.headCount, h.totalWeight, h.averageWeight.toFixed(3), h.fcr || "", h.weather?.temp || ""]);
      const csvContent = [header.join(";"), ...rows.map(r => r.join(";"))].join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.setAttribute("download", "merlegeles.csv");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleSubmit = async () => {
    if (!turnus || !selectedBarnId || !headCount || !totalWeight) { toast({ title: "Hiányzó adatok", variant: "destructive" }); return; }
    setSubmitting(true);
    const barn = barns.find(b => b.id === selectedBarnId);
    const countVal = parseFloat(headCount);
    const weightVal = parseFloat(totalWeight);
    const avg = weightVal / countVal;
    const fcrVal = calculatedFCR > 0 ? calculatedFCR : undefined;
    try {
      await addWeightMeasurement({
        batchId: turnus.id, barnId: selectedBarnId, barnName: barn?.nev || "Ismeretlen",
        date: date, measuredTime: measuredTime || undefined, ageInDays: calculatedAge, headCount: countVal, totalWeight: weightVal,
        averageWeight: avg, fcr: fcrVal, weather: currentWeather
      } as any);
      toast({ title: "Siker", description: "Mérés rögzítve." });
      setHeadCount(""); setTotalWeight(""); setConsumedFeed(""); setMeasuredTime("");
      const updatedHistory = await getWeightsByBatch(turnus.id);
      setHistory(updatedHistory);
    } catch (error) { toast({ title: "Hiba", variant: "destructive" }); } 
    finally { setSubmitting(false); }
  };

  const togglePastTurnus = async (turnusId: string) => {
      if (expandedTurnusId === turnusId) { setExpandedTurnusId(null); return; }
      setExpandedTurnusId(turnusId);
      if (!pastWeightsCache[turnusId]) {
          setLoadingPastWeights(true);
          try {
              const weights = await getWeightsByBatch(turnusId);
              setPastWeightsCache(prev => ({ ...prev, [turnusId]: weights }));
          } catch (e) {} finally { setLoadingPastWeights(false); }
      }
  };

  // --- TÖRLÉS KEZELŐ ---
  const handleDeleteItem = async (id: string) => {
      if (!canEdit) return;
      if (!confirm("Biztosan törölni szeretnéd ezt a mérést?")) return;
      
      try {
          await deleteWeightMeasurement(id);
          toast({ title: "Törölve", description: "A mérés sikeresen törölve." });
          if(turnus) {
              const updated = await getWeightsByBatch(turnus.id);
              setHistory(updated);
          }
      } catch(e) {
          toast({ title: "Hiba", description: "Nem sikerült a törlés.", variant: "destructive" });
      }
  };

  // --- SZERKESZTÉS ELŐKÉSZÍTÉSE ---
  const handleEditItem = (item: WeightMeasurement) => {
      if (!canEdit) return;
      setEditingItem(item);
      setEditForm({
          date: item.date,
           measuredTime: item.measuredTime || "",
           barnId: item.barnId,
          headCount: item.headCount.toString(),
          totalWeight: item.totalWeight.toString(),
          ageInDays: item.ageInDays.toString() // Kezdőértéknek a jelenlegi kor
      });
      setEditDialogOpen(true);
  };

  // --- SZERKESZTÉS MENTÉSE ---
  const saveEditedItem = async () => {
      if (!editingItem || !turnus) return;
      
      const count = parseFloat(editForm.headCount);
      const weight = parseFloat(editForm.totalWeight);
      // Itt a felhasználó által beírt értéket használjuk, nem számolunk automatikusan
      const age = parseInt(editForm.ageInDays);

      if (!count || !weight || isNaN(age)) {
          toast({ title: "Hiba", description: "Érvénytelen számok.", variant: "destructive" });
          return;
      }

      const barnName = barns.find(b => b.id === editForm.barnId)?.nev || editingItem.barnName;

      try {
          await updateWeightMeasurement(editingItem.id!, {
              date: editForm.date,
              barnId: editForm.barnId,
              barnName: barnName,
              headCount: count,
              totalWeight: weight,
              averageWeight: weight / count,
               measuredTime: editForm.measuredTime || undefined,
               ageInDays: age // <--- A kézi értéket mentjük
          });
          toast({ title: "Mentve", description: "A mérés frissítve." });
          setEditDialogOpen(false);
          const updated = await getWeightsByBatch(turnus.id);
          setHistory(updated);
      } catch(e) {
          toast({ title: "Hiba", description: "Nem sikerült a mentés.", variant: "destructive" });
      }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 flex-col gap-3"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"/> Betöltés...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-10 font-sans text-slate-900 bg-slate-50/50 min-h-screen">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3 text-slate-900 tracking-tight">
             <span className="bg-primary/10 p-3 rounded-2xl text-primary"><Scale className="h-8 w-8" strokeWidth={2.5} /></span>
             Súlykontroll
          </h1>
          <p className="text-slate-500 mt-2 text-lg font-medium max-w-2xl leading-relaxed">
            Automatikus Ross 308 (2024) összehasonlítás és valós idejű FCR kalkuláció egy helyen.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" className="h-9 px-4 border-slate-300 text-slate-700 hover:bg-white hover:text-primary hover:border-primary transition-all shadow-sm" onClick={handleExportPDF}><Printer className="h-4 w-4 mr-2" /> PDF</Button>
            <Button variant="outline" size="sm" className="h-9 px-4 border-slate-300 text-slate-700 hover:bg-white hover:text-primary hover:border-primary transition-all shadow-sm" onClick={handleExportCSV}><FileSpreadsheet className="h-4 w-4 mr-2" /> CSV</Button>
            <Separator orientation="vertical" className="h-6 mx-1 bg-slate-300" />
            <Button variant="secondary" size="sm" className="h-9 bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors" onClick={() => setIsCreatePastOpen(true)}><Archive className="h-4 w-4 mr-2" /> Archív</Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 transition-all" onClick={() => setIsImportOpen(true)}><Upload className="h-4 w-4 mr-2" /> Importálás</Button>
        </div>
      </div>

      {/* --- IDŐPONTOS ELŐREJELZÉS --- */}
      <div className="flex items-end flex-wrap gap-3 rounded-lg bg-white p-4 border border-slate-200">
          <div>
              <Label htmlFor="forecast-day" className="text-xs">Előrejelzés napja (csirke kora)</Label>
              <Input id="forecast-day" type="number" min="0" step="1" placeholder={`Mai nap: ${todayAge}`}
                value={forecastAgeInput} onChange={e => setForecastAgeInput(e.target.value)} className="w-36" />
          </div>
          <div>
              <Label htmlFor="forecast-time" className="text-xs">Előrejelzés időpontja</Label>
              <Input id="forecast-time" type="time" value={forecastTimeInput}
                onChange={e => setForecastTimeInput(e.target.value)} className="w-36" />
          </div>
          <span className="text-xs text-slate-500">Órás becsléshez a mérés óráját is rögzíteni kell.</span>
      </div>
      {/* --- KPI STATISZTIKÁK --- */}
      {turnus && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-700">
            
            {/* 1. KOR KPI */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-primary to-blue-700 text-white relative overflow-hidden group">
                <div className="absolute right-[-20px] top-[-20px] opacity-10 group-hover:opacity-20 transition-opacity duration-500"><Target className="h-40 w-40" /></div>
                <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-2 opacity-80">Jelenlegi Kor</p>
                            <div className="text-5xl font-black tracking-tight">{todayAge}<span className="text-xl font-medium ml-1 opacity-70">nap</span></div>
                        </div>
                        <div className="text-right">
                             <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm">Cél</Badge>
                             <div className="text-2xl font-bold mt-1">{getRossTarget(todayAge).toFixed(3)} kg</div>
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-blue-100 mb-1 opacity-80"><span>Ciklus állapota</span><span>{Math.round((todayAge/42)*100)}%</span></div>
                        <Progress value={Math.min((todayAge/42)*100, 100)} className="h-2 bg-black/20" indicatorClassName="bg-white" />
                    </div>
                </CardContent>
            </Card>

            {/* 2. IDŐJÁRÁS KPI */}
            <Card className="border-0 shadow-sm bg-white ring-1 ring-slate-200/60 hover:ring-primary/20 transition-all hover:shadow-md group">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-orange-500 uppercase flex items-center gap-2 tracking-wide">
                        <CloudSun className="h-4 w-4" /> Időjárás (Élő)
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col justify-center h-[100px]">
                    <div className="flex items-baseline gap-2">
                         <div className="text-4xl font-extrabold text-slate-800">{currentWeather ? Math.round(currentWeather.temp) : "--"}</div>
                         <span className="text-xl font-medium text-slate-400">°C</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="bg-orange-50 text-orange-600 border-orange-100 font-medium">Külső Hőm.</Badge>
                        <span className="text-xs text-slate-400 font-medium">{currentWeather ? `Pára: ${currentWeather.humidity}%` : "Adatlekérés..."}</span>
                    </div>
                </CardContent>
            </Card>

            {/* ÓL ELŐREJELZÉSEK (DINAMIKUS) */}
            {Object.keys(barnPredictions).length > 0 ? (
                Object.entries(barnPredictions).map(([barnId, stats]: [string, any]) => {
                    const barnName = barns.find(b => b.id === barnId)?.nev || barnId;
                    const isPositive = stats.diff >= 0;
                    const requestedAge = forecastAgeInput.trim() ? Number(forecastAgeInput) : todayAge;
                    const timedForecast = stats.measuredTime && Number.isInteger(requestedAge) && requestedAge >= stats.age
                      ? predictWeightAtTime(stats.latest, stats.age, stats.measuredTime, requestedAge, forecastTimeInput)
                      : NaN;
                    
                    return (
                        <Card key={barnId} className={cn(
                            "relative overflow-hidden border transition-all hover:shadow-lg hover:-translate-y-1 group",
                            isPositive ? "bg-gradient-to-br from-white to-emerald-50/50 border-emerald-200/60 shadow-emerald-100/50" : "bg-gradient-to-br from-white to-rose-50/50 border-rose-200/60 shadow-rose-100/50"
                        )}>
                            {/* Decorative Blob */}
                            <div className={cn("absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors", isPositive ? "bg-emerald-400" : "bg-rose-400")} />

                            <div className="p-5 relative z-10">
                                {/* Header: Name + Badge */}
                                <div className="flex justify-between items-start mb-5">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm border bg-gradient-to-br", isPositive ? "from-emerald-50 to-white border-emerald-100 text-emerald-700" : "from-rose-50 to-white border-rose-100 text-rose-700")}>
                                            {barnName.replace(/[^0-9]/g, '')}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-800 text-base leading-tight">{barnName}</span>
                                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Ól Statisztika</span>
                                        </div>
                                    </div>
                                    <Badge variant={isPositive ? "default" : "destructive"} className={cn("text-xs px-2.5 py-1 shadow-sm border", isPositive ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" : "bg-rose-500 hover:bg-rose-600 text-white border-rose-600")}>
                                        {isPositive ? "+" : ""}{stats.diff.toFixed(1)}%
                                    </Badge>
                                </div>

                                {Number.isFinite(timedForecast) && (
                                    <div className="mb-3 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 flex justify-between items-center">
                                        <span className="text-xs text-indigo-700">Becslés: {requestedAge}. nap, {forecastTimeInput}</span>
                                        <span className="font-bold text-indigo-800">{(timedForecast * 1000).toFixed(1)} g</span>
                                    </div>
                                )}
                                {/* Metrics Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Measured */}
                                    <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between h-[80px]">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Scale className="h-3 w-3" /> Mért ({stats.age} nap)
                                        </span>
                                        <div className="text-xl font-black text-slate-800 tracking-tight">
                                            {stats.latest.toFixed(3)}
                                            <span className="text-xs font-semibold text-slate-400 ml-1">kg</span>
                                        </div>
                                    </div>

                                    {/* Projected */}
<div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between h-[80px]">
    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
        {/* Itt számoljuk ki a következő hetet: (jelenlegi kor + 7) / 7 */}
        <TrendingIcon className="h-3 w-3" /> {Math.round((stats.age + 7) / 7)}. Hét (Jósolt)
    </span>
    <div className="text-xl font-black text-indigo-600 tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
        {stats.projected.toFixed(2)}
        <span className="text-xs font-semibold text-indigo-300 ml-1">kg</span>
    </div>
</div>
                                </div>
                            </div>
                        </Card>
                    );
                })
            ) : (
                 <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col justify-center items-center text-slate-400 text-sm p-4 h-full min-h-[160px]">
                     <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
                     <p>Még nincs elegendő adat az előrejelzéshez.</p>
                 </Card>
            )}
        </div>
      )}

      {/* --- MAIN CONTENT AREA --- */}
      {turnus ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: FORM (4 col) */}
            <div className="xl:col-span-4 space-y-6">
                <Card className="shadow-2xl border-0 overflow-hidden relative group bg-white/90 backdrop-blur-sm">
                    {/* Dekoratív háttér elemek */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-100/50 rounded-full blur-3xl pointer-events-none" />
                    
                    <CardHeader className="pb-6 pt-8 relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-200 flex items-center justify-center shadow-inner">
                                <Scale className="h-6 w-6 text-emerald-600" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-extrabold text-slate-800 tracking-tight">
                                    Új Mérés
                                </CardTitle>
                                <CardDescription className="text-slate-500 font-medium text-xs uppercase tracking-wider mt-1">
                                    Rögzítés és FCR számítás
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6 px-6 pb-8 relative z-10">
                        
                        {/* 1. DÁTUM ÉS ÓL */}
                        <div className="grid grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <Label className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                                    <CalendarIcon className="w-3 h-3"/> Dátum
                                </Label>
                                <SmartDateInput value={date} onChange={setDate} className="h-12 bg-slate-50 border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all rounded-xl" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                                    <LayoutGrid className="w-3 h-3"/> Ól
                                </Label>
                                <Select value={selectedBarnId} onValueChange={setSelectedBarnId}>
                                    <SelectTrigger className="h-12 bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-xl font-medium text-slate-700">
                                        <SelectValue placeholder="Válassz..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {barns.map((b) => (<SelectItem key={b.id} value={b.id}>{b.nev}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-500 text-xs font-bold" htmlFor="measured-time">Mérés időpontja (opcionális, HH:mm)</Label>
                            <Input id="measured-time" type="time" value={measuredTime} onChange={e => setMeasuredTime(e.target.value)} className="h-12" />
                        </div>
                        {/* INFO SÁV */}
                        <div className="flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 px-4 py-3 rounded-xl border border-slate-200/60">
                             <span className="text-xs font-bold text-slate-600 flex items-center gap-2">
                                <CalendarClock className="w-4 h-4 text-emerald-500"/> Számított kor
                             </span>
                             <Badge variant="secondary" className="text-sm px-3 py-0.5 bg-white shadow-sm border border-slate-200 font-mono text-slate-800">
                                {calculatedAge} nap
                             </Badge>
                        </div>

                        <Separator className="bg-slate-100" />

                        {/* 2. MÉRÉSI ADATOK */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <div className="w-1 h-4 bg-emerald-500 rounded-full"/> Eredmények
                            </h3>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-2 relative group/input">
                                    <Label className="text-slate-500 text-[11px] font-bold uppercase tracking-wider ml-1">Darabszám</Label>
                                    <div className="relative">
                                        <Input 
                                            type="number" 
                                            className="h-14 text-lg font-bold pl-4 bg-slate-50 border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 rounded-xl transition-all" 
                                            value={headCount} 
                                            onChange={(e) => setHeadCount(e.target.value)} 
                                            placeholder="0"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md group-focus-within/input:text-emerald-600 group-focus-within/input:bg-emerald-50 transition-colors">DB</span>
                                    </div>
                                </div>
                                <div className="space-y-2 relative group/input">
                                    <Label className="text-slate-500 text-[11px] font-bold uppercase tracking-wider ml-1">Összsúly</Label>
                                    <div className="relative">
                                        <Input 
                                            type="number" 
                                            step="0.01" 
                                            className="h-14 text-lg font-bold pl-4 bg-slate-50 border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 rounded-xl transition-all" 
                                            value={totalWeight} 
                                            onChange={(e) => setTotalWeight(e.target.value)} 
                                            placeholder="0.00"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md group-focus-within/input:text-emerald-600 group-focus-within/input:bg-emerald-50 transition-colors">KG</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. FCR ADATOK */}
                        <div className="space-y-3 bg-amber-50/60 p-5 rounded-2xl border border-amber-100/80 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-200/20 rounded-bl-full pointer-events-none" />
                            
                            <div className="flex justify-between items-center relative z-10">
                                <Label className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                                    <div className="p-1.5 bg-amber-100 rounded-lg"><Wheat className="h-4 w-4 text-amber-600" /></div>
                                    Fogyasztás
                                </Label>
                                {barnStats.initial > 0 && (
                                    <Badge variant="outline" className="text-[10px] bg-white/80 text-amber-700 border-amber-200/60 backdrop-blur-sm">
                                        Létszám: <b>{barnStats.current}</b> db
                                    </Badge>
                                )}
                            </div>
                            <div className="relative group/feed">
                                <Input 
                                    type="number" step="1" 
                                    className="h-12 border-amber-200 bg-white/80 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 rounded-xl font-semibold text-amber-950 placeholder:text-amber-900/20" 
                                    value={consumedFeed} onChange={(e) => setConsumedFeed(e.target.value)} 
                                    placeholder="0"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-400 group-focus-within/feed:text-amber-600 transition-colors">KG</span>
                            </div>
                            <p className="text-[10px] text-amber-700/70 flex gap-1.5 items-center font-medium pl-1">
                                <Skull className="w-3 h-3" /> 
                                Elhullás korrekcióval ({barnStats.mortality} db).
                            </p>
                        </div>

                        {/* EREDMÉNY KÁRTYA */}
                        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl shadow-slate-200/50 mt-2 relative overflow-hidden group">
                            {/* Háttér effektek */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-bl-full opacity-50" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-indigo-500/20 to-transparent rounded-tr-full opacity-50" />
                            
                            <div className="flex justify-between items-end mb-4 relative z-10">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Mért Átlag</span>
                                    <span className="text-4xl font-black text-white tracking-tight drop-shadow-sm">
                                        {calculatedAvg > 0 ? calculatedAvg.toFixed(3) : "0.000"} <span className="text-lg font-medium text-slate-500">kg</span>
                                    </span>
                                </div>
                                <div className="p-3 bg-white/5 rounded-xl backdrop-blur-sm border border-white/10">
                                    <Scale className="w-6 h-6 text-emerald-400" />
                                </div>
                            </div>
                            
                            <div className="space-y-3 border-t border-white/10 pt-4 relative z-10">
                                {calculatedAvg > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-medium flex items-center gap-2"><Target className="w-3 h-3"/> Ross Eltérés</span>
                                        <Badge className={cn("font-bold border-0 text-xs px-2 py-0.5", calculatedAvg >= getRossTarget(calculatedAge) ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]")}>
                                            {((calculatedAvg - getRossTarget(calculatedAge)) / getRossTarget(calculatedAge) * 100).toFixed(1)}%
                                        </Badge>
                                    </div>
                                )}
                                {calculatedFCR > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-medium flex items-center gap-2"><Wheat className="w-3 h-3"/> Számított FCR</span>
                                        <span className="font-mono font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/30">{calculatedFCR.toFixed(3)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button 
                            className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all rounded-xl text-white" 
                            onClick={handleSubmit} 
                            disabled={submitting || calculatedAvg === 0}
                        >
                            {submitting ? (
                                <span className="flex items-center gap-2"><div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Mentés...</span>
                            ) : (
                                <span className="flex items-center gap-2">Mérés Mentése <ArrowRight className="w-5 h-5 opacity-80" /></span>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* RIGHT COLUMN: LIST (8 col) */}
            <div className="xl:col-span-8 space-y-6">
                <Card className="shadow-sm border-0 ring-1 ring-slate-200 bg-white h-full min-h-[600px] flex flex-col">
                    <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/30 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-lg text-slate-800 font-bold"><History className="h-5 w-5 text-slate-400" /> Mérések Naplója</CardTitle>
                            <Badge variant="outline" className="font-mono bg-white shadow-sm">{history.length} bejegyzés</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 bg-slate-50/30">
                        <div className="p-4">
                            <WeightTable 
                                data={history} 
                                emptyMessage="Nincs rögzített mérés ebben a turnusban." 
                                onDelete={handleDeleteItem}
                                onEdit={handleEditItem}
                                canEdit={canEdit}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto py-20"><Card className="border-dashed border-2 border-slate-300 bg-slate-50"><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4"><div className="bg-white p-6 rounded-full shadow-sm mb-2"><Archive className="h-12 w-12 text-slate-300" /></div><div><h2 className="text-2xl font-bold text-slate-700">Nincs aktív turnus</h2><p className="text-slate-500 max-w-sm mx-auto mt-2">A mérések rögzítéséhez először indíts el egy új turnust a vezérlőpulton.</p></div></CardContent></Card></div>
      )}

      {/* --- ARCHÍVUM --- */}
      {pastTurnuses.length > 0 && (
        <div className="pt-16 border-t border-slate-200">
             <div className="flex items-center gap-3 mb-8"><div className="h-10 w-10 bg-slate-200 rounded-xl flex items-center justify-center text-slate-600 shadow-sm"><Archive className="h-5 w-5" /></div><div><h2 className="text-2xl font-bold text-slate-800">Lezárt Turnusok</h2><p className="text-sm text-slate-500 font-medium">Korábbi ciklusok mérési adatai</p></div></div>
             <div className="grid gap-4">
                 {pastTurnuses.map(pt => {
                     const isExpanded = expandedTurnusId === pt.id;
                     const turnusData = pastWeightsCache[pt.id] || [];
                     return (
                         <div key={pt.id} className={cn("border rounded-2xl bg-white overflow-hidden transition-all duration-300", isExpanded ? "shadow-lg ring-1 ring-primary/20" : "shadow-sm hover:shadow-md border-slate-200")}>
                             <button onClick={() => togglePastTurnus(pt.id)} className={cn("w-full flex items-center justify-between p-6 transition-colors text-left", isExpanded ? "bg-slate-50/50 border-b border-slate-100" : "hover:bg-slate-50")}>
                                 <div className="flex items-center gap-5"><div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm transition-all", isExpanded ? "bg-primary text-white scale-110" : "bg-slate-100 text-slate-500")}>{pt.turnusId.substring(0,1).toUpperCase()}</div><div><span className={cn("block font-bold text-lg transition-colors", isExpanded ? "text-primary" : "text-slate-800")}>{pt.turnusId}</span><span className="text-sm text-slate-500 font-medium flex items-center gap-2 mt-1"><CalendarIcon className="w-3 h-3"/> {pt.deploy?.betelepitesDatum ? `Indult: ${pt.deploy.betelepitesDatum}` : 'Dátum nélkül'}</span></div></div>
                                 <div className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all duration-300", isExpanded ? "bg-white shadow-sm rotate-180 text-primary" : "text-slate-400")}><ChevronDown className="h-5 w-5" /></div>
                             </button>
                             <div className={cn("grid transition-all duration-500 ease-in-out", isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}><div className="overflow-hidden"><div className="p-6 bg-slate-50/30">{loadingPastWeights && !pastWeightsCache[pt.id] ? (<div className="flex items-center justify-center py-12 text-slate-400 gap-3 font-medium bg-white rounded-xl border border-slate-100 border-dashed"><div className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin"/> Adatok betöltése...</div>) : (<WeightTable data={turnusData} emptyMessage="Ehhez a turnushoz nem rögzítettek méréseket." onDelete={() => {}} onEdit={() => {}} canEdit={false} />)}</div></div></div>
                         </div>
                     );
                 })}
             </div>
        </div>
      )}

      {/* DIALÓGUSOK */}
      <CreatePastTurnusDialog open={isCreatePastOpen} onClose={() => setIsCreatePastOpen(false)} onSuccess={loadData} />
      <HistoricalImportDialog open={isImportOpen} onClose={() => setIsImportOpen(false)} pastTurnuses={pastTurnuses} barns={barns} onSuccess={() => { setPastWeightsCache({}); loadData(); }} />

      {/* --- SZERKESZTŐ MODAL --- */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                  <DialogTitle>Mérés Szerkesztése</DialogTitle>
                  <DialogDescription>
                      Módosítsd az adatokat szükség szerint. Az életkor automatikusan számolódik a dátum alapján, de kézzel felülírható.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label>Dátum</Label>
                      <SmartDateInput 
                        value={editForm.date} 
                        onChange={(val) => {
                            let autoAge = editForm.ageInDays;
                            if (turnus?.deploy?.betelepitesDatum && isValid(new Date(val))) {
                                const start = new Date(turnus.deploy.betelepitesDatum);
                                const meas = new Date(val);
                                autoAge = Math.max(0, differenceInCalendarDays(meas, start)).toString();
                            }
                            setEditForm({...editForm, date: val, ageInDays: autoAge})
                        }} 
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Mérés órája (HH:mm)</Label>
                      <Input type="time" value={editForm.measuredTime}
                        onChange={(e) => setEditForm({...editForm, measuredTime: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Életkor (nap)</Label>
                      <Input 
                        type="number" 
                        value={editForm.ageInDays} 
                        onChange={(e) => setEditForm({...editForm, ageInDays: e.target.value})} 
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Ól</Label>
                      <Select value={editForm.barnId} onValueChange={(val) => setEditForm({...editForm, barnId: val})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                              {barns.map(b => <SelectItem key={b.id} value={b.id}>{b.nev}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>Darabszám (db)</Label>
                          <Input type="number" value={editForm.headCount} onChange={(e) => setEditForm({...editForm, headCount: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                          <Label>Összsúly (kg)</Label>
                          <Input type="number" step="0.01" value={editForm.totalWeight} onChange={(e) => setEditForm({...editForm, totalWeight: e.target.value})} />
                      </div>
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Mégse</Button>
                  <Button onClick={saveEditedItem}>Mentés</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

    </div>
  );
}
