import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
// import { db } from "@/lib/firebase"; // <--- NEM KELL
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- ÚJ IMPORT
import { toast } from "@/hooks/use-toast";
import { GripVertical, Save, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type Ol = { id: string; nev: string; csoportId?: string | null };
type Csoport = { id: string; nev: string };

interface CsoportokSettingsProps {
  csoportok: Csoport[];
  csoportOrder: string[];
  setCsoportOrder: React.Dispatch<React.SetStateAction<string[]>>;
  csMap: Map<string, Csoport>;
  olak: Ol[];
  reloadOlakAndGroups: () => Promise<void>;
}

function toId(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeOrder(order: string[], validIds: string[]): string[] {
  const set = new Set<string>();
  const valid = new Set(validIds);
  const out: string[] = [];
  for (const id of order) {
    if (!valid.has(id)) continue;
    if (!set.has(id)) {
      set.add(id);
      out.push(id);
    }
  }
  for (const id of validIds) if (!set.has(id)) out.push(id);
  return out;
}

export function CsoportokSettings({
  csoportok,
  csoportOrder,
  setCsoportOrder,
  csMap,
  olak,
  reloadOlakAndGroups,
}: CsoportokSettingsProps) {
  const { t } = useLanguage();
  
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupEditName, setGroupEditName] = useState("");
  const [groupSelect, setGroupSelect] = useState<Set<string>>(new Set());

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSelection, setNewGroupSelection] = useState<Set<string>>(new Set());

  const sortedOlak = useMemo(() => {
    return [...olak].sort((a, b) => (a.nev || "").localeCompare(b.nev || ""));
  }, [olak]);

  function onGroupDragStart(e: React.DragEvent, id: string) {
    setDragGroupId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onGroupDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onGroupDrop(e: React.DragEvent, overId: string) {
    e.preventDefault();
    setCsoportOrder((prev) => {
      if (!dragGroupId || dragGroupId === overId) return prev;
      const list = [...prev];
      const from = list.indexOf(dragGroupId);
      const to = list.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      const [moved] = list.splice(from, 1);
      const finalIndex = from < to ? to : to;
      list.splice(finalIndex, 0, moved);
      return sanitizeOrder(list, csoportok.map((g) => g.id));
    });
    setDragGroupId(null);
  }

  function onGroupDragEnd() {
    setDragGroupId(null);
  }

  async function saveGroupOrder() {
    try {
      const clean = sanitizeOrder(csoportOrder, csoportok.map((g) => g.id));
      // JAVÍTVA: farmDoc használata
      await setDoc(farmDoc("meta", "csoportok"), { order: clean, savedAt: serverTimestamp() }, { merge: true });
      setCsoportOrder(clean);
      toast({ title: t("common.saved"), description: t("groups.toast.order_saved") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message || "Mentési hiba", variant: "destructive" });
    }
  }

  async function addCsoport() {
    const name = (newGroupName || "").trim();
    if (!name) return;
    const id = toId(name);
    // JAVÍTVA: farmDoc használata
    const ref = farmDoc("csoportok", id);
    const ex = await getDoc(ref);

    if (ex.exists()) {
      await setDoc(ref, { nev: name, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await setDoc(ref, { nev: name, createdAt: serverTimestamp() }, { merge: true });
    }

    const updates: Promise<any>[] = [];
    for (const olId of newGroupSelection) {
      // JAVÍTVA: farmDoc használata
      updates.push(updateDoc(farmDoc("olak", olId), { csoportId: id }));
    }
    await Promise.all(updates);

    await reloadOlakAndGroups();
    setCsoportOrder((prev) => sanitizeOrder(prev.concat(id), csoportok.map((g) => g.id).concat(id)));
    setNewGroupName("");
    setNewGroupSelection(new Set());
    toast({ 
        title: t("groups.toast.created"), 
        description: t("groups.toast.created_desc", {name, count: newGroupSelection.size}) 
    });
  }

  async function renameCsoport(id: string, name: string) {
    const n = (name || "").trim();
    if (!n) return;
    const newId = toId(n);

    try {
      if (newId === id) {
        // JAVÍTVA: farmDoc használata
        await updateDoc(farmDoc("csoportok", id), { nev: n, updatedAt: serverTimestamp() });
      } else {
        // JAVÍTVA: farmDoc használata
        const newRef = farmDoc("csoportok", newId);
        const exists = await getDoc(newRef);
        if (exists.exists()) {
          toast({ title: t("groups.toast.exists"), description: t("groups.toast.exists_desc", {name: n}), variant: "destructive" });
          return;
        }

        const oldRef = farmDoc("csoportok", id);
        const oldSnap = await getDoc(oldRef);
        const oldData = oldSnap.exists() ? oldSnap.data() : {};

        await setDoc(newRef, { ...oldData, nev: n, migratedAt: serverTimestamp() }, { merge: true });

        // JAVÍTVA: farmCollection használata
        const olSnap = await getDocs(farmCollection("olak"));
        const updates: Promise<any>[] = [];
        for (const d of olSnap.docs) {
          const o = d.data() as Ol;
          if (o.csoportId === id) {
              // JAVÍTVA: farmDoc használata
              updates.push(updateDoc(farmDoc("olak", d.id), { csoportId: newId }));
          }
        }
        await Promise.all(updates);

        await deleteDoc(oldRef);
        setCsoportOrder((prev) => prev.map((x) => (x === id ? newId : x)));
      }

      await reloadOlakAndGroups();
      toast({ title: t("groups.toast.renamed"), description: t("groups.toast.renamed_desc") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e?.message || "Mentési hiba", variant: "destructive" });
    }
  }

  async function deleteCsoport(id: string) {
    if (groupEditId === id) setGroupEditId(null);

    const hasOl = olak.some((o) => o.csoportId === id);
    if (hasOl) {
      toast({
        title: t("groups.toast.delete_error"),
        description: t("groups.toast.delete_error_desc"),
        variant: "destructive",
      });
      return;
    }
    // JAVÍTVA: farmDoc használata
    await deleteDoc(farmDoc("csoportok", id));
    await reloadOlakAndGroups();
    toast({ title: t("groups.toast.deleted") });
  }

  function openGroupEditor(g: Csoport) {
    setGroupEditId(g.id);
    setGroupEditName(g.nev);
    const sel = new Set<string>();
    for (const o of olak) if (o.csoportId === g.id) sel.add(o.id);
    setGroupSelect(sel);
  }

  async function saveGroupAssignments() {
    if (!groupEditId) return;
    const selected = new Set(groupSelect);
    const promises: Promise<any>[] = [];
    for (const o of olak) {
      if (selected.has(o.id) && o.csoportId !== groupEditId) {
        // JAVÍTVA: farmDoc használata
        promises.push(updateDoc(farmDoc("olak", o.id), { csoportId: groupEditId }));
      } else if (!selected.has(o.id) && o.csoportId === groupEditId) {
        // JAVÍTVA: farmDoc használata
        promises.push(updateDoc(farmDoc("olak", o.id), { csoportId: null }));
      }
    }
    await Promise.all(promises);
    await reloadOlakAndGroups();
    toast({ title: t("groups.toast.assignments_saved"), description: t("groups.toast.assignments_saved_desc") });
  }

  return (
    <div className="space-y-8">
      {/* Group Order */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">{t("groups.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("groups.subtitle")}</p>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {csoportOrder.map((id) => {
            const g = csMap.get(id);
            if (!g) return null;
            const dragging = dragGroupId === id;

            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => onGroupDragStart(e, id)}
                onDragOver={onGroupDragOver}
                onDrop={(e) => onGroupDrop(e, id)}
                onDragEnd={onGroupDragEnd}
                className={`
                  group flex items-center gap-4 rounded-xl border-2 bg-card p-4 transition-all
                  ${dragging ? "opacity-50 scale-95 border-primary/50" : "hover:shadow-lg hover:border-primary/40 hover:bg-accent/5"}
                  cursor-move
                `}
              >
                <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                <span className="font-medium">{g.nev}</span>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveGroupOrder} className="gap-2">
            <Save className="h-4 w-4" />
            {t("common.save")}
          </Button>
        </div>
      </div>

      {/* Create New Group */}
      <Card className="shadow-lg border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardHeader className="pb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Plus className="h-6 w-6 text-primary" />
            {t("groups.new_title")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("groups.new_desc")}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="new-group-name" className="text-sm font-semibold">
              {t("groups.new_name_label")}
            </Label>
            <Input
              id="new-group-name"
              placeholder={t("groups.new_name_placeholder")}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t("groups.select_barns")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("groups.selected_count", {count: newGroupSelection.size})}
              </span>
            </div>
            <div className="border-2 border-dashed border-border rounded-lg p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-2">
                {sortedOlak.map((o) => (
                  <div 
                    key={o.id} 
                    className="flex items-center space-x-2 p-2.5 rounded-lg border-2 bg-card hover:bg-accent/50 hover:border-primary/40 transition-all cursor-pointer"
                    onClick={() => {
                      setNewGroupSelection((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.id)) next.delete(o.id);
                        else next.add(o.id);
                        return next;
                      });
                    }}
                  >
                    <Checkbox
                      id={`new-${o.id}`}
                      checked={newGroupSelection.has(o.id)}
                      onCheckedChange={(checked) => {
                        setNewGroupSelection((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(o.id);
                          else next.delete(o.id);
                          return next;
                        });
                      }}
                    />
                    <Label htmlFor={`new-${o.id}`} className="text-sm cursor-pointer flex-1 font-medium">
                      {o.nev}
                      {o.csoportId && <span className="text-xs text-muted-foreground ml-1">{t("groups.other_group")}</span>}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={addCsoport} className="gap-2 h-11 px-6 shadow-md" size="lg">
              <Plus className="h-5 w-5" />
              {t("groups.create_btn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Groups */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{t("groups.existing_title")}</h3>
          <span className="text-sm text-muted-foreground">{t("groups.count_label", {count: csoportok.length})}</span>
        </div>

        <div className="space-y-4">
          {csoportok.map((g) => {
            const inGroup = olak.filter((o) => o.csoportId === g.id);
            const isEditing = groupEditId === g.id;

            return (
              <Card key={g.id} className="p-5 shadow-md hover:shadow-lg transition-shadow border-2">
                <div className="flex items-start justify-between gap-4 mb-3">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={groupEditName} onChange={(e) => setGroupEditName(e.target.value)} />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={async () => {
                          await renameCsoport(g.id, groupEditName);
                          setGroupEditId(null);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setGroupEditId(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">{g.nev}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t("groups.barn_count", {count: inGroup.length})}: {inGroup.map((o) => o.nev).join(", ") || "–"}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          openGroupEditor(g);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="destructive" onClick={() => deleteCsoport(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <div className="space-y-3 mt-4 pt-4 border-t-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">{t("groups.edit_barns_title")}</Label>
                      <span className="text-xs text-muted-foreground">
                        {t("groups.selected_count", {count: groupSelect.size})}
                      </span>
                    </div>
                    <div className="border-2 border-dashed border-border rounded-lg p-3 bg-muted/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-2">
                        {sortedOlak.map((o) => (
                          <div 
                            key={o.id} 
                            className="flex items-center space-x-2 p-2.5 rounded-lg border-2 bg-card hover:bg-accent/50 hover:border-primary/40 transition-all cursor-pointer"
                            onClick={() => {
                              setGroupSelect((prev) => {
                                const next = new Set(prev);
                                if (next.has(o.id)) next.delete(o.id);
                                else next.add(o.id);
                                return next;
                              });
                            }}
                          >
                            <Checkbox
                              id={`edit-${g.id}-${o.id}`}
                              checked={groupSelect.has(o.id)}
                              onCheckedChange={(checked) => {
                                setGroupSelect((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(o.id);
                                  else next.delete(o.id);
                                  return next;
                                });
                              }}
                            />
                            <Label htmlFor={`edit-${g.id}-${o.id}`} className="text-sm cursor-pointer flex-1 font-medium">
                              {o.nev}
                              {o.csoportId && o.csoportId !== g.id && (
                                <span className="text-xs text-muted-foreground ml-1">{t("groups.other_group")}</span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setGroupEditId(null);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t("common.cancel")}
                      </Button>
                      <Button
                        onClick={async () => {
                          await saveGroupAssignments();
                          setGroupEditId(null);
                        }}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {t("common.save")}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
