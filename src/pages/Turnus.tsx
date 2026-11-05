import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { getActiveTurnus, closeTurnus, saveDeploy, type TurnusDoc } from "@/services/turnus";
import { getWeightsByBatch, type WeightMeasurement } from "@/services/weightService";
import { waitForAuth } from "@/lib/firebase";
import { getDocs, getDoc, setDoc, serverTimestamp, query, where, orderBy } from "firebase/firestore";
// FONTOS: farmDb importálása a db helyett
import { farmCollection, farmDoc } from "@/lib/farmDb";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
    Archive, Skull, Scale, Loader2, User, Calendar,
    CheckCircle2, XCircle, Play, Warehouse,
    History, ChevronRight, FolderOpen, FileDown, CheckSquare, Square, FileText,
    Calculator, AlertTriangle, ArrowDownToLine, Check, RefreshCw, Cog, Image as ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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

// PDF Generation
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Ol = { id: string; nev: string; csoportId?: string };

type MortalityRecord = {
    date: string;
    operatorName: string;
    total: number;
    barns: Record<string, number>;
};

type PastTurnus = {
    id: string;
    turnusId?: string;
    active?: boolean;
    createdAt?: any;
    closedAt?: any;
    deploy?: {
        csoportId?: string | null;
        betelepitesDatum?: string | null;
        osszesCsirke?: number | null;
        olak?: { olId: string; olNev?: string; csirkeDb?: number | null }[];
    };
};

// ---- Helpers ----
function toId(input: string): string {
    if (!input) return "";
    return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function todayISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function formatTS(ts: any): string {
    try {
        if (!ts) return "-";
        if (typeof ts.toDate === "function") return ts.toDate().toLocaleDateString();
        if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleDateString();
    } catch { }
    return "-";
}
function pickNev(data: any): string {
    return data?.nev ?? data?.name ?? data?.label ?? data?.olaszam ?? "No Name";
}

// Helper kép betöltéshez (Base64 konverzió)
const getBase64ImageFromURL = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.setAttribute("crossOrigin", "anonymous");
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL("image/png");
            resolve(dataURL);
        };
        img.onerror = () => {
            console.warn(`Kép betöltési hiba: ${url}`);
            resolve(null);
        };
        img.src = url;
    });
};

