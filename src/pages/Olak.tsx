import { useEffect, useMemo, useState } from "react";
import {
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc
} from "firebase/firestore"; // collection és doc már nem kell innen közvetlenül importálni az útvonalakhoz
import { waitForAuth } from "@/lib/firebase"; // db már nem feltétlenül kell közvetlenül
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- ÚJ IMPORTOK
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/hooks/use-toast";
import { 
    Settings2, Plus, Search, Home, Users, 
    Trash2, Pencil, Warehouse, LayoutGrid 
} from "lucide-react";
import { CsoportokSettings } from "@/components/olak/CsoportokSettings";
import { OrderSettings } from "@/components/olak/OrderSettings";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

// --- TÍPUSOK ---
type Ol = { 
    id: string; 
    nev: string; 
    csoportId?: string | null; 
    kapacitas?: number; 
};
type Csoport = { id: string; nev: string };

// --- SEGÉDFÜGGVÉNYEK ---
function toId(input: string): string {
  return input ? input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
}

function sanitizeOrder(order: string[], validIds: string[]): string[] {
  const set = new Set<string>(), valid = new Set(validIds), out: string[] = [];
  for (const id of order) { if (valid.has(id) && !set.has(id)) { set.add(id); out.push(id); } }
  for (const id of validIds) if (!set.has(id)) out.push(id);
  return out;
}

