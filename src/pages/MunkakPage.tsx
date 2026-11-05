import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveTurnus } from "@/services/turnus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Check, X, Info, UserCheck, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  addDoc, onSnapshot, orderBy, query, where,
  serverTimestamp, Unsubscribe
} from "firebase/firestore";
import { auth, waitForAuth } from "@/lib/firebase"; // db nem kell közvetlenül
import { farmCollection } from "@/lib/farmDb"; // <--- FONTOS: farm helperek
import {
  WorkRequest, approveWorkRequest, rejectWorkRequest,
  pushNotification, getShiftForDate
} from "@/services/work";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { getPermissions } from "@/services/permissionsService";

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

export default function MunkakPage() {
  const { user } = useAuth() as any;
  const { t } = useLanguage();

  const [authReady, setAuthReady] = useState(false);
  const [turnusId, setTurnusId] = useState<string>("");
  const [myList, setMyList] = useState<WorkRequest[]>([]);
  const [pendingForApproval, setPendingForApproval] = useState<WorkRequest[]>([]);

  const [form, setForm] = useState({ dateISO: toISO(new Date()), task: "", hours: 8, note: "" });
  const [targetShiftInfo, setTargetShiftInfo] = useState<{ name: string, uid: string | null } | null>(null);

  const role = user?.role as string | undefined;
  const displayName = user?.displayName || auth.currentUser?.displayName || "Unknown";

  const canSetDate = role === "admin" || role === "főnök";

  // 1. Inicializálás
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await waitForAuth();
        if (!mounted) return;
        setAuthReady(true);

        const t = await getActiveTurnus();
        if (!mounted) return;
        if (!t) {
          console.log("Nincs aktív turnus.");
          return;
        }
        setTurnusId(t.id);
      } catch (e: any) {
        console.error("Hiba az inicializáláskor:", e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 2. Figyeljük, hogy a választott dátumon ki a műszakos
  useEffect(() => {
    if (!turnusId || !form.dateISO) return;

    let isCancelled = false;
    const checkApprover = async () => {
      try {
        const shiftData = await getShiftForDate(turnusId, form.dateISO);
        if (!isCancelled) {
          if (shiftData && shiftData.operatorName) {
            setTargetShiftInfo({ name: shiftData.operatorName, uid: shiftData.operatorUid });
          } else {
            setTargetShiftInfo(null);
          }
        }
      } catch (e) { console.error(e); }
    };
    checkApprover();
    return () => { isCancelled = true; };
  }, [turnusId, form.dateISO]);

  // 3. SAJÁT bejegyzések betöltése
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!authReady || !uid) return;

    // 3. SAJÁT bejegyzések betöltése
    const q1 = query(
      farmCollection("workRequests"),
      where("createdByUid", "==", uid)
      // orderBy("submittedAt", "desc") <--- KIVETTÜK AZ INDEX IGÉNY MIATT
    );
    const unsub = onSnapshot(q1, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // Kliens oldali rendezés
      list.sort((a: any, b: any) => {
        const tA = a.submittedAt?.seconds || 0;
        const tB = b.submittedAt?.seconds || 0;
        return tB - tA;
      });
      setMyList(list);
    }, (err) => {
      console.error("Saját bejegyzések hiba:", err);
    });
    return () => unsub();
  }, [authReady]);

  // 4. ENGEDÉLYKÉRÉSEK betöltése
  useEffect(() => {
    if (!authReady || !user) return;
    const uid = user.authUid || auth.currentUser?.uid;
    if (!uid) return;

    let unsub: Unsubscribe | null = null;

    const iAmAdmin = role === "admin" || role === "főnök";

    // JAVÍTVA: farmCollection használata!
    const base = farmCollection("workRequests");
    let q2;

    if (iAmAdmin) {
      // Index igény elkerülése: kivettük az orderBy-t
      q2 = query(base, where("status", "==", "pending"));
    } else {
      // Index igény elkerülése: kivettük az orderBy-t
      q2 = query(base, where("shiftOperatorUid", "==", uid), where("status", "==", "pending"));
    }

    try {
      unsub = onSnapshot(q2, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as WorkRequest[];
        // Kliens oldali rendezés
        list.sort((a: any, b: any) => {
          const tA = a.submittedAt?.seconds || 0;
          const tB = b.submittedAt?.seconds || 0;
          return tB - tA;
        });
        setPendingForApproval(list);
      }, (err) => {
        console.log("Nincs jóváhagyási jog vagy hiba:", err.message);
        setPendingForApproval([]);
      });
    } catch (error) {
      console.error("Query hiba:", error);
    }

    return () => { if (unsub) unsub(); };
  }, [authReady, user, role]);


  // --- MŰVELETEK ---

  async function submitWork() {
    try {
      const uid = user?.uid || auth.currentUser?.uid;
      if (!uid) { toast({ title: t("works.toast.no_login"), variant: "destructive" }); return; }
      if (!turnusId) { toast({ title: t("works.toast.no_turnus"), variant: "destructive" }); return; }

      const task = form.task.trim();
      if (!task) { toast({ title: t("works.toast.no_task"), variant: "destructive" }); return; }

      const hours = Number(form.hours);
      if (!(hours > 0)) { toast({ title: t("works.toast.invalid_hours"), variant: "destructive" }); return; }

      const dateISO = form.dateISO;

      // 1. Műszakos lekérése
      const shiftForDay = await getShiftForDate(turnusId, dateISO);
      let approverUid = shiftForDay?.operatorUid || "";
      let approverName = shiftForDay?.operatorName || t("works.approver_management");

      const isManager = (role === "admin" || role === "főnök");

      // 2. JOGOSULTSÁG ELLENŐRZÉS (AUTOMATIKUS ELFOGADÁS)
      const allPermissions = await getPermissions();

      const roleKey = (role || "dolgozó") as keyof typeof allPermissions;
      const approvalRequired = allPermissions[roleKey]?.["/munkak#approval_required"] !== false;

      // 3. Státusz meghatározása
      const autoApprove = isManager || !approvalRequired;
      const status = autoApprove ? "approved" : "pending";

      const finalApproverUid = autoApprove ? (isManager ? uid : "SYSTEM") : "";
      const finalApproverName = autoApprove ? (isManager ? displayName : "Automatikus") : "";

      const req: WorkRequest = {
        createdByUid: uid,
        createdByName: displayName,
        turnusId,
        dateISO,
        task,
        hours,
        note: form.note?.trim() || "",
        status: status,
        shiftOperatorUid: approverUid,
        ...(autoApprove ? {
          approvedByUid: finalApproverUid,
          approvedByName: finalApproverName,
          approvedAt: serverTimestamp() as any
        } : {})
      };

      // JAVÍTVA: farmCollection használata a mentésnél is!
      const docRef = await addDoc(farmCollection("workRequests"), { ...req, submittedAt: serverTimestamp() });

      // Értesítés küldése CSAK ha NEM autoApprove
      if (!autoApprove && approverUid) {
        try {
          await pushNotification(approverUid, {
            title: t("works.notif.new_title"),
            body: t("works.notif.new_body", { name: req.createdByName, hours: req.hours, task: req.task }),
            ref: { col: "workRequests", id: docRef.id, turnusId }
          });
        } catch (notifError) {
          console.warn("Értesítés hiba:", notifError);
        }
      }

      toast({
        title: autoApprove ? t("works.toast.recorded") : t("works.toast.submitted"),
        description: autoApprove ? t("works.toast.auto_approved") : t("works.toast.forwarded", { name: approverName })
      });

      setForm(prev => ({ ...prev, task: "", hours: 8, note: "" }));

    } catch (e: any) {
      console.error("Mentési hiba:", e);
      const msg = e?.code === "permission-denied" ? t("common.error") : (e?.message || t("common.error"));
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    }
  }

  const canIApprove = (req: WorkRequest) => {
    const currentUid = user?.authUid || auth.currentUser?.uid;
    if (!currentUid) return false;
    if (role === 'admin' || role === 'főnök') return true;
    if (req.shiftOperatorUid === currentUid) return true;
    return false;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">

      <Card className="shadow-md border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> {t("works.title")}
          </CardTitle>
          <CardDescription>{t("works.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 space-y-2">
              <Label>{t("works.date_label")}</Label>
              <Input
                type="date"
                value={form.dateISO}
                onChange={e => setForm(s => ({ ...s, dateISO: e.target.value }))}
                disabled={!canSetDate}
                className="font-bold"
              />
              {!canSetDate && <div className="text-xs text-muted-foreground">{t("works.date_only_today")}</div>}
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>{t("works.task_label")}</Label>
              <Input
                placeholder={t("works.task_placeholder")}
                value={form.task}
                onChange={e => setForm(s => ({ ...s, task: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("works.hours_label")}</Label>
              <Input
                type="number" min={0.5} step={0.5}
                value={form.hours}
                onChange={e => setForm(s => ({ ...s, hours: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-4 space-y-2">
              <Label>{t("works.note_label")}</Label>
              <Textarea
                rows={2}
                value={form.note}
                onChange={e => setForm(s => ({ ...s, note: e.target.value }))}
                placeholder={t("works.note_placeholder")}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
            <div className="text-sm text-muted-foreground flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-md">
              <UserCheck className="h-4 w-4 text-primary" />
              {targetShiftInfo ? (
                targetShiftInfo.uid === (user?.authUid || auth.currentUser?.uid) && role === 'dolgozó' ? (
                  <span>{t("works.approver_label")} <b>{t("works.approver_self")}</b></span>
                ) : (
                  <span>{t("works.approver_label")} <b>{targetShiftInfo.name}</b></span>
                )
              ) : (
                <span>{t("works.approver_label")} <b>{t("works.approver_management")}</b></span>
              )}
            </div>

            <Button className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90" onClick={submitWork}
              disabled={!authReady || !user || !turnusId}>
              <Save className="h-4 w-4" /> {t("works.submit_btn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        {/* Saját lista */}
        <Card>
          <CardHeader><CardTitle>{t("works.my_list_title")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("works.date_label")}</TableHead>
                  <TableHead>{t("works.task_label")}</TableHead>
                  <TableHead>{t("works.hours_label")}</TableHead>
                  <TableHead>Státusz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("works.no_records")}</TableCell>
                  </TableRow>
                ) : (
                  myList.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.dateISO}</TableCell>
                      <TableCell>{w.task}</TableCell>
                      <TableCell>{w.hours}</TableCell>
                      <TableCell>
                        {w.status === 'pending' && <Badge variant="secondary">{t("works.status.pending")}</Badge>}
                        {w.status === 'approved' && <Badge className="bg-emerald-600">{t("works.status.approved")}</Badge>}
                        {w.status === 'rejected' && <Badge variant="destructive">{t("works.status.rejected")}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Jóváhagyási lista (Csak ha van) */}
        {pendingForApproval.length > 0 && (
          <Card className="border-l-4 border-amber-500 shadow-md">
            <CardHeader>
              <CardTitle className="text-amber-700 flex items-center gap-2">
                <Info className="h-5 w-5" /> {t("works.approval_list_title")}
              </CardTitle>
              <CardDescription>
                {t("works.approval_list_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("works.date_label")}</TableHead>
                    <TableHead>{t("works.col.worker")}</TableHead>
                    <TableHead>{t("works.task_label")}</TableHead>
                    <TableHead>{t("works.hours_label")}</TableHead>
                    <TableHead className="text-right">{t("works.col.decision")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingForApproval.map(w => (
                    <TableRow key={w.id}>
                      <TableCell>{w.dateISO}</TableCell>
                      <TableCell className="font-bold">{w.createdByName}</TableCell>
                      <TableCell>{w.task}</TableCell>
                      <TableCell>{w.hours}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700 h-8"
                            disabled={!canIApprove(w)}
                            onClick={async () => {
                              const currentUid = user?.authUid || auth.currentUser?.uid;
                              if (!w.id || !currentUid) return;
                              await approveWorkRequest(w.id, currentUid, displayName);
                              toast({ title: t("works.toast.approved") });
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1 h-8"
                            disabled={!canIApprove(w)}
                            onClick={async () => {
                              const currentUid = user?.authUid || auth.currentUser?.uid;
                              if (!w.id || !currentUid) return;
                              await rejectWorkRequest(w.id, currentUid, displayName, "");
                              toast({ title: t("works.toast.rejected") });
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
