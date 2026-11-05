import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Beaker, Activity, HeartPulse, Leaf, Droplets, 
  CalendarClock, Printer, Bone, Info, Edit, Plus, Trash2, Save, X, Settings2, 
  ShieldPlus, FlaskConical, Zap, Milk, Syringe, PenLine, Home, Check
} from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveTurnus } from "@/services/turnus";
import { waitForAuth } from "@/lib/firebase"; // db már nem kell közvetlenül
import { onSnapshot, setDoc, getDocs, getDoc } from "firebase/firestore"; // doc, collection törölve
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- FONTOS: farm helperek
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

// --- TÍPUSOK ---
type ColumnType = "liquid" | "powder" | "text";

type ColumnDef = {
  id: string;
  label: string;
  icon: string; 
  type: ColumnType;
  options?: string[];
};

type PlanRow = {
  day: number;
  [key: string]: any; 
};

type Barn = {
    id: string;
    nev: string;
};

// --- 1. ALAPÉRTELMEZETT OSZLOPOK ---
const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: "col_szimbio", label: "Szimbiotikum", icon: "shield", type: "powder", options: ["LAKTO IMMUNO VITAL"] },
  { id: "col_multi", label: "Multivitamin", icon: "zap", type: "liquid", options: ["NOROVIT AMINO FORTE"] }, 
  { id: "col_maj", label: "Májvédő", icon: "heart", type: "liquid", options: ["NOROVIT HEPAR"] },
  { id: "col_csont", label: "Csonterősítés", icon: "bone", type: "liquid", options: ["OSTEO-VITAL", "OSTEO-VITAL D3"] },
  { id: "col_egyeb", label: "Egyéb / Speciál", icon: "droplet", type: "liquid", options: ["PANTOSAL SOL", "TETRASZELÉN"] }, 
  { id: "col_sav", label: "Savanyítás", icon: "flask", type: "liquid", options: ["ALMAECET", "SAVANYÍTÓ"] },
  { id: "col_novenyi", label: "Növényi kiv.", icon: "leaf", type: "powder", options: ["HERBASALM"] },
];

// --- 2. ALAPÉRTELMEZETT ADATOK ---
const DEFAULT_SCHEDULE: PlanRow[] = [
  { day: 0, col_szimbio: "LAKTO IMMUNO VITAL 20 g", col_novenyi: "HERBASALM 30 g" },
  { day: 1, col_szimbio: "LAKTO IMMUNO VITAL 20 g", col_multi: "NOROVIT AMINO FORTE 60 mL", col_novenyi: "HERBASALM 30 g" },
  { day: 2, col_szimbio: "LAKTO IMMUNO VITAL 30 g", col_multi: "NOROVIT AMINO FORTE 80 mL", col_novenyi: "HERBASALM 30 g" },
  { day: 3, col_szimbio: "LAKTO IMMUNO VITAL 40 g", col_maj: "NOROVIT HEPAR 160 mL", col_novenyi: "HERBASALM 40 g" },
  { day: 4, col_csont: "OSTEO-VITAL 90 mL", col_egyeb: "PANTOSAL SOL 220 mL", col_novenyi: "HERBASALM 40 g" },
  { day: 5, col_szimbio: "LAKTO IMMUNO VITAL 50 g", col_multi: "NOROVIT AMINO FORTE 150 mL", col_novenyi: "HERBASALM 50 g" },
  { day: 6, col_multi: "NOROVIT AMINO FORTE 150 mL", col_egyeb: "TETRASZELÉN 360 mL", col_novenyi: "HERBASALM 50 g" },
  { day: 7, col_szimbio: "LAKTO IMMUNO VITAL 70 g", col_novenyi: "HERBASALM 80 g" },
  { day: 8, col_maj: "NOROVIT HEPAR 350 mL", col_csont: "OSTEO-VITAL 180 mL", col_egyeb: "PANTOSAL SOL 460 mL", col_novenyi: "HERBASALM 80 g" },
  { day: 9, col_szimbio: "LAKTO IMMUNO VITAL 80 g", col_novenyi: "HERBASALM 90 g" },
  { day: 10, col_multi: "NOROVIT AMINO FORTE 200 mL", col_novenyi: "HERBASALM 100 g" },
];