export default function Olak() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  
  // Adatok
  const [olak, setOlak] = useState<Ol[]>([]);
  const [csoportok, setCsoportok] = useState<Csoport[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [csoportOrder, setCsoportOrder] = useState<string[]>([]);

  // UI State
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<{id?: string, nev: string, kapacitas: string, csoportId: string}>({
      nev: "", kapacitas: "", csoportId: "none"
  });

  // --- BETÖLTÉS ---
  const loadData = async () => {
      try {
        await waitForAuth();
        
        // JAVÍTVA: farmCollection használata
        const [olSnap, csSnap] = await Promise.all([
            getDocs(farmCollection("olak")),
            getDocs(farmCollection("csoportok")),
        ]);

        const listOl = olSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Ol[];
        setOlak(listOl);

        const listCs = csSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Csoport[];
        setCsoportok(listCs);

        // Sorrend betöltése
        // JAVÍTVA: farmDoc használata
        const metaOlDoc = await getDoc(farmDoc("meta", "olak"));
        const savedOlOrder = metaOlDoc.exists() ? metaOlDoc.data().order : [];
        setOrder(sanitizeOrder(savedOlOrder || [], listOl.map(o => o.id)));

        // JAVÍTVA: farmDoc használata
        const metaCsDoc = await getDoc(farmDoc("meta", "csoportok"));
        const savedCsOrder = metaCsDoc.exists() ? metaCsDoc.data().order : [];
        setCsoportOrder(sanitizeOrder(savedCsOrder || [], listCs.map(c => c.id)));

      } catch (e: any) { 
          console.error(e); 
          toast({ title: t("common.error"), description: e.message, variant: "destructive" });
      } 
      finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  // --- MEMOS ---
  const olMap = useMemo(() => new Map(olak.map((o) => [o.id, o])), [olak]);
  const csMap = useMemo(() => new Map(csoportok.map((g) => [g.id, g])), [csoportok]);
  
  const orderedCsoportok = useMemo(() => {
    return csoportOrder.map((id) => csMap.get(id)).filter(Boolean) as Csoport[];
  }, [csoportOrder, csMap]);

  // Rendezett és szűrt lista
  const displayOlak = useMemo(() => {
      let list = order.map(id => olMap.get(id)).filter(Boolean) as Ol[];
      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          list = list.filter(o => o.nev.toLowerCase().includes(lower));
      }
      return list;
  }, [order, olMap, searchTerm]);

  // Statisztika
  const stats = useMemo(() => {
      const totalCap = olak.reduce((sum, o) => sum + (Number(o.kapacitas) || 0), 0);
      return { count: olak.length, capacity: totalCap };
  }, [olak]);


  // --- ACTIONS ---

  const handleSave = async () => {
      const name = formData.nev.trim();
      if (!name) return;
      
      const isEdit = !!formData.id;
      const docId = isEdit ? formData.id! : toId(name);
      
      // JAVÍTVA: farmDoc használata
      const ref = farmDoc("olak", docId);

      if (!isEdit) {
          const exists = await getDoc(ref);
          if (exists.exists()) {
              toast({title: t("common.error"), description: t("barns.toast.exists"), variant: "destructive"});
              return;
          }
      }

      const payload = {
          nev: name,
          kapacitas: Number(formData.kapacitas) || 0,
          csoportId: formData.csoportId === "none" ? null : formData.csoportId,
          updatedAt: serverTimestamp(),
          ...(isEdit ? {} : { createdAt: serverTimestamp() })
      };

      try {
          await setDoc(ref, payload, { merge: true });
          
          if (!isEdit) {
              const newOrder = [...order, docId];
              setOrder(newOrder);
              // JAVÍTVA: farmDoc használata
              await setDoc(farmDoc("meta", "olak"), { order: newOrder }, { merge: true });
          }
          
          toast({ title: t("barns.toast.saved"), description: t("barns.toast.saved_desc", {name}) });
          setIsAddDialogOpen(false);
          setIsEditDialogOpen(false);
          loadData();
      } catch (e: any) { 
          toast({title: t("common.error"), description: e.message, variant: "destructive"}); 
      }
  };

  const handleDelete = async () => {
      if (!deleteTargetId) return;
      try {
          // JAVÍTVA: farmDoc használata
          await deleteDoc(farmDoc("olak", deleteTargetId));
          const newOrder = order.filter(id => id !== deleteTargetId);
          setOrder(newOrder);
          // JAVÍTVA: farmDoc használata
          await setDoc(farmDoc("meta", "olak"), { order: newOrder }, { merge: true });
          
          setOlak(prev => prev.filter(o => o.id !== deleteTargetId));
          toast({ title: t("barns.toast.deleted"), description: t("barns.toast.deleted_desc") });
      } catch (e: any) { 
          toast({title: t("common.error"), description: e.message, variant: "destructive"}); 
      }
      finally { setDeleteTargetId(null); }
  };

  const openEdit = (ol: Ol) => {
      setFormData({
          id: ol.id,
          nev: ol.nev,
          kapacitas: ol.kapacitas ? String(ol.kapacitas) : "",
          csoportId: ol.csoportId || "none"
      });
      setIsEditDialogOpen(true);
  };

  const openAdd = () => {
      setFormData({ nev: "", kapacitas: "", csoportId: "none" });
      setIsAddDialogOpen(true);
  };


  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6 lg:p-8 pb-24">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* HEADER & STATS */}
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{t("barns.title")}</h1>
            <p className="text-muted-foreground mt-1 text-lg">
              {t("barns.subtitle")}
            </p>
          </div>

          <div className="flex gap-4">
             <Card className="px-6 py-3 flex flex-col justify-center items-center bg-white border border-border/60 shadow-sm rounded-xl">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t("barns.stats.total_barns")}</span>
                <span className="text-2xl font-bold text-primary">{stats.count}</span>
             </Card>
             <Card className="px-6 py-3 flex flex-col justify-center items-center bg-white border border-border/60 shadow-sm rounded-xl">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t("barns.stats.total_capacity")}</span>
                <span className="text-2xl font-bold text-emerald-600">{stats.capacity.toLocaleString()}</span>
             </Card>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border shadow-sm">
            <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder={t("barns.search_placeholder")}
                    className="pl-10 bg-gray-50 border-gray-200 h-10 focus-visible:ring-primary"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex gap-3 w-full sm:w-auto">
                <Sheet>
                    <SheetTrigger asChild>
                    <Button variant="outline" className="gap-2 flex-1 sm:flex-none h-10 bg-white hover:bg-gray-50">
                        <Settings2 className="h-4 w-4" />
                        {t("barns.settings_btn")}
                    </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[95vw] sm:max-w-[600px] overflow-y-auto bg-gray-50/50 p-0">
                        <div className="h-full flex flex-col">
                            <SheetHeader className="bg-white px-6 py-5 border-b sticky top-0 z-10">
                                <SheetTitle className="text-xl font-bold flex items-center gap-2">
                                    <Settings2 className="h-5 w-5 text-primary" /> {t("barns.settings.title")}
                                </SheetTitle>
                                <SheetDescription>
                                    {t("barns.settings.desc")}
                                </SheetDescription>
                            </SheetHeader>
                            
                            <div className="flex-1 p-6 overflow-y-auto">
                                <Tabs defaultValue="sorrend" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-white border shadow-sm rounded-lg p-1">
                                        <TabsTrigger value="sorrend" className="rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-base">
                                            <LayoutGrid className="h-4 w-4 mr-2" /> {t("barns.settings.tab.order")}
                                        </TabsTrigger>
                                        <TabsTrigger value="csoportok" className="rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-base">
                                            <Warehouse className="h-4 w-4 mr-2" /> {t("barns.settings.tab.groups")}
                                        </TabsTrigger>
                                    </TabsList>

                                    <div className="bg-white rounded-xl border shadow-sm p-4">
                                        <TabsContent value="sorrend" className="mt-0">
                                            <OrderSettings order={order} setOrder={setOrder} olMap={olMap} olak={olak} onSave={async () => {
                                                // JAVÍTVA: farmDoc használata
                                                await setDoc(farmDoc("meta", "olak"), { order: sanitizeOrder(order, olak.map(o=>o.id)) }, { merge: true });
                                                toast({title: t("barns.settings.toast_order_saved")});
                                            }} />
                                        </TabsContent>
                                        <TabsContent value="csoportok" className="mt-0">
                                            <CsoportokSettings
                                                csoportok={orderedCsoportok}
                                                csoportOrder={csoportOrder}
                                                setCsoportOrder={setCsoportOrder}
                                                csMap={csMap}
                                                olak={olak}
                                                reloadOlakAndGroups={loadData}
                                            />
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>

                <Button onClick={openAdd} className="gap-2 bg-primary hover:bg-primary/90 flex-1 sm:flex-none shadow-md h-10">
                    <Plus className="h-5 w-5" /> {t("barns.new_btn")}
                </Button>
            </div>
        </div>

        {/* GRID VIEW */}
        {displayOlak.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-xl border border-dashed">
                <div className="bg-gray-50 p-4 rounded-full w-fit mx-auto mb-4">
                    <Warehouse className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground">{t("barns.empty_title")}</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">{t("barns.empty_desc")}</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {displayOlak.map((ol) => {
                    const group = ol.csoportId ? csMap.get(ol.csoportId) : null;
                    return (
                        <Card key={ol.id} className="group relative overflow-hidden border-border/60 hover:border-primary/50 hover:shadow-lg transition-all duration-300 bg-white">
                            
                            {/* CSOPORT CÍMKE */}
                            {group && (
                                <div className="absolute top-3 right-3 z-10">
                                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200 px-3 py-1 text-xs font-bold shadow-sm">
                                        {group.nev}
                                    </Badge>
                                </div>
                            )}

                            <CardContent className="pt-6 px-5 pb-4">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                                        <Home className="h-6 w-6" />
                                    </div>
                                    <div className="pt-0.5">
                                        <h3 className="text-xl font-bold text-foreground leading-tight">{ol.nev}</h3>
                                        <p className="text-xs text-muted-foreground font-mono mt-1">ID: {ol.id}</p>
                                    </div>
                                </div>

                                <Separator className="my-3" />

                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                                        <Users className="h-4 w-4" /> {t("barns.card.capacity")}
                                    </span>
                                    <span className="text-lg font-semibold text-foreground tabular-nums">
                                        {ol.kapacitas ? ol.kapacitas.toLocaleString() : <span className="text-muted-foreground/50">-</span>}
                                    </span>
                                </div>
                            </CardContent>

                            <CardFooter className="px-5 py-3 bg-gray-50/50 border-t flex justify-between items-center">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("barns.card.actions")}</span>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openEdit(ol)} title={t("common.edit")}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTargetId(ol.id)} title={t("common.delete")}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>
        )}

        {/* MODAL: LÉTREHOZÁS / SZERKESZTÉS */}
        <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
            if(!open) { setIsAddDialogOpen(false); setIsEditDialogOpen(false); }
        }}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">{isEditDialogOpen ? t("barns.dialog.edit_title") : t("barns.dialog.add_title")}</DialogTitle>
                    <DialogDescription>
                        {isEditDialogOpen ? t("barns.dialog.edit_desc") : t("barns.dialog.add_desc")}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-5 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="nev" className="text-base font-medium">{t("barns.dialog.name_label")}</Label>
                        <Input id="nev" placeholder={t("barns.dialog.name_placeholder")} className="h-11" value={formData.nev} onChange={e => setFormData({...formData, nev: e.target.value})} />
                    </div>
                    
                    <div className="grid gap-2">
                        <Label htmlFor="kapacitas" className="text-base font-medium">{t("barns.dialog.cap_label")}</Label>
                        <div className="relative">
                            <Users className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                            <Input id="kapacitas" type="number" placeholder={t("barns.dialog.cap_placeholder")} className="pl-10 h-11" value={formData.kapacitas} onChange={e => setFormData({...formData, kapacitas: e.target.value})} />
                            <span className="absolute right-3 top-3 text-sm font-medium text-muted-foreground">{t("barns.dialog.cap_unit")}</span>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="csoport" className="text-base font-medium">{t("barns.dialog.group_label")}</Label>
                        <Select value={formData.csoportId} onValueChange={(val) => setFormData({...formData, csoportId: val})}>
                            <SelectTrigger className="h-11">
                                <SelectValue placeholder={t("barns.dialog.group_placeholder")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none" className="text-muted-foreground italic">{t("barns.dialog.group_none")}</SelectItem>
                                {orderedCsoportok.map(g => (
                                    <SelectItem key={g.id} value={g.id} className="font-medium">{g.nev}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t("barns.dialog.group_help")}</p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => {setIsAddDialogOpen(false); setIsEditDialogOpen(false);}} className="h-11">{t("common.cancel")}</Button>
                    <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 h-11 px-6">
                        {isEditDialogOpen ? t("barns.dialog.save_btn") : t("barns.dialog.create_btn")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* ALERT: TÖRLÉS */}
        <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                        <Trash2 className="h-5 w-5" /> {t("barns.alert.delete_title")}
                    </AlertDialogTitle>
                    <AlertDialogDescription dangerouslySetInnerHTML={{ __html: t("barns.alert.delete_desc") }} />
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">{t("common.delete")}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}
