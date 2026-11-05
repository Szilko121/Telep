import { useEffect, useState, useMemo, useRef } from "react";
import {
    getDocs,
    query,
    orderBy,
    where,
    // collection, -> JAVÍTVA: Törölve, mert farmCollection-t használunk
} from "firebase/firestore";
import { waitForAuth } from "@/lib/firebase"; // db -> JAVÍTVA: Törölve, nem kell közvetlenül
import { farmCollection } from "@/lib/farmDb"; // <--- ÚJ IMPORT: farmCollection
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/services/permissionsService";
import { useAuth } from "@/contexts/AuthContext";
import {
    CalendarDays, Users, Skull, FileText,
    Download, Search, TrendingUp, AlertTriangle,
    ArrowUpDown, Check, SortAsc, SortDesc
} from "lucide-react";
import { cn } from "@/lib/utils";

// PDF importok
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// --- TÍPUSOK ---
type TurnusInfo = {
    id: string;
    turnusId: string;
    active: boolean;
    startDate?: string;
};

type DayRecord = {
    id: string;
    date: string;
    operatorName: string;
    elhulas: Record<string, number>;
    total: number;
};

type OlInfo = { id: string; nev: string };

// Rendezési típusok
type SortKey = 'date' | 'operatorName' | 'total';
type SortDirection = 'asc' | 'desc';

type SortConfig = {
    key: SortKey;
    direction: SortDirection;
};

