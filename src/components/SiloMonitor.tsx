import { SiloData } from "@/services/integrationService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wheat, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- ÚJ IMPORT

interface SiloMonitorProps {
    data: SiloData[];
    loading: boolean;
    lastUpdate: Date | null;
    onRefresh: () => void;
}

export function SiloMonitor({ data, loading, lastUpdate, onRefresh }: SiloMonitorProps) {
    const { t, language } = useLanguage(); // <--- NYELVI HOOK

    if (!data || data.length === 0) return null;

    return (
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-md">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
                    <Wheat className="h-5 w-5 text-amber-600" /> {t("integration.silo.monitor_title")}
                </CardTitle>
                <button 
                    onClick={onRefresh} 
                    disabled={loading}
                    className={cn("p-1 rounded-full hover:bg-amber-200/50 transition-all", loading && "animate-spin")}
                >
                    <RefreshCw className="h-4 w-4 text-amber-700" />
                </button>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    {data.map((silo) => (
                        <div key={silo.id} className="bg-white/60 p-3 rounded-lg border border-amber-100 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-2 z-10 relative">
                                {/* Használjuk a már létező siló címke fordítást */}
                                <span className="font-bold text-amber-950">
                                    {t("integration.feed.silo_label", { id: silo.id })}
                                </span>
                                
                                {silo.status === 'critical' && (
                                    <span className="flex items-center text-xs font-bold text-red-600 animate-pulse">
                                        <AlertTriangle className="h-3 w-3 mr-1" /> {t("integration.silo.critical_badge")}
                                    </span>
                                )}
                                {silo.status === 'low' && (
                                    <span className="text-xs font-bold text-orange-600">
                                        {t("integration.silo.low_badge")}
                                    </span>
                                )}
                            </div>
                            
                            <div className="relative h-32 w-full bg-slate-200 rounded-md overflow-hidden border border-slate-300">
                                {/* Siló tartalom vizualizáció */}
                                <div 
                                    className={cn(
                                        "absolute bottom-0 w-full transition-all duration-1000 ease-in-out opacity-80",
                                        silo.status === 'critical' ? "bg-red-500" : 
                                        silo.status === 'low' ? "bg-orange-400" : "bg-amber-400"
                                    )}
                                    style={{ height: `${silo.percentage}%` }}
                                >
                                    {/* Textúra effekt */}
                                    <div className="w-full h-full opacity-30 bg-[url('https://www.transparenttextures.com/patterns/diagonal-noise.png')]"></div>
                                </div>

                                {/* Százalék középen */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center drop-shadow-md">
                                    <span className="text-xl font-black text-slate-800">{Math.round(silo.percentage)}%</span>
                                    <span className="text-xs font-semibold text-slate-700 bg-white/50 px-1 rounded">
                                        {silo.currentWeight.toLocaleString()} kg
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="text-[10px] text-right text-amber-700/60 mt-2">
                    {t("integration.silo.updated")}: {lastUpdate ? lastUpdate.toLocaleTimeString(language === 'hu' ? 'hu-HU' : 'en-US') : "-"}
                </div>
            </CardContent>
        </Card>
    );
}