// Ikonok
const AVAILABLE_ICONS = [
    { val: "shield", label: "Pajzs" }, { val: "zap", label: "Villám" },
    { val: "heart", label: "Szív" }, { val: "bone", label: "Csont" },
    { val: "activity", label: "EKG" }, { val: "droplet", label: "Csepp" },
    { val: "flask", label: "Lombik" }, { val: "leaf", label: "Levél" },
    { val: "milk", label: "Tej" }, { val: "syringe", label: "Oltás" },
];

const getIconComponent = (iconName: string) => {
    switch(iconName) {
        case "activity": return <Activity className="w-4 h-4 text-red-500"/>;
        case "heart": return <HeartPulse className="w-4 h-4 text-pink-600"/>;
        case "bone": return <Bone className="w-4 h-4 text-gray-400"/>;
        case "droplet": return <Droplets className="w-4 h-4 text-blue-500"/>;
        case "leaf": return <Leaf className="w-4 h-4 text-green-500"/>;
        case "shield": return <ShieldPlus className="w-4 h-4 text-emerald-600"/>;
        case "flask": return <FlaskConical className="w-4 h-4 text-purple-500"/>;
        case "zap": return <Zap className="w-4 h-4 text-yellow-500"/>;
        case "milk": return <Milk className="w-4 h-4 text-blue-300"/>;
        case "syringe": return <Syringe className="w-4 h-4 text-slate-600"/>;
        default: return <Beaker className="w-4 h-4 text-slate-500"/>;
    }
};

