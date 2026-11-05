import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- FONTOS IMPORT
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";

type Item = { id:string; title:string; body:string; read:boolean };

export default function NotificationsBell({ uid }: { uid: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    if (!uid) return;
    try {
        // farmCollection használata: farms/{farmId}/notifications/{uid}/items
        const q = query(
          farmCollection(`notifications/${uid}/items`),
          orderBy("createdAt", "desc")
        );
        return onSnapshot(q, (snap) => {
          setItems(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
        });
    } catch (e) {
        console.warn("Értesítés feliratkozási hiba (lehet, hogy nincs farm kiválasztva):", e);
    }
  }, [uid]);

  const unread = items.filter(i => !i.read).length;

  const markAsRead = async (notificationId: string) => {
      try {
          // farmDoc használata az update-hez is
          const docRef = farmDoc(`notifications/${uid}/items`, notificationId);
          await updateDoc(docRef, { read: true });
      } catch (e) {
          console.error("Hiba az olvasottnak jelöléskor:", e);
      }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title={t("notifications.title")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 rounded-full bg-red-600 text-white text-[10px] px-1.5 py-[1px]">
              {unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[420px] max-w-[95vw]">
        <SheetHeader>
            <SheetTitle>{t("notifications.title")}</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-2">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("notifications.empty")}</div>
          )}
          {items.map((n) => (
            <div key={n.id} className="rounded-md border p-3 bg-card">
              <div className="font-medium">{n.title}</div>
              <div className="text-sm text-muted-foreground">{n.body}</div>
              {!n.read && (
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAsRead(n.id)}
                  >
                    {t("notifications.mark_read")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
