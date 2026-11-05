import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Pencil, Trash2, Check, X, Save } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type Ol = { id: string; nev: string; csoportId?: string | null };
type Csoport = { id: string; nev: string };

interface OlakListProps {
  orderedOlak: Ol[];
  order: string[];
  setOrder: React.Dispatch<React.SetStateAction<string[]>>;
  olak: Ol[];
  csoportok: Csoport[];
  onRename: (id: string, newName: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSaveOrder: () => Promise<void>;
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

export function OlakList({
  orderedOlak,
  order,
  setOrder,
  olak,
  csoportok,
  onRename,
  onRemove,
  onSaveOrder,
}: OlakListProps) {
  const { t } = useLanguage();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNev, setEditingNev] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const csoportMap = useMemo(() => new Map(csoportok.map((g) => [g.id, g])), [csoportok]);

  function onDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent, overId: string) {
    e.preventDefault();
    setOrder((prev) => {
      if (!dragId || dragId === overId) return prev;
      const list = [...prev];
      const from = list.indexOf(dragId);
      const to = list.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      const [moved] = list.splice(from, 1);
      const finalIndex = from < to ? to : to;
      list.splice(finalIndex, 0, moved);
      return sanitizeOrder(list, olak.map((o) => o.id));
    });
    setDragId(null);
  }

  function onDragEnd() {
    setDragId(null);
  }

  async function handleRename(id: string) {
    await onRename(id, editingNev);
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{t("barns.order.subtitle")}</span>
      </div>

      <div className="space-y-2">
        {orderedOlak.map((o) => {
          const dragging = dragId === o.id;
          const csoport = o.csoportId ? csoportMap.get(o.csoportId) : null;

          return (
            <div
              key={o.id}
              draggable
              onDragStart={(e) => onDragStart(e, o.id)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, o.id)}
              onDragEnd={onDragEnd}
              className={`
                group flex items-center gap-4 rounded-xl border-2 bg-card p-4 transition-all
                ${dragging ? "opacity-50 scale-95 border-primary/50" : "hover:shadow-lg hover:border-primary/40 hover:bg-accent/5"}
                cursor-move
              `}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />

              <div className="flex-1 min-w-0">
                {editingId === o.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingNev}
                      onChange={(e) => setEditingNev(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRename(o.id)}
                      className="flex-1"
                      autoFocus
                    />
                    <Button size="icon" variant="outline" onClick={() => handleRename(o.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-card-foreground">{o.nev}</span>
                    {csoport && (
                      <Badge variant="secondary" className="text-xs">
                        {csoport.nev}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {editingId !== o.id && (
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setEditingId(o.id);
                      setEditingNev(o.nev);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="destructive" onClick={() => onRemove(o.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {orderedOlak.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("barns.order.empty")}</p>
        </div>
      )}

      {orderedOlak.length > 0 && (
        <div className="flex justify-end pt-4">
          <Button onClick={onSaveOrder} className="gap-2">
            <Save className="h-4 w-4" />
            {t("barns.order.save_btn")}
          </Button>
        </div>
      )}
    </div>
  );
}