export default function VitaminPlan() {
  const { t } = useLanguage(); 
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "főnök";

  const [activeTurnus, setActiveTurnus] = useState<any>(null);
  const [currentAge, setCurrentAge] = useState<number>(0);
  
  const [barns, setBarns] = useState<Barn[]>([]);
  const [selectedBarnId, setSelectedBarnId] = useState<string>("");

  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [schedule, setSchedule] = useState<PlanRow[]>([]);
  const [allPlans, setAllPlans] = useState<Record<string, any>>({}); 
  const [farmName, setFarmName] = useState("TelepTech Baromfi Kft");
  
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"all" | "today">("all");
  
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editRowDialogOpen, setEditRowDialogOpen] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [editFarmNameOpen, setEditFarmNameOpen] = useState(false);
  const [tempFarmName, setTempFarmName] = useState("");
  
  const [currentRow, setCurrentRow] = useState<PlanRow>({ day: 0 });
  const [targetBarnIds, setTargetBarnIds] = useState<string[]>([]);
  
  const [colName, setColName] = useState("");
  const [colType, setColType] = useState<ColumnType>("liquid");
  const [colIcon, setColIcon] = useState("droplet");
  const [colOptions, setColOptions] = useState<string[]>([]);
  const [newOptionInput, setNewOptionInput] = useState("");
  const [editingColId, setEditingColId] = useState<string | null>(null);

  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // --- 1. INICIALIZÁLÁS ---
  useEffect(() => {
    let unsubGlobalCols: () => void;
    let unsubSettings: () => void;
    let unsubPlans: () => void;

    (async () => {
      try {
        await waitForAuth();
        
        // JAVÍTVA: farmCollection használata
        const barnsSnap = await getDocs(farmCollection("olak"));
        const barnsList = barnsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Barn));
        
        // Biztonságos rendezés
        barnsList.sort((a, b) => {
            const na = a.nev || "";
            const nb = b.nev || "";
            return na.localeCompare(nb, undefined, { numeric: true });
        });
        
        setBarns(barnsList);
        if (barnsList.length > 0) setSelectedBarnId(barnsList[0].id);

        const turnus = await getActiveTurnus();
        setActiveTurnus(turnus);
        if (turnus?.deploy?.betelepitesDatum) {
          const start = new Date(turnus.deploy.betelepitesDatum);
          const now = new Date();
          start.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0);
          const age = differenceInCalendarDays(now, start);
          setCurrentAge(age >= 0 ? age : 0);
        }

        // JAVÍTVA: farmDoc használata
        const globalColsRef = farmDoc("meta", "vitamin_global");
        unsubGlobalCols = onSnapshot(globalColsRef, (snap) => {
            if (snap.exists() && snap.data().columns) {
                setColumns(snap.data().columns);
            } else {
                setColumns(DEFAULT_COLUMNS);
            }
        });

        // JAVÍTVA: farmDoc használata
        const settingsRef = farmDoc("meta", "settings");
        unsubSettings = onSnapshot(settingsRef, (snap) => {
            if (snap.exists() && snap.data().farmName) {
                setFarmName(snap.data().farmName);
            } else {
                setFarmName("TelepTech Baromfi Kft");
            }
        });

        // JAVÍTVA: farmDoc használata
        const allPlansRef = farmDoc("meta", "vitamin_plans");
        unsubPlans = onSnapshot(allPlansRef, (snap) => {
            if(snap.exists()) {
                setAllPlans(snap.data());
            } else {
                setAllPlans({});
            }
            setLoading(false);
        });

      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    })();

    return () => { 
        if(unsubGlobalCols) unsubGlobalCols(); 
        if(unsubSettings) unsubSettings();
        if(unsubPlans) unsubPlans();
    };
  }, []);

  // --- 2. ÓL TERV BETÖLTÉSE ---
  useEffect(() => {
      if (!selectedBarnId) return;
      
      const barnData = allPlans[selectedBarnId];
      if (barnData && barnData.rows) {
          const data = barnData.rows as PlanRow[];
          setSchedule(data.sort((a, b) => a.day - b.day));
      } else {
          setSchedule(DEFAULT_SCHEDULE);
      }
  }, [selectedBarnId, allPlans]);

  // --- 3. GÖRGETÉS ---
  useEffect(() => {
    if (!loading && viewMode === "all" && rowRefs.current[currentAge] && !isEditingMode) {
      setTimeout(() => {
        rowRefs.current[currentAge]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);
    }
  }, [loading, viewMode, currentAge, isEditingMode, selectedBarnId]);

  // --- 4. MENTÉS FUNKCIÓK ---

  const saveGlobalColumns = async (newCols: ColumnDef[]) => {
      try {
          // JAVÍTVA: farmDoc
          await setDoc(farmDoc("meta", "vitamin_global"), { 
              columns: newCols 
          }, { merge: true });
      } catch (e) {
          toast({ title: t("common.error"), description: t("vitamin.toast.save_error"), variant: "destructive" });
      }
  };

  const handleSaveRow = async () => {
      if (currentRow.day === undefined || currentRow.day < 0) {
          toast({ title: t("common.error"), description: t("vitamin.toast.day_missing"), variant: "destructive" });
          return;
      }
      if (targetBarnIds.length === 0) {
          toast({ title: t("common.error"), description: t("vitamin.toast.barn_missing"), variant: "destructive" });
          return;
      }

      try {
          // JAVÍTVA: farmDoc
          const metaRef = farmDoc("meta", "vitamin_plans");
          const snap = await getDoc(metaRef);
          const fullData = snap.exists() ? snap.data() : {};
          
          const updatePayload: Record<string, any> = {};

          targetBarnIds.forEach(barnId => {
              let currentSchedule = (fullData[barnId]?.rows || DEFAULT_SCHEDULE) as PlanRow[];
              currentSchedule = JSON.parse(JSON.stringify(currentSchedule));

              const idx = currentSchedule.findIndex(r => r.day === currentRow.day);
              if (idx > -1) {
                  currentSchedule[idx] = currentRow;
              } else {
                  currentSchedule.push(currentRow);
              }
              currentSchedule.sort((a,b) => a.day - b.day);

              updatePayload[barnId] = {
                  rows: currentSchedule,
                  barnName: barns.find(b => b.id === barnId)?.nev || barnId,
                  updatedAt: new Date()
              };
          });

          await setDoc(metaRef, updatePayload, { merge: true });
          
          toast({ title: t("common.success"), description: t("vitamin.toast.save_success", {count: targetBarnIds.length}) });
          setEditRowDialogOpen(false);

      } catch (e) {
          console.error(e);
          toast({ title: t("common.error"), description: t("vitamin.toast.save_error"), variant: "destructive" });
      }
  };

  const handleDeleteRow = async (day: number) => {
      if(!confirm(t("vitamin.toast.delete_confirm", {day}))) return;
      
      const newSchedule = schedule.filter(r => r.day !== day);
      
      try {
          // JAVÍTVA: farmDoc
          const metaRef = farmDoc("meta", "vitamin_plans");
          await setDoc(metaRef, {
              [selectedBarnId]: {
                  rows: newSchedule,
                  barnName: barns.find(b => b.id === selectedBarnId)?.nev,
                  updatedAt: new Date()
              }
          }, { merge: true });

          toast({ title: t("vitamin.toast.deleted"), description: t("vitamin.toast.deleted_desc") });
      } catch (e) {
          toast({ title: t("common.error"), description: t("vitamin.toast.save_error"), variant: "destructive" });
      }
  };

  // --- EGYÉB KEZELŐK ---
  const handleSaveFarmName = async () => {
      if(!tempFarmName.trim()) return;
      try {
          // JAVÍTVA: farmDoc
          await setDoc(farmDoc("meta", "settings"), { farmName: tempFarmName }, { merge: true });
          toast({ title: t("common.success"), description: t("vitamin.toast.farm_saved") });
          setEditFarmNameOpen(false);
      } catch (error) {
          toast({ title: t("common.error"), description: t("vitamin.toast.save_error"), variant: "destructive" });
      }
  };

  const handleSaveColumn = async () => {
      if(!colName.trim()) return;
      let newColumns = [...columns];
      if (editingColId) {
          newColumns = newColumns.map(c => c.id === editingColId ? { ...c, label: colName, type: colType, icon: colIcon, options: colOptions } : c);
          toast({title: t("vitamin.toast.col_updated"), description: t("vitamin.toast.col_updated_desc")});
      } else {
          const newId = "col_" + Date.now().toString(36);
          newColumns.push({ id: newId, label: colName, type: colType, icon: colIcon, options: colOptions });
          toast({title: t("vitamin.toast.col_created"), description: t("vitamin.toast.col_created_desc")});
      }
      setColumns(newColumns);
      await saveGlobalColumns(newColumns);
      resetColForm();
  };

  const handleEditColumnStart = (col: ColumnDef) => {
      setEditingColId(col.id);
      setColName(col.label);
      setColType(col.type);
      setColIcon(col.icon);
      setColOptions(col.options || []);
  };

  const handleDeleteColumn = async (colId: string) => {
      if(!confirm(t("vitamin.toast.col_delete_confirm"))) return;
      const newColumns = columns.filter(c => c.id !== colId);
      setColumns(newColumns);
      await saveGlobalColumns(newColumns);
      if (editingColId === colId) resetColForm();
  };

  const addOption = () => { if(newOptionInput.trim() && !colOptions.includes(newOptionInput.trim())) { setColOptions([...colOptions, newOptionInput.trim()]); setNewOptionInput(""); } };
  const removeOption = (opt: string) => { setColOptions(colOptions.filter(o => o !== opt)); };
  const resetColForm = () => { setEditingColId(null); setColName(""); setColType("liquid"); setColIcon("droplet"); setColOptions([]); setNewOptionInput(""); };

  const openEditRow = (row?: PlanRow) => {
      if (row) setCurrentRow({...row});
      else setCurrentRow({ day: schedule.length > 0 ? schedule[schedule.length-1].day + 1 : 0 });
      
      setTargetBarnIds([selectedBarnId]);
      setEditRowDialogOpen(true);
  };

  const QuickPick = ({ col, onPick }: { col: ColumnDef, onPick: (val: string) => void }) => {
      if (!col.options || col.options.length === 0) return null;
      return (
          <div className="flex flex-wrap gap-1 mt-1.5">
              {col.options.map(opt => (
                  <Badge key={opt} variant="outline" className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 font-normal text-[10px] transition-colors" onClick={() => onPick(opt)}>{opt}</Badge>
              ))}
          </div>
      );
  };

  const renderCell = (content: any, type: ColumnType) => {
    if (!content) return <span className="text-slate-300 text-xs">-</span>;
    const str = String(content);
    const parts = str.match(/^(.*?)(\d+\s*(?:mL|g|kg|l))$/i);
    const name = parts ? parts[1] : str;
    const amount = parts ? parts[2] : "";
    return (
      <div className="flex flex-col items-start">
        <span className="font-semibold text-slate-700 text-xs sm:text-sm leading-tight">{name}</span>
        {amount && <Badge variant="secondary" className={cn("mt-1 text-[10px] font-bold border shadow-sm", type === "powder" ? "bg-amber-50 text-amber-700 border-amber-200" : type === "liquid" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100")}>{amount}</Badge>}
      </div>
    );
  };

  const filteredData = viewMode === "today" ? schedule.filter(row => row.day === currentAge) : schedule;

  if (loading && barns.length === 0) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6 pb-24">
      
      {/* FEJLÉC */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 text-slate-800">
            <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><Beaker className="h-8 w-8" /></div>
            {farmName} {t("vitamin.title")} ({new Date().getFullYear()})
            {isEditingMode && <Button variant="ghost" size="sm" className="ml-2 h-6 w-6 p-0" onClick={() => { setTempFarmName(farmName); setEditFarmNameOpen(true); }}><PenLine className="w-4 h-4 text-slate-400 hover:text-slate-700"/></Button>}
          </h1>
          <p className="text-slate-500 mt-1 ml-1">{t("vitamin.subtitle")}</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
            {activeTurnus ? (
                <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 text-right">
                    <div className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">{t("vitamin.active_batch")}</div>
                    <div className="text-lg font-bold text-emerald-900 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> {t("vitamin.days_old", {age: currentAge})}</div>
                </div>
            ) : (
                <Badge variant="destructive">{t("vitamin.no_active")}</Badge>
            )}
            
            {canEdit && (
                <Button variant={isEditingMode ? "secondary" : "outline"} onClick={() => setIsEditingMode(!isEditingMode)} className={cn("gap-2", isEditingMode && "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200")}>
                    {isEditingMode ? <><X className="h-4 w-4"/> {t("vitamin.btn.done")}</> : <><Edit className="h-4 w-4"/> {t("vitamin.btn.edit")}</>}
                </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => window.print()} title={t("vitamin.print")}><Printer className="h-5 w-5 text-slate-600" /></Button>
        </div>
      </div>

      {/* KIVÁLASZTÓK */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border shadow-sm">
                  <Home className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-bold text-slate-700">{t("vitamin.select_barn")}</span>
                  <Select value={selectedBarnId} onValueChange={setSelectedBarnId}>
                      <SelectTrigger className="w-[180px] h-8 border-none bg-transparent focus:ring-0 font-bold text-blue-700"><SelectValue placeholder={t("vitamin.select_placeholder")} /></SelectTrigger>
                      <SelectContent>{barns.map(b => <SelectItem key={b.id} value={b.id}>{b.nev}</SelectItem>)}</SelectContent>
                  </Select>
              </div>
              <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-[200px]">
                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="all">{t("vitamin.tab.all")}</TabsTrigger><TabsTrigger value="today">{t("vitamin.tab.today")}</TabsTrigger></TabsList>
              </Tabs>
          </div>
          {isEditingMode && (
              <div className="flex gap-2 w-full sm:w-auto">
                  <Button onClick={() => setColumnManagerOpen(true)} variant="outline" className="gap-2 flex-1 sm:flex-none"><Settings2 className="h-4 w-4"/> {t("vitamin.btn.columns")}</Button>
                  <Button onClick={() => openEditRow()} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shadow-md flex-1 sm:flex-none"><Plus className="h-4 w-4"/> {t("vitamin.btn.new_day")}</Button>
              </div>
          )}
      </div>

      {/* TÁBLÁZAT */}
      <Card className="shadow-lg border-0 overflow-hidden ring-1 ring-slate-200">
        <div className="overflow-x-auto">
            <Table className="w-full min-w-[1200px]">
                <TableHeader className="bg-slate-900">
                    <TableRow className="hover:bg-slate-900 border-none">
                        <TableHead className="w-[70px] text-center text-slate-200 font-bold text-base sticky left-0 bg-slate-900 z-10">{t("vitamin.table.age")}</TableHead>
                        {columns.map(col => (
                            <TableHead key={col.id} className="text-slate-200 font-bold border-l border-slate-700/50 min-w-[150px]">
                                <div className="flex items-center gap-2">{getIconComponent(col.icon)} {col.label}</div>
                            </TableHead>
                        ))}
                        {isEditingMode && <TableHead className="w-[80px] bg-slate-950"></TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredData.length === 0 ? (
                        <TableRow><TableCell colSpan={columns.length + 2} className="text-center py-10 text-muted-foreground">{t("vitamin.table.no_data")}</TableCell></TableRow>
                    ) : (
                        filteredData.map((row) => {
                            const isToday = row.day === currentAge;
                            return (
                                <TableRow key={row.day} ref={(el) => (rowRefs.current[row.day] = el)} className={cn("transition-colors border-b group", isToday ? "bg-emerald-50 hover:bg-emerald-100/80 shadow-inner ring-l-4 ring-l-emerald-500" : "hover:bg-slate-50", row.day < currentAge && !isEditingMode && "opacity-50 grayscale-[0.8] bg-slate-50/50")}>
                                    <TableCell className={cn("text-center border-r p-0 sticky left-0 z-10", isToday ? "bg-emerald-50" : "bg-slate-100/90")}>
                                        <div className="flex flex-col items-center justify-center h-full py-4">
                                            <span className={cn("text-xl font-black", isToday ? "text-emerald-600" : "text-slate-400")}>{row.day}</span>
                                            {isToday && <Badge className="bg-emerald-600 mt-1 text-[9px] px-1.5">{t("vitamin.table.ma")}</Badge>}
                                        </div>
                                    </TableCell>
                                    {columns.map(col => (
                                        <TableCell key={col.id} className="align-top py-4 border-r border-slate-100 last:border-0">{renderCell(row[col.id], col.type)}</TableCell>
                                    ))}
                                    {isEditingMode && (
                                        <TableCell className="text-center align-middle">
                                            <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-100 hover:text-blue-600" onClick={() => openEditRow(row)}><Edit className="h-4 w-4"/></Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-100 hover:text-red-600" onClick={() => handleDeleteRow(row.day)}><Trash2 className="h-4 w-4"/></Button>
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
      </Card>

      <div className="flex items-center gap-2 text-xs text-slate-500 mt-4 p-2 bg-slate-50 rounded-lg border border-slate-100">
          <Info className="w-4 h-4 text-blue-500"/>
          <span>{t("vitamin.info_text")}</span>
      </div>

      {/* 1. MODAL: NAP SZERKESZTÉSE ÉS TÖBBES KIJELÖLÉS */}
      <Dialog open={editRowDialogOpen} onOpenChange={setEditRowDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                  <DialogTitle>{t("vitamin.dialog.edit_day")}</DialogTitle>
                  <DialogDescription>{t("vitamin.dialog.edit_desc", {day: currentRow.day})}</DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-4">
                  {/* Ól kijelölő szekció */}
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <Label className="mb-2 block text-blue-800 font-bold">{t("vitamin.dialog.target_barns")}</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {barns.map(b => (
                              <div key={b.id} className="flex items-center space-x-2 bg-white p-2 rounded border shadow-sm">
                                  <Checkbox 
                                    id={`target-${b.id}`} 
                                    checked={targetBarnIds.includes(b.id)}
                                    onCheckedChange={(checked) => {
                                        if (checked) setTargetBarnIds([...targetBarnIds, b.id]);
                                        else setTargetBarnIds(targetBarnIds.filter(id => id !== b.id));
                                    }}
                                  />
                                  <label htmlFor={`target-${b.id}`} className="text-sm font-medium cursor-pointer select-none">{b.nev}</label>
                              </div>
                          ))}
                      </div>
                      <p className="text-xs text-blue-600 mt-2">{t("vitamin.dialog.target_info")}</p>
                  </div>

                  {/* Adatbevitel */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 flex items-center gap-4 p-3 bg-slate-50 rounded border">
                          <Label htmlFor="day" className="w-24 text-right font-bold">{t("vitamin.dialog.day_label")}</Label>
                          <Input id="day" type="number" value={currentRow.day} onChange={(e) => setCurrentRow({...currentRow, day: Number(e.target.value)})} className="w-24 font-bold text-lg" />
                      </div>
                      {columns.map(col => (
                          <div key={col.id} className="space-y-1 p-3 border rounded bg-slate-50/30 hover:bg-slate-50 transition-colors">
                              <Label className="text-xs text-slate-600 uppercase font-bold flex items-center gap-2 mb-1.5">{getIconComponent(col.icon)} {col.label}</Label>
                              <Input 
                                  placeholder={`pl. ${col.type === 'liquid' ? '100 ml' : '50 g'}`} 
                                  value={currentRow[col.id] || ""} 
                                  onChange={(e) => setCurrentRow({...currentRow, [col.id]: e.target.value})} 
                              />
                              {/* Gyorsválasztó Gombok */}
                              <QuickPick 
                                col={col} 
                                onPick={(val) => setCurrentRow({...currentRow, [col.id]: val})} 
                              />
                          </div>
                      ))}
                  </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setEditRowDialogOpen(false)}>{t("vitamin.dialog.cancel")}</Button><Button onClick={handleSaveRow} className="bg-emerald-600 hover:bg-emerald-700"><Save className="w-4 h-4 mr-2"/> {t("vitamin.dialog.save")}</Button></DialogFooter>
          </DialogContent>
      </Dialog>

      {/* 2. MODAL: OSZLOPOK KEZELÉSE */}
      <Dialog open={columnManagerOpen} onOpenChange={(o) => { if(!o) resetColForm(); setColumnManagerOpen(o); }}>
          <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
              <DialogHeader><DialogTitle>{t("vitamin.dialog.cols_title")}</DialogTitle><DialogDescription>{t("vitamin.dialog.cols_desc")}</DialogDescription></DialogHeader>
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 py-2">
                  <div className="space-y-2">{columns.map(col => (<div key={col.id} className={cn("flex flex-col p-3 border rounded-lg bg-slate-50 transition-all", editingColId === col.id && "border-amber-400 bg-amber-50 shadow-md")}><div className="flex justify-between items-start"><div className="flex items-center gap-3">{getIconComponent(col.icon)}<span className="font-bold text-sm">{col.label}</span><Badge variant="outline" className="text-[9px] h-4">{col.type === 'liquid' ? 'Folyadék' : 'Por'}</Badge></div><div className="flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-blue-100 text-blue-600" onClick={() => handleEditColumnStart(col)}><Edit className="h-3.5 w-3.5"/></Button><Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-100" onClick={() => handleDeleteColumn(col.id)}><Trash2 className="h-3.5 w-3.5"/></Button></div></div>{col.options && col.options.length > 0 && (<div className="mt-2 flex flex-wrap gap-1 ml-7">{col.options.map(opt => (<span key={opt} className="text-[10px] text-slate-600 bg-white px-1.5 py-0.5 rounded border">{opt}</span>))}</div>)}</div>))}</div>
                  <div className="border-t pt-4 mt-2 space-y-3 bg-slate-50 p-4 rounded-xl border">
                      <Label className="block font-bold text-sm text-slate-700 flex justify-between items-center">{editingColId ? t("vitamin.dialog.col_edit_title") : t("vitamin.dialog.col_new_title")}{editingColId && <Button variant="link" size="sm" onClick={resetColForm} className="h-auto p-0 text-xs text-blue-600">{t("vitamin.dialog.cancel")}</Button>}</Label>
                      <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs text-muted-foreground">{t("vitamin.dialog.col_name")}</Label><Input placeholder="pl. Probiotikum" value={colName} onChange={e => setColName(e.target.value)} className="h-9" /></div><div><Label className="text-xs text-muted-foreground">{t("vitamin.dialog.col_type")}</Label><Select value={colType} onValueChange={(v:any) => setColType(v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="liquid">Folyadék (kék)</SelectItem><SelectItem value="powder">Por (sárga)</SelectItem><SelectItem value="text">Szöveg</SelectItem></SelectContent></Select></div></div>
                      <div><Label className="text-xs text-muted-foreground">{t("vitamin.dialog.col_icon")}</Label><div className="flex flex-wrap gap-2 mt-1">{AVAILABLE_ICONS.map(ic => (<button key={ic.val} onClick={() => setColIcon(ic.val)} title={ic.label} className={cn("p-2 rounded border hover:bg-slate-100 transition-colors", colIcon === ic.val ? "bg-slate-200 border-slate-400 ring-2 ring-slate-200" : "bg-white border-slate-200")}>{getIconComponent(ic.val)}</button>))}</div></div>
                      <div><Label className="text-xs text-muted-foreground font-bold text-amber-700 flex items-center gap-1"><Plus className="w-3 h-3"/> {t("vitamin.dialog.col_products")}</Label><div className="flex gap-2 mt-1"><Input placeholder="pl. OSTEO-VITAL (Enter)" value={newOptionInput} onChange={e => setNewOptionInput(e.target.value)} className="h-9 flex-1" onKeyDown={(e) => e.key === 'Enter' && addOption()}/><Button size="sm" onClick={addOption} variant="secondary"><Plus className="h-4 w-4"/></Button></div><div className="flex flex-wrap gap-1 mt-2">{colOptions.map(opt => (<Badge key={opt} variant="secondary" className="pl-2 pr-1 py-0 h-6 flex items-center gap-1 bg-white border">{opt}<X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => removeOption(opt)}/></Badge>))}</div><p className="text-[10px] text-muted-foreground mt-1">{t("vitamin.dialog.col_products_info")}</p></div>
                      <Button onClick={handleSaveColumn} className="w-full bg-slate-900 h-10 mt-2">{editingColId ? <><Save className="h-4 w-4 mr-2"/> {t("vitamin.dialog.col_save")}</> : <><Plus className="h-4 w-4 mr-2"/> {t("vitamin.dialog.col_add")}</>}</Button>
                  </div>
              </div>
              <DialogFooter className="mt-2"><Button variant="outline" onClick={() => setColumnManagerOpen(false)}>{t("vitamin.dialog.close")}</Button></DialogFooter>
          </DialogContent>
      </Dialog>

      {/* 3. MODAL: TELEP NÉV */}
      <Dialog open={editFarmNameOpen} onOpenChange={setEditFarmNameOpen}>
          <DialogContent><DialogHeader><DialogTitle>{t("vitamin.dialog.farm_title")}</DialogTitle><DialogDescription>{t("vitamin.dialog.farm_desc")}</DialogDescription></DialogHeader><div className="py-4"><Label>{t("vitamin.dialog.farm_label")}</Label><Input value={tempFarmName} onChange={(e) => setTempFarmName(e.target.value)} className="mt-2"/></div><DialogFooter><Button variant="outline" onClick={() => setEditFarmNameOpen(false)}>{t("vitamin.dialog.cancel")}</Button><Button onClick={handleSaveFarmName}>{t("vitamin.dialog.save")}</Button></DialogFooter></DialogContent>
      </Dialog>

    </div>
  );
}
