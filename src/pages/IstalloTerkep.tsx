import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Fan, Wind, Droplets, Utensils, AlertTriangle, 
  CheckCircle2, Thermometer, XCircle, Zap, BoxSelect, ArrowLeftRight 
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BarnConfig, BarnItem } from "./IstalloSzerkeszto";
import { toast } from "@/hooks/use-toast";

// Kiterjesztett típus a státusszal
interface SubError {
    index?: number; // Tányér index (ha sorban van)
    type: 'pan' | 'motor' | 'hopper' | 'regulator' | 'nipple';
    message: string;
    status: 'active' | 'progress'; // ÚJ: Hiba státusza
}

interface LiveItem extends BarnItem {
  status: "ok" | "warning" | "error" | "offline";
  value?: string;
  details?: string;
  errors: SubError[]; // Részletes hibalista
}

export default function IstalloTerkep() {
  const [config, setConfig] = useState<BarnConfig | null>(null);
  const [items, setItems] = useState<LiveItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<LiveItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Error Dialog State (Bejelentés)
  const [errorDialog, setErrorDialog] = useState<{
      isOpen: boolean;
      itemId: string;
      subType: SubError['type'];
      index?: number; // Ha tányér/szelep
  }>({ isOpen: false, itemId: "", subType: 'pan' });

  // Manage Error Dialog State (Kezelés)
  const [manageDialog, setManageDialog] = useState<{
      isOpen: boolean;
      itemId: string;
      error: SubError;
  } | null>(null);
  
  const [errorReason, setErrorReason] = useState("");

  // --- ADAT BETÖLTÉS ---
  useEffect(() => {
    const fetchData = async () => {
        try {
            const docSnap = await getDoc(doc(db, "istallo_layouts", "main_layout"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                setConfig(data.config);
                
                // Szimulálunk élő adatokat, de üres hibalistával indítunk
                const liveItems = (data.items as BarnItem[]).map(item => ({
                    ...item,
                    status: "ok",
                    value: "OK",
                    errors: []
                } as LiveItem));
                setItems(liveItems);
            }
        } catch(e) { console.error(e); } 
        finally { setLoading(false); }
    };
    fetchData();
  }, []);

  // --- HIBA KEZELÉS ---

  const handleClickOnItem = (e: React.MouseEvent, itemId: string, type: SubError['type'], index?: number) => {
      e.stopPropagation();
      // Megnézzük, van-e már hiba ezen az elemen
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      const existingError = item.errors.find(err => err.type === type && err.index === index);
      
      if (existingError) {
          // HA MÁR VAN HIBA -> KEZELÉS (Manage Dialog)
          setManageDialog({
              isOpen: true,
              itemId,
              error: existingError
          });
      } else {
          // HA NINCS HIBA -> BEJELENTÉS (Create Dialog)
          setErrorDialog({ isOpen: true, itemId, subType: type, index });
          setErrorReason(""); // Reset
      }
  };

  const submitError = () => {
      if (!errorReason) return;
      
      setItems(prev => prev.map(item => {
          if (item.id !== errorDialog.itemId) return item;

          const newError: SubError = {
              type: errorDialog.subType,
              index: errorDialog.index,
              message: errorReason,
              status: 'active'
          };
          
          const newErrors = [...item.errors, newError];
          return { ...item, errors: newErrors, status: "warning" };
      }));

      setErrorDialog({ ...errorDialog, isOpen: false });
      toast({ title: "Hiba rögzítve", description: errorReason, variant: "destructive" });
  };

  const updateErrorStatus = (newStatus: 'progress' | 'resolved') => {
      if(!manageDialog) return;

      setItems(prev => prev.map(item => {
          if (item.id !== manageDialog.itemId) return item;

          let newErrors = item.errors;

          if(newStatus === 'resolved') {
              // Törlés
              newErrors = item.errors.filter(err => err !== manageDialog.error);
          } else {
              // Frissítés
              newErrors = item.errors.map(err => err === manageDialog.error ? { ...err, status: newStatus } : err);
          }

          // Ha nincs több hiba, akkor OK, amúgy WARNING
          const itemStatus = newErrors.length > 0 ? "warning" : "ok";
          return { ...item, errors: newErrors, status: itemStatus };
      }));

      setManageDialog(null);
      if(newStatus === 'resolved') toast({ title: "Hiba javítva", description: "Az eszköz státusza frissítve." });
      else toast({ title: "Státusz frissítve", description: "A hiba folyamatban lévőre állítva." });
  };

  // Összesített hibák
  const allErrors = useMemo(() => {
      return items.flatMap(i => i.errors.map(e => ({ ...e, itemName: i.name, itemId: i.id })));
  }, [items]);

  if (loading) return <div className="p-10 text-center">Betöltés...</div>;
  if (!config) return <div className="p-10 text-center">Nincs mentett alaprajz.</div>;

  const viewZoom = 20; 

  // Hiba okok listája típus szerint
  const getErrorOptions = (type: SubError['type']) => {
      switch(type) {
          case 'pan': return ["Nem folyik a táp", "Eltört", "Leszakadt", "Üres", "Túlfolyik"];
          case 'motor': return ["Nem indul", "Zajos", "Túlmelegszik", "Leállt"];
          case 'hopper': return ["Üres", "Eltömődött", "Sérült"];
          case 'nipple': return ["Csöpög", "Dugulás", "Törött"];
          case 'regulator': return ["Túl nagy nyomás", "Nincs nyomás", "Szivárog"];
          default: return ["Egyéb hiba"];
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{config.name}</h1>
          <p className="text-muted-foreground">Kattints az alkatrészekre hiba jelentéséhez!</p>
        </div>
        <div className="flex gap-3">
            <Badge variant="outline" className={cn("px-3 py-1", allErrors.length > 0 ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200")}>
                {allErrors.length > 0 ? <><AlertTriangle className="w-4 h-4 mr-2" /> {allErrors.length} Hiba</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Minden OK</>}
            </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* TÉRKÉP */}
        <Card className="lg:col-span-3 shadow-lg border-2 border-slate-200 overflow-hidden relative bg-slate-900/5">
          <CardContent className="p-6 overflow-auto flex justify-center items-center min-h-[500px]">
            
            <div className="relative bg-white rounded-sm shadow-xl border border-slate-300"
                 style={{
                    width: config.length * viewZoom,
                    height: config.width * viewZoom,
                    maxWidth: '100%',
                    aspectRatio: `${config.length} / ${config.width}`
                 }}>
                
                <div className="absolute -inset-1 border border-slate-400 pointer-events-none" />

                {items.map(item => {
                    const isSelected = selectedDevice?.id === item.id;
                    
                    let colorClass = "bg-slate-200 border-slate-400";
                    if (item.status === 'ok') colorClass = "bg-emerald-100 border-emerald-500";
                    if (item.status === 'warning') colorClass = "bg-amber-100 border-amber-500";
                    if (item.status === 'error') colorClass = "bg-red-100 border-red-600";

                    const style = {
                        left: `${(item.x / config.length) * 100}%`,
                        top: `${(item.y / config.width) * 100}%`,
                        width: `${(item.w / config.length) * 100}%`,
                        height: `${(item.h / config.width) * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                    };

                    return (
                        <div 
                            key={item.id}
                            onClick={() => setSelectedDevice(item)}
                            className={cn(
                                "absolute flex items-center justify-center cursor-pointer transition-transform hover:scale-105 hover:z-50",
                                isSelected ? "z-50 ring-2 ring-blue-400 shadow-lg" : "z-10"
                            )}
                            style={style}
                        >
                            {/* --- ETETŐ / ITATÓ SOR --- */}
                            {(item.type === 'feed-line' || item.type === 'drink-line') && (
                                <div className={cn("w-full h-full rounded-full border relative flex items-center justify-between px-1", 
                                    item.status === 'warning' ? "bg-amber-50 border-amber-300" :
                                    item.type === 'feed-line' ? "bg-orange-100 border-orange-400" : "bg-blue-50 border-blue-400"
                                )}>
                                    
                                    {/* PUTTONY (Hopper) */}
                                    {item.props?.hopperPos !== 'none' && item.type === 'feed-line' && (() => {
                                        const isError = item.errors.some(e => e.type === 'hopper');
                                        return (
                                            <div 
                                                onClick={(e) => handleClickOnItem(e, item.id, 'hopper')}
                                                className={cn("absolute top-1/2 -translate-y-1/2 w-5 h-5 border shadow rounded-sm z-30 hover:scale-125 transition-transform cursor-pointer", 
                                                    item.props?.hopperPos === 'end' ? "right-0" : item.props?.hopperPos === 'center' ? "left-1/2 -translate-x-1/2" : "left-0",
                                                    isError ? "bg-red-600 border-red-800 animate-pulse" : "bg-amber-600 border-white"
                                                )} 
                                                title="Puttony (Kattints a hibához)"
                                            />
                                        );
                                    })()}

                                    {/* MOTOR */}
                                    {item.props?.motorPos !== 'none' && item.type === 'feed-line' && (() => {
                                        const isError = item.errors.some(e => e.type === 'motor');
                                        return (
                                            <div 
                                                onClick={(e) => handleClickOnItem(e, item.id, 'motor')}
                                                className={cn("absolute top-1/2 -translate-y-1/2 w-5 h-5 border shadow rounded-full z-30 flex items-center justify-center hover:scale-125 transition-transform cursor-pointer", 
                                                    item.props?.motorPos === 'start' ? "left-0" : "right-0",
                                                    isError ? "bg-red-600 border-red-800 animate-pulse" : "bg-red-600 border-white"
                                                )} 
                                                title="Motor (Kattints a hibához)"
                                            >
                                                <Zap className="w-3 h-3 text-white" />
                                            </div>
                                        );
                                    })()}

                                    {/* UFO (Regulator) */}
                                    {item.props?.regulatorPos !== 'none' && item.type === 'drink-line' && (() => {
                                        const isError = item.errors.some(e => e.type === 'regulator');
                                        return (
                                            <div 
                                                onClick={(e) => handleClickOnItem(e, item.id, 'regulator')}
                                                className={cn("absolute top-1/2 -translate-y-1/2 w-5 h-5 border shadow rounded-full z-30 flex items-center justify-center hover:scale-125 transition-transform cursor-pointer", 
                                                    item.props?.regulatorPos === 'end' ? "right-0" : item.props?.regulatorPos === 'center' ? "left-1/2 -translate-x-1/2" : "left-0",
                                                    isError ? "bg-red-600 border-red-800 animate-pulse" : "bg-blue-500 border-white"
                                                )} 
                                                title="Nyomásszabályzó (Kattints a hibához)"
                                            >
                                                <Droplets className="w-3 h-3 text-white" />
                                            </div>
                                        );
                                    })()}

                                    {/* Tányérok / Szelepek */}
                                    {(() => {
                                        const count = item.props?.panCount || item.props?.nippleCount || 0;
                                        return Array.from({ length: count }).map((_, idx) => {
                                            const error = item.errors.find(e => (e.type === 'pan' || e.type === 'nipple') && e.index === idx);
                                            const isBroken = !!error;
                                            const isProgress = error?.status === 'progress';

                                            return (
                                                <div 
                                                    key={idx}
                                                    onClick={(e) => handleClickOnItem(e, item.id, item.type === 'feed-line' ? 'pan' : 'nipple', idx)}
                                                    className={cn(
                                                        "rounded-full transition-colors hover:scale-150 cursor-pointer border relative group/point",
                                                        "w-2 h-2 md:w-3 md:h-3",
                                                        isBroken ? (isProgress ? "bg-amber-500 border-amber-700 z-20 scale-125 shadow-sm" : "bg-red-600 border-red-800 z-20 scale-125 shadow-sm") : 
                                                        (item.type === 'feed-line' ? "bg-orange-300 border-orange-500 hover:bg-orange-500" : "bg-blue-300 border-blue-500 hover:bg-blue-500")
                                                    )}
                                                    title={`${idx + 1}. ${item.type === 'feed-line' ? 'etető' : 'itató'}`}
                                                >
                                                    {/* Tooltip hoverre, ha hiba van */}
                                                    {isBroken && (
                                                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap hidden group-hover/point:block z-50">
                                                            {error?.message}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}

                            {/* EGYÉB ESZKÖZÖK */}
                            {item.type === 'fan' && (
                                <div className={cn("w-full h-full rounded-full border-2 flex items-center justify-center overflow-hidden", colorClass, item.status === 'ok' ? "bg-white" : "")}>
                                    <Fan className={cn("w-[90%] h-[90%]", item.status === 'ok' ? "text-emerald-600 animate-spin" : "text-slate-400")} style={{ animationDuration: '1s' }} />
                                </div>
                            )}
                            {item.type === 'wall-inlet' && <div className={cn("w-full h-full rounded-sm border-2 text-[8px] flex items-center justify-center font-bold text-slate-700", colorClass)}><ArrowLeftRight className="w-1/2 h-1/2" /></div>}
                            {item.type === 'ceiling-inlet' && <div className={cn("w-full h-full rounded-sm border-2 text-[8px] flex items-center justify-center font-bold text-slate-700", colorClass)}><Wind className="w-1/2 h-1/2" /></div>}
                            {item.type === 'feed-motor' && <div className={cn("w-full h-full rounded border-2 flex items-center justify-center", colorClass)}><Zap className="w-1/2 h-1/2" /></div>}
                            {item.type === 'sensor' && <div className={cn("w-full h-full rounded-full border-2 flex items-center justify-center shadow-md", colorClass)}><Thermometer className="w-2/3 h-2/3" /></div>}
                            {item.type === 'heater' && <div className={cn("w-full h-full rounded border-2 flex items-center justify-center font-bold text-[8px]", colorClass)}>HEAT</div>}
                            {item.type === 'door' && <div className="w-full h-full bg-amber-800 border-2 border-white" />}
                            {item.type === 'pillar' && <div className="w-full h-full bg-gray-500" />}
                        </div>
                    );
                })}
            </div>
          </CardContent>
        </Card>

        {/* JOBB OLDAL - INFO PANEL */}
        <div className="space-y-6">
            
            {/* KIVÁLASZTOTT ESZKÖZ */}
            <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2 bg-slate-50">
                    <CardTitle className="text-lg flex items-center gap-2">
                        {selectedDevice ? selectedDevice.name : "Válassz eszközt"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                     {selectedDevice ? (
                         <div className="space-y-2">
                             <div className="flex justify-between text-sm">
                                 <span>Típus:</span> <span className="font-medium">{selectedDevice.type}</span>
                             </div>
                             <div className="flex justify-between text-sm">
                                 <span>Hibák száma:</span> 
                                 <Badge variant={selectedDevice.errors.length > 0 ? "destructive" : "secondary"}>{selectedDevice.errors.length}</Badge>
                             </div>
                         </div>
                     ) : (
                         <p className="text-sm text-muted-foreground">Kattints a térképen részletekért.</p>
                     )}
                </CardContent>
            </Card>

            {/* HIBALISTA */}
            <Card className="border-red-200 bg-red-50/30">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base text-red-900 flex items-center gap-2">
                        <XCircle className="w-5 h-5" /> Aktív Hibák ({allErrors.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                    {allErrors.length === 0 ? (
                        <p className="text-sm text-emerald-600 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" /> Minden rendben.
                        </p>
                    ) : (
                        allErrors.map((err, idx) => (
                            <div key={idx} className="bg-white p-3 rounded border border-red-200 shadow-sm flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-sm text-red-950">{err.itemName}</div>
                                    <div className="text-xs text-red-700 mt-1">
                                        {err.type === 'pan' ? `${err.index! + 1}. etető` : 
                                         err.type === 'nipple' ? `${err.index! + 1}. itató` : 
                                         err.type.toUpperCase()} - {err.message}
                                    </div>
                                    {err.status === 'progress' && <Badge className="mt-1 bg-amber-500">Folyamatban</Badge>}
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => {
                                    const dummyE = { stopPropagation: () => {} } as React.MouseEvent;
                                    handleClickOnItem(dummyE, err.itemId, err.type, err.index);
                                }}>
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                </Button>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

        </div>
      </div>

      {/* 1. DIALOG: HIBA BEJELENTÉSE */}
      <Dialog open={errorDialog.isOpen} onOpenChange={(o) => !o && setErrorDialog({...errorDialog, isOpen: false})}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Hiba bejelentése</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                  <div className="space-y-2">
                      <Label>Mi a probléma?</Label>
                      <Select onValueChange={setErrorReason}>
                          <SelectTrigger><SelectValue placeholder="Válassz hibát..." /></SelectTrigger>
                          <SelectContent>
                              {getErrorOptions(errorDialog.subType).map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                              <SelectItem value="custom">Egyéb (Írd be)</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  
                  <div className="space-y-2">
                      <Label>Egyéb megjegyzés</Label>
                      <Input placeholder="Részletek..." onChange={(e) => setErrorReason(e.target.value)} />
                  </div>
              </div>

              <DialogFooter>
                  <Button variant="outline" onClick={() => setErrorDialog({...errorDialog, isOpen: false})}>Mégsem</Button>
                  <Button variant="destructive" onClick={submitError}>Hiba rögzítése</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* 2. DIALOG: HIBA KEZELÉSE */}
      {manageDialog && (
          <Dialog open={manageDialog.isOpen} onOpenChange={(o) => !o && setManageDialog(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Hiba Kezelése</DialogTitle>
                    <DialogDescription>
                        Jelenlegi státusz: <b>{manageDialog.error.status === 'progress' ? 'Folyamatban' : 'Aktív'}</b>
                        <br/>
                        Hiba oka: {manageDialog.error.message}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-4">
                    <Button 
                        className="bg-amber-500 hover:bg-amber-600 text-white" 
                        onClick={() => updateErrorStatus('progress')}
                        disabled={manageDialog.error.status === 'progress'}
                    >
                        Javítás folyamatban
                    </Button>
                    
                    <Button 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white" 
                        onClick={() => updateErrorStatus('resolved')}
                    >
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Hiba elhárítva (Törlés)
                    </Button>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setManageDialog(null)}>Bezárás</Button>
                </DialogFooter>
            </DialogContent>
          </Dialog>
      )}

    </div>
  );
}