// --- FONT BETÖLTÉS (ROBOTO) ---
const loadCustomFont = async (doc: jsPDF) => {
    try {
        const fontUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf";
        const response = await fetch(fontUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise<void>((resolve) => {
            reader.onloadend = () => {
                const base64data = reader.result?.toString().split(',')[1];
                if (base64data) {
                    doc.addFileToVFS("Roboto-Regular.ttf", base64data);
                    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
                    doc.setFont("Roboto");
                }
                resolve();
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) { console.error("Font hiba:", e); }
};

export default function TurnusPanel() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const role = user?.role;
    const canManage = role === "admin" || role === "főnök";

    const [loading, setLoading] = useState(true);
    const [turnus, setTurnus] = useState<TurnusDoc | null>(null);
    const [olak, setOlak] = useState<Ol[]>([]);
    const [pastTurnusok, setPastTurnusok] = useState<PastTurnus[]>([]);
    const [closing, setClosing] = useState(false);

    // AKTÍV TURNUS ADATAI
    const [activeBarnMortality, setActiveBarnMortality] = useState<Record<string, number>>({});

    // --- BETELEPÍTÉS FORM STATEK ---
    const [isNewTurnusOpen, setIsNewTurnusOpen] = useState(false);
    const [newTurnusIdInput, setNewTurnusIdInput] = useState("");

    // KIVÁLASZTOTT RÉGI TURNUS ADATAI
    const [selectedPastId, setSelectedPastId] = useState<string | null>(null);
    const [pastDetailsLoading, setPastDetailsLoading] = useState(false);
    const [pastMortalityTotal, setPastMortalityTotal] = useState<number>(0);
    const [pastWeights, setPastWeights] = useState<WeightMeasurement[]>([]);
    const [pastMortalityLog, setPastMortalityLog] = useState<MortalityRecord[]>([]);
    const [barnMortalityTotals, setBarnMortalityTotals] = useState<Record<string, number>>({});

    // --- EXPORT STATE ---
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [exportStep, setExportStep] = useState(1);
    const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const [exportOptions, setExportOptions] = useState({
        info: true,
        mortality: true,
        weights: true
    });
    const [customLogo, setCustomLogo] = useState<string | null>(null);

    const olNevMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const o of olak) m.set(o.id, o.nev);
        return m;
    }, [olak]);

    const loadData = async () => {
        try {
            await waitForAuth();
            const activeTurnus = await getActiveTurnus();
            setTurnus(activeTurnus);

            const snapOl = await getDocs(farmCollection("olak"));
            const loadedOlak = snapOl.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Ol[];

            // JAVÍTÁS: Ellenőrzés, hogy a 'nev' létezik-e rendezés előtt
            loadedOlak.sort((a, b) => {
                const nevA = a.nev || "";
                const nevB = b.nev || "";
                return nevA.localeCompare(nevB, undefined, { numeric: true });
            });

            setOlak(loadedOlak);

            if (activeTurnus) {
                const daysRef = farmCollection("turnusok", activeTurnus.id, "muszakBeosztasDays");
                const daysSnap = await getDocs(daysRef);
                const currentMortality: Record<string, number> = {};

                daysSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.elhulas) {
                        Object.entries(data.elhulas).forEach(([barnId, val]) => {
                            currentMortality[barnId] = (currentMortality[barnId] || 0) + (Number(val) || 0);
                        });
                    }
                });
                setActiveBarnMortality(currentMortality);
            }

            const pastSnap = await getDocs(query(farmCollection("turnusok"), where("active", "==", false)));
            const list = pastSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as PastTurnus[];

            list.sort((a, b) => {
                const aa = (a as any)?.closedAt?.seconds ?? 0;
                const bb = (b as any)?.closedAt?.seconds ?? 0;
                return bb - aa;
            });

            setPastTurnusok(list);
        } catch (e: any) {
            console.error(e);
            toast({
                title: t("common.error"),
                description: e.message || "Betöltési hiba",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [t]);


    useEffect(() => {
        if (!selectedPastId) {
            setPastMortalityTotal(0);
            setPastWeights([]);
            setPastMortalityLog([]);
            setBarnMortalityTotals({});
            return;
        }

        (async () => {
            setPastDetailsLoading(true);
            try {
                // farmCollection használata!
                const daysRef = farmCollection("turnusok", selectedPastId, "muszakBeosztasDays");
                const daysQ = query(daysRef, orderBy("date", "desc"));
                const daysSnap = await getDocs(daysQ);

                let totalMortality = 0;
                const log: MortalityRecord[] = [];
                const barnTotals: Record<string, number> = {};

                daysSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.elhulasSaved) {
                        let dayTotal = 0;
                        const barnsData: Record<string, number> = {};
                        if (data.elhulas) {
                            Object.entries(data.elhulas).forEach(([barnId, val]) => {
                                const count = Number(val) || 0;
                                dayTotal += count;
                                barnsData[barnId] = count;
                                if (!barnTotals[barnId]) barnTotals[barnId] = 0;
                                barnTotals[barnId] += count;
                            });
                        }
                        totalMortality += dayTotal;
                        log.push({
                            date: data.date,
                            operatorName: data.operator?.displayName || data.operator?.nev || "-",
                            total: dayTotal,
                            barns: barnsData
                        });
                    }
                });

                setPastMortalityTotal(totalMortality);
                setPastMortalityLog(log);
                setBarnMortalityTotals(barnTotals);

                const weightsData = await getWeightsByBatch(selectedPastId);
                setPastWeights(weightsData);

            } catch (e) {
                console.error("Részletek betöltése hiba:", e);
            } finally {
                setPastDetailsLoading(false);
            }
        })();
    }, [selectedPastId]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => { setCustomLogo(reader.result as string); };
            reader.readAsDataURL(file);
        }
    };

    // --- PDF EXPORT LOGIKA ---
    const handleExportPDF = async () => {
        if (selectedExportIds.length === 0) return;
        setIsExporting(true);

        try {
            const watermarkBase64 = await getBase64ImageFromURL("/TelepTechkft.png");
            const companyLogoBase64 = await getBase64ImageFromURL("/TelepTechkftlogo.png");

            const doc = new jsPDF();
            await loadCustomFont(doc);

            const addPageBranding = (pdfDoc: jsPDF, title: string) => {
                const width = pdfDoc.internal.pageSize.getWidth();
                const height = pdfDoc.internal.pageSize.getHeight();

                if (watermarkBase64) {
                    pdfDoc.saveGraphicsState();
                    pdfDoc.setGState(new (pdfDoc as any).GState({ opacity: 0.15 }));
                    const wmWidth = 100;
                    const wmHeight = 100;
                    const wmX = (width - wmWidth) / 2;
                    const wmY = (height - wmHeight) / 2;
                    pdfDoc.addImage(watermarkBase64, 'PNG', wmX, wmY, wmWidth, wmHeight);
                    pdfDoc.restoreGraphicsState();
                }

                const logoToUse = customLogo || watermarkBase64;
                if (logoToUse) {
                    const logoW = 25;
                    const logoH = 25;
                    pdfDoc.addImage(logoToUse, 'PNG', (width / 2) - (logoW / 2), 10, logoW, logoH);
                }

                pdfDoc.setFontSize(18);
                pdfDoc.setTextColor(40, 40, 40);
                pdfDoc.text(title, width / 2, 45, { align: "center" });

                pdfDoc.setDrawColor(200, 200, 200);
                pdfDoc.line(14, 50, width - 14, 50);

                if (companyLogoBase64) {
                    const fLogoW = 20;
                    const fLogoH = 10;
                    pdfDoc.addImage(companyLogoBase64, 'PNG', width - 14 - fLogoW, height - 20, fLogoW, fLogoH);
                }

                const pageCount = pdfDoc.getNumberOfPages();
                pdfDoc.setFontSize(8);
                pdfDoc.setTextColor(150);
                pdfDoc.text(`Létrehozva: ${new Date().toLocaleString('hu-HU')}`, 14, height - 10);
                pdfDoc.text(`FarmLog Pro • ${pageCount}. oldal`, width - 14, height - 8, { align: "right" });
            };

            let firstPage = true;

            for (const turnusId of selectedExportIds) {
                const turnusInfo = pastTurnusok.find(p => p.id === turnusId);
                if (!turnusInfo) continue;

                if (!firstPage) doc.addPage();
                firstPage = false;

                const displayTitle = `Turnus Jelentés: ${turnusInfo.turnusId || turnusInfo.id}`;
                let finalY = 60;

                const commonTableOptions = {
                    didDrawPage: (data: any) => {
                        addPageBranding(doc, displayTitle);
                    },
                    margin: { top: 55 },
                    styles: { font: "Roboto", fontStyle: "normal" }
                };

                // farmCollection használata!
                const daysRef = farmCollection("turnusok", turnusId, "muszakBeosztasDays");
                const daysSnap = await getDocs(query(daysRef, orderBy("date", "asc")));
                let totalMortality = 0;
                const mortalityLog: any[] = [];
                daysSnap.forEach(d => {
                    const data = d.data();
                    if (data.elhulasSaved) {
                        let dayTotal = 0;
                        if (data.elhulas) Object.values(data.elhulas).forEach((val: any) => dayTotal += (Number(val) || 0));
                        totalMortality += dayTotal;
                        mortalityLog.push({
                            date: data.date,
                            operator: data.operator?.displayName || data.operator?.nev || "-",
                            total: dayTotal,
                            ...data.elhulas
                        });
                    }
                });

                if (!exportOptions.info && !exportOptions.mortality && !exportOptions.weights) {
                    addPageBranding(doc, displayTitle);
                }

                if (exportOptions.info) {
                    const startCount = turnusInfo.deploy?.osszesCsirke || 0;
                    const lossPercent = startCount > 0 ? ((totalMortality / startCount) * 100).toFixed(2) : "0";

                    doc.setFontSize(12);
                    doc.setTextColor(60, 60, 60);
                    doc.setFont("Roboto");
                    doc.text("Összesítő adatok", 14, finalY);

                    autoTable(doc, {
                        startY: finalY + 2,
                        head: [['Kategória', 'Érték']],
                        body: [
                            ['Kezdés dátuma', formatTS(turnusInfo.createdAt)],
                            ['Lezárás dátuma', formatTS(turnusInfo.closedAt)],
                            ['Indító létszám', `${startCount.toLocaleString()} db`],
                            ['Teljes elhullás', `${totalMortality.toLocaleString()} db`],
                            ['Veszteség arány', `${lossPercent}%`],
                        ],
                        theme: 'striped',
                        headStyles: { fillColor: [41, 128, 185] },
                        ...commonTableOptions
                    });
                    finalY = (doc as any).lastAutoTable.finalY + 15;
                }

                if (exportOptions.mortality && mortalityLog.length > 0) {
                    doc.text("Elhullási Napló", 14, finalY);
                    const barnIds = olak.map(o => o.id);
                    const barnNames = olak.map(o => o.nev);
                    const head = ['Dátum', 'Műszakos', ...barnNames, 'Összesen'];
                    const body = mortalityLog.map(row => [
                        row.date,
                        row.operator,
                        ...barnIds.map(bid => row[bid] || "-"),
                        row.total
                    ]);
                    autoTable(doc, {
                        startY: finalY + 2,
                        head: [head],
                        body: body,
                        theme: 'striped',
                        headStyles: { fillColor: [220, 53, 69] },
                        styles: { fontSize: 8, font: "Roboto" },
                        ...commonTableOptions
                    });
                    finalY = (doc as any).lastAutoTable.finalY + 15;
                }

                const weightsLog = await getWeightsByBatch(turnusId);
                if (exportOptions.weights && weightsLog.length > 0) {
                    if (finalY > 250) {
                        doc.addPage();
                        finalY = 55;
                    }
                    doc.text("Mérlegelési Napló", 14, finalY);
                    const wBody = weightsLog.map(w => [
                        w.date, w.ageInDays, w.barnName, `${w.averageWeight.toFixed(3)} kg`, w.headCount, w.fcr ? w.fcr.toFixed(3) : "-"
                    ]);
                    autoTable(doc, {
                        startY: finalY + 2,
                        head: [['Dátum', 'Kor (nap)', 'Ól', 'Átlag', 'Darab', 'FCR']],
                        body: wBody,
                        theme: 'striped',
                        headStyles: { fillColor: [39, 174, 96] },
                        styles: { fontSize: 9, font: "Roboto" },
                        ...commonTableOptions
                    });
                }
            }

            doc.save(`turnus_export_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast({ title: t("common.success"), description: "A PDF exportálás elkészült." });
            setIsExportOpen(false);
            setSelectedExportIds([]);
            setExportStep(1);
            setCustomLogo(null);

        } catch (e) {
            console.error(e);
            toast({ title: t("common.error"), description: "Hiba történt az exportálás során.", variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
    };

    async function startNew() {
        if (!canManage) {
            toast({
                title: t("batch.toast.no_perm"),
                description: t("batch.toast.only_leader_start"),
                variant: "destructive",
            });
            return;
        }
        try {
            setLoading(true);
            const suggested = `turnus-${todayISO()}`;
            let raw = window.prompt(t("batch.prompt.enter_id"), suggested) ?? suggested;
            raw = raw.trim();
            const fixedId = toId(raw || suggested);
            if (!fixedId) return;

            const ref = farmDoc("turnusok", fixedId);
            const ex = await getDoc(ref);

            if (ex.exists()) {
                const data = ex.data() as any;
                if (data?.active) {
                    toast({ title: t("batch.toast.exists"), variant: "destructive" });
                    return;
                }
                await setDoc(
                    ref,
                    { active: true, turnusId: fixedId, reactivatedAt: serverTimestamp() },
                    { merge: true }
                );
            } else {
                await setDoc(
                    ref,
                    { id: fixedId, turnusId: fixedId, active: true, createdAt: serverTimestamp() },
                    { merge: true }
                );
            }

            const activeTurnus = await getActiveTurnus();
            setTurnus(activeTurnus);
            toast({ title: t("batch.toast.started"), description: fixedId });
        } catch (e: any) {
            toast({ title: t("common.error"), description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }


    async function doClose() {
        if (!turnus) return;
        if (!canManage) return;
        if (!confirm("Biztosan lezárod a jelenlegi turnust?")) return;

        try {
            setLoading(true);
            await closeTurnus(turnus.id);
            setTurnus(await getActiveTurnus());
            toast({ title: t("batch.toast.closed") });
            await loadData();
        } catch (e: any) {
            toast({ title: t("common.error"), description: e.message || "Lezárási hiba", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    const title = useMemo(() => (turnus?.turnusId ? t("batch.active_title", { id: turnus.turnusId }) : t("batch.default_title")), [turnus?.turnusId, t]);
    const createdAtStr = useMemo(() => formatTS((turnus as any)?.createdAt), [turnus?.id]);

    const deployOlMap = useMemo(() => {
        const list = (turnus as any)?.deploy?.olak;
        const m: Record<string, number> = {};
        if (Array.isArray(list)) {
            for (const it of list) { if (it?.olId) m[it.olId] = Number(it.csirkeDb) || 0; }
        }
        return m;
    }, [turnus?.id]);

    const rowsActive = useMemo(() => {
        const seen = new Set<string>();
        const arr: { id: string; nev: string; db: number | null }[] = [];
        for (const ol of olak) {
            const val = Number.isFinite(deployOlMap[ol.id]) ? deployOlMap[ol.id] : null;
            arr.push({ id: ol.id, nev: ol.nev, db: val });
            seen.add(ol.id);
        }
        const list = (turnus as any)?.deploy?.olak;
        if (Array.isArray(list)) {
            for (const it of list) {
                const id = it?.olId;
                if (id && !seen.has(id)) {
                    arr.push({ id, nev: it?.olNev || olNevMap.get(id) || id, db: Number(it?.csirkeDb) || 0 });
                    seen.add(id);
                }
            }
        }
        return arr;
    }, [olak, deployOlMap, turnus?.id, olNevMap]);

    const totalActiveCount = useMemo(() => {
        let totalStart = 0;
        let totalDead = 0;
        rowsActive.forEach(r => {
            const start = Number(r.db) || 0;
            const dead = activeBarnMortality[r.id] || 0;
            totalStart += start;
            totalDead += dead;
        });
        return totalStart - totalDead;
    }, [rowsActive, activeBarnMortality]);

    const selectedPast = useMemo(() => pastTurnusok.find((t) => t.id === selectedPastId) || null, [pastTurnusok, selectedPastId]);
    const startTotalPast = useMemo(() => selectedPast?.deploy?.osszesCsirke || 0, [selectedPast]);

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto pb-24">

            <Card className="border-none shadow-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />

                <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                    <div className="space-y-1">
                        <CardTitle className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                            {turnus ? <CheckCircle2 className="h-8 w-8 text-emerald-300" /> : <XCircle className="h-8 w-8 text-white/50" />}
                            {title}
                        </CardTitle>
                        <CardDescription className="text-emerald-100 text-lg font-medium">
                            {turnus ? t("batch.start_date", { date: createdAtStr }) : "Jelenleg nincs aktív állomány a telepen."}
                        </CardDescription>
                    </div>

                    <div className="flex gap-3">
                        {turnus ? (
                            canManage && (
                                <Button variant="destructive" size="lg" onClick={doClose} className="shadow-lg border-2 border-red-400 hover:border-red-300 font-bold">
                                    <XCircle className="mr-2 h-5 w-5" /> {t("batch.close_btn")}
                                </Button>
                            )
                        ) : (
                            canManage && (
                                <Button onClick={startNew} size="lg" className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold shadow-lg">
                                    <Play className="mr-2 h-5 w-5" /> {t("batch.start_new_btn")}
                                </Button>
                            )
                        )}
                    </div>
                </CardHeader>

                {turnus && (
                    <CardContent className="relative z-10 mt-4">
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-emerald-50 uppercase tracking-widest text-sm flex items-center gap-2">
                                    <Warehouse className="w-4 h-4" /> Aktuális Állomány (Összesített)
                                </h3>
                                <Badge className="bg-white text-emerald-800 hover:bg-emerald-100 font-mono text-base px-3 py-1 border-0 shadow-md">
                                    {totalActiveCount.toLocaleString()} db
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {rowsActive.filter(r => r.db !== null).map(r => {
                                    const startCount = Number(r.db) || 0;
                                    const deadCount = activeBarnMortality[r.id] || 0;
                                    const currentCount = Math.max(0, startCount - deadCount);

                                    return (
                                        <div key={r.id} className="flex flex-col justify-between p-3 bg-black/20 rounded-lg border border-white/10 hover:bg-black/30 transition-colors h-full">
                                            <span className="text-xs text-emerald-200 font-bold uppercase mb-2">{r.nev}</span>

                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-xs text-emerald-100/60">
                                                    <span>Kezdő:</span>
                                                    <span className="line-through decoration-red-400/50 decoration-1">{startCount.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-center border-t border-white/10 pt-1">
                                                    <span className="text-xs text-white font-medium">Most:</span>
                                                    <span className="text-lg font-black text-white">{currentCount.toLocaleString()}</span>
                                                </div>
                                                {deadCount > 0 && (
                                                    <div className="text-[10px] text-right text-red-300 font-medium">
                                                        -{deadCount} elhullás
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                <div className="lg:col-span-4 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="bg-slate-200 p-2 rounded-lg"><Archive className="h-5 w-5 text-slate-600" /></div>
                            <h2 className="text-xl font-bold text-slate-800">{t("batch.past_title")}</h2>
                        </div>

                        {canManage && pastTurnusok.length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => { setIsExportOpen(true); setExportStep(1); setCustomLogo(null); }} className="gap-2 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm">
                                <FileDown className="h-4 w-4" /> Exportálás
                            </Button>
                        )}
                    </div>

                    <Card className="border shadow-sm max-h-[700px] overflow-hidden flex flex-col bg-white">
                        <div className="overflow-y-auto p-2 space-y-2 flex-1 bg-slate-50/50">
                            {pastTurnusok.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground text-sm italic">{t("batch.no_past")}</div>
                            ) : (
                                pastTurnusok.map(pt => {
                                    const isActive = selectedPastId === pt.id;
                                    return (
                                        <div
                                            key={pt.id}
                                            onClick={() => setSelectedPastId(pt.id)}
                                            className={cn(
                                                "group cursor-pointer rounded-xl p-4 border-2 transition-all duration-200 relative overflow-hidden",
                                                isActive
                                                    ? "bg-white border-indigo-500 shadow-md scale-[1.02] z-10"
                                                    : "bg-white border-transparent hover:border-slate-300 hover:shadow-sm"
                                            )}
                                        >
                                            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500" />}

                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className={cn("font-bold text-base", isActive ? "text-indigo-700" : "text-slate-700")}>
                                                        {pt.turnusId || pt.id}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        {formatTS(pt.createdAt)}
                                                    </div>
                                                </div>
                                                <ChevronRight className={cn("w-5 h-5 text-slate-300 transition-transform", isActive && "rotate-90 text-indigo-500")} />
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-8">
                    {selectedPast ? (
                        <Card className="h-full shadow-lg border-t-4 border-t-indigo-500 bg-white animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CardHeader className="border-b bg-slate-50/50 pb-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-2xl text-slate-800 flex items-center gap-2">
                                            <FolderOpen className="w-6 h-6 text-indigo-500" />
                                            {selectedPast.turnusId}
                                        </CardTitle>
                                        <CardDescription className="mt-1 flex items-center gap-2">
                                            {pastDetailsLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
                                            Részletes adatok és naplók
                                        </CardDescription>
                                    </div>
                                    <Badge variant="outline" className="text-xs font-mono bg-slate-100 text-slate-500">
                                        ID: {selectedPast.id}
                                    </Badge>
                                </div>
                            </CardHeader>

                            <CardContent className="p-0">
                                <Tabs defaultValue="summary" className="w-full">
                                    <div className="px-6 pt-4">
                                        <TabsList className="grid w-full grid-cols-3 h-12 bg-slate-100 p-1 rounded-lg">
                                            <TabsTrigger value="summary" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-semibold">Összesítő</TabsTrigger>
                                            <TabsTrigger value="mortality" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm font-semibold">Elhullási Napló</TabsTrigger>
                                            <TabsTrigger value="weights" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold">Mérési Napló</TabsTrigger>
                                        </TabsList>
                                    </div>

                                    <div className="p-6 bg-white min-h-[400px]">

                                        <TabsContent value="summary" className="mt-0 space-y-6 animate-in fade-in zoom-in-95">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 bg-blue-100 w-20 h-20 rounded-bl-full -mr-10 -mt-10 opacity-50" />
                                                    <div className="p-3 bg-blue-100 rounded-full text-blue-600 mb-3 shadow-sm"><Warehouse className="w-6 h-6" /></div>
                                                    <div className="text-xs font-bold uppercase text-blue-400 tracking-wider">Induló Létszám</div>
                                                    <div className="text-4xl font-black text-blue-700 mt-1">{startTotalPast.toLocaleString()}</div>
                                                    <div className="text-xs text-blue-400 mt-2 font-medium">Baromfi db</div>
                                                </div>

                                                <div className="bg-rose-50/50 rounded-2xl p-6 border border-rose-100 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 bg-rose-100 w-20 h-20 rounded-bl-full -mr-10 -mt-10 opacity-50" />
                                                    <div className="p-3 bg-rose-100 rounded-full text-rose-600 mb-3 shadow-sm"><Skull className="w-6 h-6" /></div>
                                                    <div className="text-xs font-bold uppercase text-rose-400 tracking-wider">Teljes Elhullás</div>
                                                    <div className="text-4xl font-black text-rose-700 mt-1">{pastMortalityTotal.toLocaleString()}</div>
                                                    <div className="text-sm text-rose-500 font-bold mt-2 bg-rose-100 px-3 py-0.5 rounded-full border border-rose-200">
                                                        {startTotalPast > 0 ? ((pastMortalityTotal / startTotalPast) * 100).toFixed(2) : "0.00"}% <span className="font-normal opacity-70">veszteség</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <h4 className="text-sm font-bold uppercase text-slate-400 tracking-wider border-b pb-2">Kezdő állomány részletezése</h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {selectedPast.deploy?.olak?.map((o, idx) => {
                                                        const initial = Number(o.csirkeDb) || 0;
                                                        const dead = barnMortalityTotals[o.olId || ""] || 0;
                                                        const current = Math.max(0, initial - dead);

                                                        return (
                                                            <div key={idx} className="flex flex-col p-3 bg-slate-50 rounded-lg border hover:bg-slate-100 transition-colors">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="font-bold text-slate-700">{o.olNev || o.olId}</span>
                                                                    <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">{initial}</Badge>
                                                                </div>
                                                                <div className="flex justify-between items-end">
                                                                    <span className="text-xs text-rose-500 font-medium">-{dead}</span>
                                                                    <span className="font-mono font-bold text-lg text-emerald-600">{current}</span>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="mortality" className="mt-0 animate-in fade-in zoom-in-95">
                                            {pastMortalityLog.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50/50">
                                                    <Skull className="w-10 h-10 mb-2 opacity-20" />
                                                    <p>Nincs rögzített elhullás ehhez a turnushoz.</p>
                                                </div>
                                            ) : (
                                                <div className="border rounded-xl overflow-hidden shadow-sm">
                                                    <Table>
                                                        <TableHeader className="bg-slate-100 sticky top-0 z-10">
                                                            <TableRow>
                                                                <TableHead className="w-[120px]">Dátum</TableHead>
                                                                <TableHead>Műszakos</TableHead>
                                                                {olak.map(o => (
                                                                    <TableHead key={o.id} className="text-center px-1 min-w-[50px] text-xs">{o.nev}</TableHead>
                                                                ))}
                                                                <TableHead className="text-right font-bold text-rose-700 bg-rose-50/50 w-[100px]">Össz.</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {pastMortalityLog.map((entry, idx) => (
                                                                <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                                                                    <TableCell className="font-mono text-xs whitespace-nowrap font-medium text-slate-600">{entry.date}</TableCell>
                                                                    <TableCell className="text-xs">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                                                {entry.operatorName.charAt(0).toUpperCase()}
                                                                            </div>
                                                                            {entry.operatorName}
                                                                        </div>
                                                                    </TableCell>
                                                                    {olak.map(o => (
                                                                        <TableCell key={o.id} className="text-center p-1 text-xs">
                                                                            {entry.barns[o.id] > 0 ? (
                                                                                <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border">{entry.barns[o.id]}</span>
                                                                            ) : <span className="text-slate-300">-</span>}
                                                                        </TableCell>
                                                                    ))}
                                                                    <TableCell className="text-right font-bold text-rose-600 bg-rose-50/30">
                                                                        {entry.total}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="weights" className="mt-0 animate-in fade-in zoom-in-95">
                                            {pastWeights.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50/50">
                                                    <Scale className="w-10 h-10 mb-2 opacity-20" />
                                                    <p>Nincs rögzített súlymérés.</p>
                                                </div>
                                            ) : (
                                                <div className="border rounded-xl overflow-hidden shadow-sm">
                                                    <Table>
                                                        <TableHeader className="bg-slate-100 sticky top-0 z-10">
                                                            <TableRow>
                                                                <TableHead className="w-[120px]">Dátum</TableHead>
                                                                <TableHead className="text-center w-[80px]">Kor</TableHead>
                                                                <TableHead>Ól</TableHead>
                                                                <TableHead className="text-right w-[100px]">Súly</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {pastWeights.map((w) => (
                                                                <TableRow key={w.id} className="hover:bg-slate-50">
                                                                    <TableCell className="font-mono text-xs font-medium text-slate-600">{w.date}</TableCell>
                                                                    <TableCell className="text-center">
                                                                        <Badge variant="secondary" className="font-mono text-xs font-normal">{w.ageInDays} nap</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="font-medium text-slate-700">{w.barnName}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                                                            {w.averageWeight.toFixed(3)} kg
                                                                        </span>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-slate-50/50 text-slate-400 min-h-[400px] gap-3">
                            <div className="p-4 bg-white rounded-full shadow-sm"><History className="w-8 h-8 text-slate-300" /></div>
                            <p className="font-medium">Válassz egy lezárt turnust a bal oldali listából a részletekhez.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- EXPORT DIALOG (WIZARD) --- */}
            <Dialog open={isExportOpen} onOpenChange={(open) => { if (!open) setIsExportOpen(false); }}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileDown className="h-5 w-5 text-indigo-600" /> PDF Exportálás
                        </DialogTitle>
                        <DialogDescription>
                            {exportStep === 1 ? "Válaszd ki a turnusokat!" : "Válassz adatokat az exporthoz!"}
                        </DialogDescription>
                    </DialogHeader>

                    {exportStep === 1 && (
                        <div className="py-2">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm text-muted-foreground">{selectedExportIds.length} kiválasztva</span>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedExportIds(pastTurnusok.map(p => p.id))} className="h-7 text-xs">
                                        <CheckSquare className="w-3 h-3 mr-1" /> Mind
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedExportIds([])} className="h-7 text-xs">
                                        <Square className="w-3 h-3 mr-1" /> Mégsem
                                    </Button>
                                </div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto border rounded-md p-2 space-y-1">
                                {pastTurnusok.map(pt => (
                                    <div key={pt.id} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded cursor-pointer" onClick={() => {
                                        if (selectedExportIds.includes(pt.id)) setSelectedExportIds(prev => prev.filter(id => id !== pt.id));
                                        else setSelectedExportIds(prev => [...prev, pt.id]);
                                    }}>
                                        <Checkbox checked={selectedExportIds.includes(pt.id)} />
                                        <label className="text-sm font-medium cursor-pointer flex-1">{pt.turnusId || pt.id}</label>
                                        <span className="text-xs text-muted-foreground">{formatTS(pt.closedAt)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {exportStep === 2 && (
                        <div className="py-4 space-y-4">
                            {/* LOGÓ FELTÖLTÉS */}
                            <div className="border rounded-lg p-3 bg-slate-50">
                                <Label className="text-sm font-bold flex items-center gap-2 mb-2">
                                    <ImageIcon className="w-4 h-4 text-indigo-500" /> Céges Logó (Opcionális)
                                </Label>
                                <div className="flex gap-3 items-center">
                                    <Input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs cursor-pointer file:text-indigo-600 file:font-bold" />
                                    {customLogo && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Betöltve</span>}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Ajánlott méret: 300x300px (négyzetes) vagy hasonló arány, max 2MB.
                                    A logó a PDF fejlécének bal felső sarkában fog megjelenni.
                                </p>
                            </div>

                            <Separator />

                            <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => setExportOptions(p => ({ ...p, info: !p.info }))}>
                                <Checkbox id="opt-info" checked={exportOptions.info} onCheckedChange={(c) => setExportOptions(p => ({ ...p, info: !!c }))} />
                                <Label htmlFor="opt-info" className="cursor-pointer flex-1">
                                    <div className="font-semibold">Alapadatok</div>
                                    <div className="text-xs text-muted-foreground">Kezdő létszám, záró létszám, veszteség %</div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => setExportOptions(p => ({ ...p, mortality: !p.mortality }))}>
                                <Checkbox id="opt-mortality" checked={exportOptions.mortality} onCheckedChange={(c) => setExportOptions(p => ({ ...p, mortality: !!c }))} />
                                <Label htmlFor="opt-mortality" className="cursor-pointer flex-1">
                                    <div className="font-semibold">Elhullási Napló</div>
                                    <div className="text-xs text-muted-foreground">Részletes napi elhullás ólanként</div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => setExportOptions(p => ({ ...p, weights: !p.weights }))}>
                                <Checkbox id="opt-weights" checked={exportOptions.weights} onCheckedChange={(c) => setExportOptions(p => ({ ...p, weights: !!c }))} />
                                <Label htmlFor="opt-weights" className="cursor-pointer flex-1">
                                    <div className="font-semibold">Mérési Napló</div>
                                    <div className="text-xs text-muted-foreground">Súlymérések, FCR, átlagok</div>
                                </Label>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {exportStep === 2 && <Button variant="ghost" onClick={() => setExportStep(1)}>Vissza</Button>}
                        {exportStep === 1 ? (
                            <Button onClick={() => setExportStep(2)} disabled={selectedExportIds.length === 0}>Tovább</Button>
                        ) : (
                            <Button onClick={handleExportPDF} disabled={isExporting} className="bg-indigo-600 hover:bg-indigo-700">
                                {isExporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generálás...</> : <><FileText className="w-4 h-4 mr-2" /> PDF Generálása</>}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
