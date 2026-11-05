import { useEffect, useState, useMemo } from "react";
import { waitForAuth } from "@/lib/firebase";
import { 
  getIntegrationSettings, 
  fetchSiloData, 
  fetchOpticonData, 
  type IntegrationConfig, 
  type SiloData, 
  type ClimateData 
} from "@/services/integrationService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { 
  Activity, Wind, WifiOff, Thermometer, Droplets, 
  AlertTriangle, RefreshCw, TrendingUp, TrendingDown, 
  Fan, Flame, Signal, Droplet, Sun, Truck,
  History as HistoryIcon 
} from "lucide-react";
import { SiloMonitor } from "@/components/SiloMonitor";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- ÚJ IMPORT

// Kis grafikon komponens
const SimpleLineChart = ({ data, color = "#3b82f6", height = 40 }: { data: number[], color?: string, height?: number }) => {
    if (!data.length) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((val - min) / range) * 100;
        return `${x},${y}`;
    }).join(" ");
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
            <polyline fill="none" stroke={color} strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        </svg>
    );
};

export default function IntegraciokPage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage(); // <--- NYELVI HOOK
  
  const [intConfig, setIntConfig] = useState<IntegrationConfig | null>(null);
  const [siloData, setSiloData] = useState<SiloData[]>([]);
  const [climateData, setClimateData] = useState<ClimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [controls, setControls] = useState({ fan: true, cooling: false, misting: false });

  // 1. Inicializálás
  useEffect(() => {
    let mounted = true;
    (async () => {
      await waitForAuth();
      if(mounted) setIsAuthReady(true);
      
      const cfg = await getIntegrationSettings();
      if(mounted) setIntConfig(cfg);
      
      // Kezdő adat a grafikonhoz
      setTempHistory(Array.from({length: 10}, () => 24 + Math.random() * 2));
    })();
    return () => { mounted = false; };
  }, []);

  // 2. Adatbetöltés
  const loadIntegrations = async () => {
      if (!intConfig) return;
      setLoading(true);
      try {
          const [sData, cData] = await Promise.all([
             fetchSiloData(intConfig.rainbow, intConfig.useSimulation),
             fetchOpticonData(intConfig.opticon, intConfig.useSimulation)
          ]);
          
          setSiloData(sData);
          setClimateData(cData);
          setLastUpdate(new Date());

          // Grafikon frissítése
          if(cData) {
              setTempHistory(prev => {
                  const shift = [...prev.slice(1), cData.tempInside];
                  return shift;
              });
          }
      } catch(e) {
          console.error(e);
          toast({title: t("integration.error_update"), variant: "destructive"});
      } finally {
          setLoading(false);
      }
  };

  // 3. Automata frissítés
  useEffect(() => {
      if (intConfig && (intConfig.rainbow.enabled || intConfig.opticon.enabled)) {
          loadIntegrations();
          const interval = setInterval(loadIntegrations, 30000); 
          return () => clearInterval(interval);
      }
  }, [intConfig]);

  const toggleControl = (key: keyof typeof controls) => {
      const newState = !controls[key];
      setControls(p => ({...p, [key]: newState}));
      
      let deviceName = "";
      if (key === 'fan') deviceName = t("integration.toast_fan");
      if (key === 'cooling') deviceName = t("integration.toast_cooling");
      if (key === 'misting') deviceName = t("integration.toast_misting");

      toast({
          title: t("integration.toast_cmd_sent"),
          description: `${deviceName} ${newState ? t("integration.toast_on") : t("integration.toast_off")}`,
          className: "bg-slate-900 text-white border-slate-700"
      });
  };

  // RIASZTÁSOK
  const alerts = useMemo(() => {
      const list = [];
      if (climateData) {
          if (climateData.tempInside > 30) list.push({ type: 'critical', msg: t("integration.alert.hot") });
          else if (climateData.tempInside < 20) list.push({ type: 'warning', msg: t("integration.alert.cold") });
          
          if (climateData.waterFlow < 5) list.push({ type: 'warning', msg: t("integration.alert.water") });
      }
      siloData.forEach(s => {
          if (s.status === 'critical') list.push({ type: 'critical', msg: t("integration.alert.silo_empty", { id: s.id }) });
      });
      return list;
  }, [climateData, siloData, t]);

  if (!isAuthReady) return <div className="flex h-screen items-center justify-center"><RefreshCw className="animate-spin mr-2"/> {t("common.loading")}</div>;

  const hasAnyIntegration = intConfig?.rainbow.enabled || intConfig?.opticon.enabled;

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-4 md:px-6">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 border-b pb-6 bg-gradient-to-r from-background to-muted/20 -mx-6 px-6 pt-4 mb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
                    <Activity className="h-8 w-8 text-blue-600" /> {t("integration.title")}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm font-medium">
                    {t("integration.subtitle")}
                </p>
            </div>
            
            <div className="flex items-center gap-3 bg-card border rounded-full px-4 py-1.5 shadow-sm">
                 <div className="flex items-center gap-2">
                     <Signal className={cn("h-4 w-4", loading ? "text-yellow-500" : "text-emerald-500")} />
                     <span className="text-xs font-bold text-muted-foreground uppercase">{t("integration.connection")}:</span>
                     <span className="text-sm font-bold text-foreground">{loading ? t("integration.status_sync") : t("integration.status_live")}</span>
                 </div>
                 <div className="h-4 w-[1px] bg-border mx-1" />
                 <span className="text-xs text-muted-foreground">
                    {lastUpdate?.toLocaleTimeString(language === 'hu' ? 'hu-HU' : 'en-US') || "--:--"}
                 </span>
                 <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={loadIntegrations} disabled={loading}>
                     <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                 </Button>
            </div>
        </div>

        {/* RIASZTÁSI SÁV */}
        {alerts.length > 0 && (
            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                {alerts.map((alert, idx) => (
                    <div key={idx} className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-md border shadow-sm",
                        alert.type === 'critical' ? "bg-red-50 border-red-200 text-red-800" : "bg-orange-50 border-orange-200 text-orange-800"
                    )}>
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <span className="font-bold">{alert.msg}</span>
                    </div>
                ))}
            </div>
        )}
      </div>

      {!hasAnyIntegration ? (
          <Card className="border-dashed border-2 bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 bg-muted rounded-full mb-4">
                      <WifiOff className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">{t("integration.no_int_title")}</h3>
                  <Button onClick={() => navigate("/settings")} className="mt-4">{t("integration.settings_btn")}</Button>
              </CardContent>
          </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:w-[400px] h-11">
                <TabsTrigger value="overview">{t("integration.tab.overview")}</TabsTrigger>
                <TabsTrigger value="climate" disabled={!intConfig?.opticon.enabled}>{t("integration.tab.climate")}</TabsTrigger>
                <TabsTrigger value="feed" disabled={!intConfig?.rainbow.enabled}>{t("integration.tab.feed")}</TabsTrigger>
            </TabsList>

            {/* --- ÁTTEKINTÉS TAB --- */}
            <TabsContent value="overview" className="space-y-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    
                    {/* HŐMÉRSÉKLET KÁRTYA */}
                    {intConfig?.opticon.enabled && climateData && (
                        <Card className="border-l-4 border-sky-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-muted-foreground flex justify-between">
                                    <span>{t("integration.card.inner_temp")}</span>
                                    <Thermometer className="h-4 w-4 text-sky-500" />
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-end justify-between">
                                    <div className="text-3xl font-bold">{climateData.tempInside.toFixed(1)}°C</div>
                                    <Badge variant={climateData.tempInside > 28 ? "destructive" : "secondary"}>
                                        {climateData.tempInside > 28 ? t("integration.card.hot") : t("integration.card.ok")}
                                    </Badge>
                                </div>
                                <div className="mt-4 h-10 w-full">
                                    <SimpleLineChart data={tempHistory} color="#0ea5e9" />
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        {tempHistory[tempHistory.length-1] > tempHistory[tempHistory.length-2] ? <TrendingUp className="h-3 w-3 text-red-500"/> : <TrendingDown className="h-3 w-3 text-blue-500"/>}
                                        {t("integration.card.trend")}
                                    </p>
                                    <p className="text-xs font-bold text-sky-700 flex items-center gap-1">
                                        <Sun className="h-3 w-3" /> {t("integration.card.outside")}: {climateData.tempOutside.toFixed(1)}°C
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* SZELLŐZÉS & VÍZ KÁRTYA */}
                    {intConfig?.opticon.enabled && climateData && (
                        <Card className="border-l-4 border-indigo-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-muted-foreground flex justify-between">
                                    <span>{t("integration.card.systems")}</span>
                                    <Fan className="h-4 w-4 text-indigo-500" />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span>{t("integration.card.vent_level")}</span>
                                        <span className="font-bold">{climateData.ventilationLevel}%</span>
                                    </div>
                                    <Progress value={climateData.ventilationLevel} className="h-2 bg-indigo-100 [&>div]:bg-indigo-500" />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="bg-blue-50 p-2 rounded border border-blue-100">
                                        <div className="text-[10px] uppercase text-blue-600 font-bold mb-1 flex items-center gap-1"><Droplet className="h-3 w-3"/> {t("integration.card.water_flow")}</div>
                                        <div className="text-xl font-bold text-blue-900">{climateData.waterFlow} <span className="text-xs font-normal">l/h</span></div>
                                    </div>
                                    <div className={cn("p-2 rounded border", climateData.heatingStatus ? "bg-orange-50 border-orange-100" : "bg-slate-50 border-slate-100")}>
                                        <div className="text-[10px] uppercase text-slate-600 font-bold mb-1 flex items-center gap-1"><Flame className={cn("h-3 w-3", climateData.heatingStatus && "text-orange-500 fill-orange-500")}/> {t("integration.card.heating")}</div>
                                        <div className="text-sm font-bold">{climateData.heatingStatus ? t("integration.opticon.active") : t("integration.opticon.inactive")}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* SILÓ ÖSSZESÍTŐ */}
                    {intConfig?.rainbow.enabled && siloData.length > 0 && (
                        <Card className="border-l-4 border-amber-500 shadow-md md:col-span-2 lg:col-span-1">
                             <CardHeader className="pb-2">
                                <CardTitle className="text-base text-muted-foreground flex justify-between">
                                    <span>{t("integration.card.feed_rainbow")}</span>
                                    <Activity className="h-4 w-4 text-amber-500" />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {siloData.map(s => (
                                    <div key={s.id}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span>{t("integration.feed.silo_label", {id: s.id})}</span>
                                            <span className="font-bold">{s.currentWeight.toLocaleString()} kg ({s.percentage.toFixed(0)}%)</span>
                                        </div>
                                        <Progress value={s.percentage} className={cn("h-2", s.status === 'critical' ? "bg-red-100 [&>div]:bg-red-500" : "bg-amber-100 [&>div]:bg-amber-500")} />
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setActiveTab("feed")}>{t("integration.card.details_btn")}</Button>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </TabsContent>

            {/* --- KLÍMA TAB (Opticon Részletes) --- */}
            <TabsContent value="climate">
                <div className="grid md:grid-cols-3 gap-6">
                    {/* Nagy Műszerfal */}
                    <Card className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Wind className="h-5 w-5"/> {t("integration.opticon.panel_title")}</CardTitle>
                            <CardDescription className="text-slate-400">{t("integration.opticon.panel_desc")}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 py-4">
                                <div className="text-center p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">{t("integration.opticon.temp_in")}</div>
                                    <div className="text-5xl font-black tracking-tighter">{climateData?.tempInside.toFixed(1)}<span className="text-2xl text-slate-500">°C</span></div>
                                </div>
                                <div className="text-center p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">{t("integration.opticon.temp_out")}</div>
                                    <div className="text-5xl font-black tracking-tighter text-sky-300">{climateData?.tempOutside.toFixed(1)}<span className="text-2xl text-slate-500">°C</span></div>
                                </div>
                                <div className="text-center p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">{t("integration.opticon.humidity")}</div>
                                    <div className="text-5xl font-black tracking-tighter">{climateData?.humidity.toFixed(0)}<span className="text-2xl text-slate-500">%</span></div>
                                </div>
                                <div className="text-center p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">{t("integration.opticon.ventilation")}</div>
                                    <div className="text-3xl font-bold text-blue-400">{climateData?.ventilationLevel}%</div>
                                    <Progress value={climateData?.ventilationLevel || 0} className="h-1 mt-2 bg-slate-700" />
                                </div>
                                <div className="text-center p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">{t("integration.opticon.water")}</div>
                                    <div className="text-3xl font-bold text-cyan-400">{climateData?.waterFlow} l/h</div>
                                </div>
                                <div className="text-center p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">{t("integration.opticon.heating")}</div>
                                    <div className={cn("text-3xl font-bold", climateData?.heatingStatus ? "text-orange-500" : "text-slate-500")}>
                                        {climateData?.heatingStatus ? t("integration.opticon.active") : t("integration.opticon.inactive")}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Esemény panel (Szimulált) */}
                    <div className="space-y-6">
                        <Card>
                             <CardHeader><CardTitle className="text-sm">{t("integration.events.title")}</CardTitle></CardHeader>
                             <CardContent className="text-sm space-y-3">
                                <div className="flex justify-between border-b pb-2">
                                    <span>{t("integration.events.vent_up")}</span>
                                    <span className="text-muted-foreground">10:45</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span>{t("integration.events.heat_stop")}</span>
                                    <span className="text-muted-foreground">09:30</span>
                                </div>
                                <div className="flex justify-between pb-2">
                                    <span>{t("integration.events.report_ready")}</span>
                                    <span className="text-emerald-600 font-bold">06:00</span>
                                </div>
                             </CardContent>
                             <CardFooter>
                                <Button variant="ghost" size="sm" className="w-full text-xs"><HistoryIcon className="mr-2 h-3 w-3"/> {t("integration.events.open_log")}</Button>
                             </CardFooter>
                        </Card>
                    </div>
                </div>
            </TabsContent>

            {/* --- TAKARMÁNY TAB (Rainbow Részletes) --- */}
            <TabsContent value="feed">
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                        <SiloMonitor 
                            data={siloData} 
                            loading={loading} 
                            lastUpdate={lastUpdate} 
                            onRefresh={loadIntegrations}
                        />
                    </div>
                    <div>
                         <Card>
                            <CardHeader><CardTitle>{t("integration.feed.daily_title")}</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                {siloData.map(s => {
                                    const daysLeft = s.dailyConsumption > 0 ? Math.floor(s.currentWeight / s.dailyConsumption) : 99;
                                    
                                    return (
                                        <div key={s.id} className="space-y-2 border-b last:border-0 pb-4 last:pb-0">
                                            <div className="font-semibold text-sm">{t("integration.feed.silo_label", {id: s.id})} - {s.currentWeight.toLocaleString()} kg</div>
                                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
                                                <span className="text-xs text-muted-foreground">{t("integration.feed.consumed")}:</span>
                                                <span className="font-bold text-slate-800">{s.dailyConsumption} kg</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-muted-foreground">{t("integration.feed.reserve")}:</span>
                                                <Badge variant={daysLeft < 3 ? "destructive" : "outline"}>{daysLeft} {t("integration.feed.days")}</Badge>
                                            </div>
                                        </div>
                                    )
                                })}
                            </CardContent>
                         </Card>
                    </div>
                </div>
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
