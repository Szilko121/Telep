import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GripVertical, Save } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- ÚJ IMPORT

type Ol = { id: string; nev: string; csoportId?: string | null };

interface OrderSettingsProps {
  order: string[];
  setOrder: React.Dispatch<React.SetStateAction<string[]>>;
  olMap: Map<string, Ol>;
  olak: Ol[];
  onSave: () => Promise<void>;
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

export function OrderSettings({ order, setOrder, olMap, olak, onSave }: OrderSettingsProps) {
  const { t } = useLanguage(); // <--- NYELVI HOOK
  const [dragId, setDragId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          {t("barns.order.info")}
        </p>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
        {order.map((id) => {
          const o = olMap.get(id);
          if (!o) return null;
          const dragging = dragId === id;

          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => onDragStart(e, id)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, id)}
              onDragEnd={onDragEnd}
              className={`
                group flex items-center gap-3 rounded-lg border bg-card p-4 transition-all
                ${dragging ? "opacity-50 scale-95" : "hover:shadow-md hover:border-primary/50"}
                cursor-move
              `}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
              <span className="font-medium">{o.nev}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onSave} className="gap-2">
          <Save className="h-4 w-4" />
          {t("barns.order.save_btn")} {/* Korábbi lépésből újrahasznosítva */}
        </Button>
      </div>
    </div>
  );
}