export default function ElhulasokPage() {
    const { t, language } = useLanguage();
    const { user } = useAuth();
    const { isRouteAllowed } = usePermissions();
    const [loading, setLoading] = useState(true);
    const [turnusok, setTurnusok] = useState<TurnusInfo[]>([]);
    const [selectedTurnusId, setSelectedTurnusId] = useState<string>("");

    const [daysData, setDaysData] = useState<DayRecord[]>([]);
    const [olak, setOlak] = useState<OlInfo[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    // RENDEZÉS STATE
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

    // Click outside kezeléshez
    const sortMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
                setIsSortMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // --- ADATBETÖLTÉS ---
    useEffect(() => {
        (async () => {
            try {
                await waitForAuth();

                // JAVÍTVA: farmCollection használata
                const olakSnap = await getDocs(farmCollection("olak"));
                const loadedOlak = olakSnap.docs.map(d => ({ id: d.id, nev: d.data().nev || d.id }));
                loadedOlak.sort((a, b) => a.nev.localeCompare(b.nev, undefined, { numeric: true }));
                setOlak(loadedOlak);

                // JAVÍTVA: farmCollection használata
                const tSnap = await getDocs(query(farmCollection("turnusok"), orderBy("createdAt", "desc")));
                const loadedTurnusok = tSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        turnusId: data.turnusId || d.id,
                        active: data.active || false,
                        startDate: data.deploy?.betelepitesDatum
                    };
                });
                setTurnusok(loadedTurnusok);

                const active = loadedTurnusok.find(t => t.active);
                if (active) setSelectedTurnusId(active.id);
                else if (loadedTurnusok.length > 0) setSelectedTurnusId(loadedTurnusok[0].id);

            } catch (e) { console.error(e); }
        })();
    }, []);

    // --- NAPLÓ BETÖLTÉSE ---
    useEffect(() => {
        if (!selectedTurnusId) return;

        (async () => {
            setLoading(true);
            try {
                // JAVÍTVA: farmCollection használata algyűjteményhez (template stringgel)
                const daysRef = farmCollection(`turnusok/${selectedTurnusId}/muszakBeosztasDays`);
                const q = query(daysRef, where("elhulasSaved", "==", true));
                const snap = await getDocs(q);

                const records: DayRecord[] = snap.docs.map(doc => {
                    const data = doc.data();
                    let dayTotal = 0;
                    if (data.elhulas) {
                        Object.values(data.elhulas).forEach((v: any) => dayTotal += Number(v) || 0);
                    }
                    return {
                        id: doc.id,
                        date: data.date,
                        operatorName: data.operator?.displayName || data.operator?.nev || "Ismeretlen",
                        elhulas: data.elhulas || {},
                        total: dayTotal
                    };
                });

                setDaysData(records);

            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, [selectedTurnusId]);

    // --- RENDEZÉS BEÁLLÍTÁSA ---
    const handleSortSelect = (key: SortKey, direction: SortDirection) => {
        setSortConfig({ key, direction });
        setIsSortMenuOpen(false);
    };

    // --- SZÁMÍTÁSOK & SZŰRÉS & RENDEZÉS ---
    const processedData = useMemo(() => {
        // 1. Szűrés
        let data = daysData.filter(d =>
            d.operatorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.date.includes(searchTerm)
        );

        // 2. Rendezés
        if (sortConfig.key) {
            data.sort((a, b) => {
                if (sortConfig.key === 'total') {
                    // Szám szerinti rendezés
                    return sortConfig.direction === 'asc'
                        ? a.total - b.total
                        : b.total - a.total;
                } else {
                    // Szöveg/Dátum szerinti rendezés
                    const valA = a[sortConfig.key];
                    const valB = b[sortConfig.key];
                    return sortConfig.direction === 'asc'
                        ? valA.localeCompare(valB)
                        : valB.localeCompare(valA);
                }
            });
        }

        return data;
    }, [daysData, searchTerm, sortConfig]);

    const stats = useMemo(() => {
        const total = processedData.reduce((acc, curr) => acc + curr.total, 0);
        const days = processedData.length;
        const avg = days > 0 ? Math.round(total / days) : 0;
        const max = Math.max(...processedData.map(d => d.total), 0);
        return { total, days, avg, max };
    }, [processedData]);

    const selectedTurnusInfo = turnusok.find(t => t.id === selectedTurnusId);

    // --- PDF EXPORT ---
    const handleExportPDF = () => {
        if (processedData.length === 0) {
            alert(t("mortality.no_export_data"));
            return;
        }

        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(t("mortality.pdf_title"), 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`${t("mortality.pdf_turnus")}: ${selectedTurnusInfo?.turnusId || "-"}`, 14, 30);
        const genDate = new Date().toLocaleDateString(language === 'hu' ? "hu-HU" : "en-US");
        doc.text(`${t("mortality.pdf_generated")}: ${genDate}`, 14, 36);

        const tableHead = [[t("mortality.col_date"), t("mortality.col_operator"), ...olak.map(o => o.nev), t("mortality.col_total")]];
        const tableBody = processedData.map(day => [
            day.date,
            day.operatorName,
            ...olak.map(ol => day.elhulas[ol.id] || "-"),
            day.total
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 45,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            columnStyles: {
                0: { fontStyle: 'bold' },
                [tableHead[0].length - 1]: { fontStyle: 'bold', textColor: [220, 53, 69] }
            }
        });

        doc.save(`mortality_${selectedTurnusInfo?.turnusId}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const getHeatmapColor = (val: number, max: number) => {
        if (!val || val === 0) return "bg-transparent";
        const intensity = Math.min(val / (max || 1), 1);
        if (intensity < 0.1) return "bg-red-50 text-slate-600";
        if (intensity < 0.3) return "bg-red-100 text-red-800";
        if (intensity < 0.6) return "bg-red-200 text-red-900 font-bold";
        return "bg-red-300 text-red-950 font-bold border border-red-400";
    };

    return (
        <div className="p-4 md:p-8 min-h-screen bg-slate-50/50 space-y-8 pb-24">

            {/* --- FEJLÉC --- */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{t("mortality.title")}</h1>
                    <p className="text-muted-foreground mt-1 text-lg">{t("mortality.subtitle")}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto items-center">
                    {/* KERESÉS */}
                    <div className="relative flex-1 w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={t("mortality.search_placeholder")}
                            className="pl-9 bg-white border-slate-300"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* TURNUS VÁLASZTÓ */}
                    <Select value={selectedTurnusId} onValueChange={setSelectedTurnusId}>
                        <SelectTrigger className="w-full sm:w-56 bg-white border-slate-300 shadow-sm">
                            <SelectValue placeholder={t("mortality.select_turnus")} />
                        </SelectTrigger>
                        <SelectContent>
                            {turnusok.map(turnusItem => (
                                <SelectItem key={turnusItem.id} value={turnusItem.id} className="cursor-pointer">
                                    <span className="font-medium">{turnusItem.turnusId}</span>
                                    {turnusItem.active ? (
                                        <Badge className="ml-2 bg-emerald-600">{t("dashboard.status.active")}</Badge>
                                    ) : (
                                        <span className="ml-2 text-xs text-muted-foreground">({t("deploy.closed_badge")})</span>
                                    )}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* RENDEZÉS */}
                    <div className="relative" ref={sortMenuRef}>
                        <Button variant="outline" onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} className="w-full sm:w-auto bg-white border-slate-300 text-slate-700 gap-2 shadow-sm">
                            <ArrowUpDown className="h-4 w-4" /> {t("mortality.sort_btn")}
                        </Button>

                        {isSortMenuOpen && (
                            <Card className="absolute top-full right-0 mt-2 w-64 z-50 shadow-xl border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                                <CardHeader className="pb-2 p-3 border-b bg-slate-50">
                                    <CardTitle className="text-sm font-bold text-slate-700">{t("mortality.sort_title")}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 grid gap-1">
                                    <button onClick={() => handleSortSelect('date', 'desc')} className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors hover:bg-slate-100 text-left", sortConfig.key === 'date' && sortConfig.direction === 'desc' && "bg-blue-50 text-blue-700")}>
                                        <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {t("mortality.sort_date_desc")}</span>
                                        {sortConfig.key === 'date' && sortConfig.direction === 'desc' && <Check className="h-4 w-4" />}
                                    </button>
                                    <button onClick={() => handleSortSelect('date', 'asc')} className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors hover:bg-slate-100 text-left", sortConfig.key === 'date' && sortConfig.direction === 'asc' && "bg-blue-50 text-blue-700")}>
                                        <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {t("mortality.sort_date_asc")}</span>
                                        {sortConfig.key === 'date' && sortConfig.direction === 'asc' && <Check className="h-4 w-4" />}
                                    </button>

                                    <div className="my-1 border-t border-slate-100" />

                                    <button onClick={() => handleSortSelect('total', 'desc')} className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors hover:bg-slate-100 text-left", sortConfig.key === 'total' && sortConfig.direction === 'desc' && "bg-blue-50 text-blue-700")}>
                                        <span className="flex items-center gap-2"><SortDesc className="h-4 w-4" /> {t("mortality.sort_total_desc")}</span>
                                        {sortConfig.key === 'total' && sortConfig.direction === 'desc' && <Check className="h-4 w-4" />}
                                    </button>
                                    <button onClick={() => handleSortSelect('total', 'asc')} className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors hover:bg-slate-100 text-left", sortConfig.key === 'total' && sortConfig.direction === 'asc' && "bg-blue-50 text-blue-700")}>
                                        <span className="flex items-center gap-2"><SortAsc className="h-4 w-4" /> {t("mortality.sort_total_asc")}</span>
                                        {sortConfig.key === 'total' && sortConfig.direction === 'asc' && <Check className="h-4 w-4" />}
                                    </button>

                                    <div className="my-1 border-t border-slate-100" />

                                    <button onClick={() => handleSortSelect('operatorName', 'asc')} className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors hover:bg-slate-100 text-left", sortConfig.key === 'operatorName' && sortConfig.direction === 'asc' && "bg-blue-50 text-blue-700")}>
                                        <span className="flex items-center gap-2"><Users className="h-4 w-4" /> {t("mortality.sort_operator")}</span>
                                        {sortConfig.key === 'operatorName' && sortConfig.direction === 'asc' && <Check className="h-4 w-4" />}
                                    </button>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* PDF EXPORT GOMB */}
                    {isRouteAllowed(user?.role, "/elhulasok#pdf_export") && (
                        <Button variant="outline" onClick={handleExportPDF} className="w-full sm:w-auto bg-white border-slate-300 text-slate-700 hover:bg-slate-100 gap-2 shadow-sm">
                            <Download className="h-4 w-4" /> {t("mortality.export_btn")}
                        </Button>
                    )}
                </div>
            </div>

            {/* --- STATISZTIKA --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-red-500 shadow-sm bg-white hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Skull className="h-4 w-4 text-red-500" /> {t("mortality.stat_total")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{loading ? "..." : stats.total.toLocaleString()} db</div>
                        <p className="text-xs text-muted-foreground mt-1">{t("mortality.stat_total_sub")}</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-orange-500 shadow-sm bg-white hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4 text-orange-500" /> {t("mortality.stat_avg")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{loading ? "..." : stats.avg.toLocaleString()} db</div>
                        <p className="text-xs text-muted-foreground mt-1">{t("mortality.stat_avg_sub")}</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-blue-500 shadow-sm bg-white hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-500" /> {t("mortality.stat_days")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{loading ? "..." : stats.days} <span className="text-lg font-normal text-muted-foreground">{t("dashboard.day_nth")}</span></div>
                        <p className="text-xs text-muted-foreground mt-1">{t("mortality.stat_days_sub")}</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-violet-500 shadow-sm bg-white hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-violet-500" /> {t("mortality.stat_max")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{loading ? "..." : stats.max} db</div>
                        <p className="text-xs text-muted-foreground mt-1">{t("mortality.stat_max_sub")}</p>
                    </CardContent>
                </Card>
            </div>

            {/* --- ADAT TÁBLÁZAT --- */}
            <Card className="shadow-lg border-slate-200 overflow-hidden">
                <CardHeader className="bg-white border-b pb-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5 text-primary" /> {t("mortality.table_title")}</CardTitle>
                            <CardDescription>{t("mortality.table_desc")}</CardDescription>
                        </div>
                        <Badge variant="secondary" className="text-xs">{t("mortality.results_count", { count: processedData.length })}</Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[600px]">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-[140px] font-bold text-slate-900 bg-slate-50">{t("mortality.col_date")}</TableHead>
                                    <TableHead className="min-w-[160px] font-bold text-slate-900 bg-slate-50">{t("mortality.col_operator")}</TableHead>
                                    {olak.map(ol => (
                                        <TableHead key={ol.id} className="text-center font-semibold text-slate-700 min-w-[80px] border-l border-slate-200/60 bg-slate-50">
                                            {ol.nev}
                                        </TableHead>
                                    ))}
                                    <TableHead className="text-right font-bold text-red-700 bg-red-50/80 border-l border-red-100 w-[140px] sticky right-0 shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.1)]">{t("mortality.col_total")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}><TableCell><Skeleton className="h-5 w-24" /></TableCell><TableCell><Skeleton className="h-5 w-32" /></TableCell>{olak.map(ol => <TableCell key={ol.id}><Skeleton className="h-8 w-10 mx-auto" /></TableCell>)}<TableCell><Skeleton className="h-6 w-16 ml-auto" /></TableCell></TableRow>
                                    ))
                                ) : processedData.length === 0 ? (
                                    <TableRow><TableCell colSpan={olak.length + 3} className="h-32 text-center text-muted-foreground">{t("mortality.no_data")}</TableCell></TableRow>
                                ) : (
                                    processedData.map((day) => (
                                        <TableRow key={day.id} className="hover:bg-slate-50/80 transition-colors group">
                                            <TableCell className="font-medium font-mono text-slate-600 whitespace-nowrap">{day.date}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="bg-indigo-100 text-indigo-700 p-1.5 rounded-full shrink-0"><Users className="h-3.5 w-3.5" /></div>
                                                    <span className="font-medium truncate max-w-[140px]">{day.operatorName}</span>
                                                </div>
                                            </TableCell>

                                            {olak.map(ol => {
                                                const val = day.elhulas[ol.id] || 0;
                                                const maxInCol = Math.max(...processedData.map(d => d.elhulas[ol.id] || 0), 1);
                                                return (
                                                    <TableCell key={ol.id} className={cn("text-center border-l border-slate-100 p-1")}>
                                                        <div className={cn("rounded-md py-1.5 px-1 mx-auto w-full max-w-[60px] transition-all", getHeatmapColor(val, maxInCol))}>
                                                            {val > 0 ? val : <span className="text-slate-300/50">-</span>}
                                                        </div>
                                                    </TableCell>
                                                );
                                            })}

                                            <TableCell className="text-right bg-white group-hover:bg-slate-50 sticky right-0 border-l border-slate-200 shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.05)]">
                                                <div className="flex flex-col items-end justify-center">
                                                    <span className="font-bold text-red-700 text-lg">{day.total}</span>
                                                    <div className="w-full h-1 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${Math.min((day.total / stats.max) * 100, 100)}%` }} /></div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
