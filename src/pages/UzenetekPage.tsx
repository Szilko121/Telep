import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, auth } from "@/lib/firebase";
import {
    onSnapshot, query, updateDoc, where, writeBatch
} from "firebase/firestore";
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- FARM DB
import { approveWorkRequest, rejectWorkRequest, type WorkRequest } from "@/services/work";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
    Check, X, Bell, Clock, CheckCircle2,
    MessageSquare, Trash2, ListTodo, AlertCircle
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

// --- TÍPUSOK ---
type NotificationItem = {
    id: string;
    title: string;
    body: string;
    type?: "system" | "work" | "alert";
    createdAt: any;
    read: boolean;
};

export default function UzenetekPage() {
    const { user } = useAuth();
    const { t, language } = useLanguage();
    const [activeTab, setActiveTab] = useState("todo");

    // Adatok
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [pendingRequests, setPendingRequests] = useState<WorkRequest[]>([]);
    const [processedRequests, setProcessedRequests] = useState<WorkRequest[]>([]);

    const uid = user?.uid || auth.currentUser?.uid;
    const role = user?.role;

    // --- 1. ÉRTESÍTÉSEK BETÖLTÉSE ---
    useEffect(() => {
        if (!uid) return;

        // farmCollection használata + kliens oldali rendezés
        const q = query(farmCollection(`notifications/${uid}/items`));

        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NotificationItem[];
            list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setNotifications(list);
        });
        return () => unsub();
    }, [uid]);

    // --- 2. MUNKAKÉRELMEK BETÖLTÉSE ---
    useEffect(() => {
        if (!uid) return;

        const baseRef = farmCollection("workRequests");

        let qPending;

        if (role === 'admin' || role === 'főnök') {
            qPending = query(baseRef, where("status", "==", "pending"));
        } else {
            qPending = query(baseRef, where("shiftOperatorUid", "==", uid), where("status", "==", "pending"));
        }

        const unsubPending = onSnapshot(qPending, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as WorkRequest[];
            list.sort((a: any, b: any) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
            setPendingRequests(list);
        }, (err) => console.error("Pending query hiba:", err));

        const qHistory = query(
            baseRef,
            where("approvedByUid", "==", uid)
        );

        const unsubHistory = onSnapshot(qHistory, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as WorkRequest[];
            list.sort((a: any, b: any) => (b.approvedAt?.seconds || 0) - (a.approvedAt?.seconds || 0));
            setProcessedRequests(list);
        }, (err) => console.log("History query skip:", err.message));

        return () => { unsubPending(); unsubHistory(); };
    }, [uid, role]);


    // --- MŰVELETEK ---

    const handleMarkAllRead = async () => {
        if (!uid) return;
        const batch = writeBatch(db);
        const unreadDocs = notifications.filter(n => !n.read);

        if (unreadDocs.length === 0) {
            toast({ title: t("messages.inbox.no_new"), description: t("messages.inbox.all_read") });
            return;
        }

        unreadDocs.forEach(n => {
            const ref = farmDoc(`notifications/${uid}/items`, n.id);
            batch.update(ref, { read: true });
        });

        await batch.commit();
        toast({ title: t("common.success"), description: t("messages.inbox.success_mark") });
    };

    const handleDeleteNotification = async (id: string) => {
        if (!uid) return;
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(farmDoc(`notifications/${uid}/items`, id));
    };

    const handleApprove = async (req: WorkRequest) => {
        if (!uid || !req.id) return;
        try {
            await approveWorkRequest(req.id, uid, user?.displayName || "Vezető");
            toast({ title: t("messages.toast.approved"), description: t("messages.toast.approved_desc", { name: req.createdByName }) });
        } catch (e) {
            toast({ title: t("common.error"), description: "Nem sikerült a jóváhagyás.", variant: "destructive" });
        }
    };

    const handleReject = async (req: WorkRequest) => {
        if (!uid || !req.id) return;
        try {
            const reason = prompt(t("messages.todo.reject_reason")) || t("messages.todo.reject_default");
            await rejectWorkRequest(req.id, uid, user?.displayName || "Vezető", reason);
            toast({ title: t("messages.toast.rejected"), description: t("messages.toast.rejected_desc") });
        } catch (e) {
            toast({ title: t("common.error"), description: "Nem sikerült az elutasítás.", variant: "destructive" });
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const pendingCount = pendingRequests.length;

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 min-h-screen bg-slate-50/50">

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t("messages.title")}</h1>
                    <p className="text-muted-foreground">{t("messages.subtitle")}</p>
                </div>
            </div>

            <Tabs defaultValue="todo" value={activeTab} onValueChange={setActiveTab} className="w-full">

                <TabsList className="grid w-full grid-cols-3 mb-8 bg-white shadow-sm border">
                    <TabsTrigger value="todo" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 relative">
                        <ListTodo className="w-4 h-4 mr-2" />
                        {t("messages.tab.todo")}
                        {pendingCount > 0 && <Badge className="ml-2 bg-indigo-600 hover:bg-indigo-700 h-5 px-1.5">{pendingCount}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="inbox" className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 relative">
                        <Bell className="w-4 h-4 mr-2" />
                        {t("messages.tab.inbox")}
                        {unreadCount > 0 && <Badge className="ml-2 bg-amber-600 hover:bg-amber-700 h-5 px-1.5">{unreadCount}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="archive" className="data-[state=active]:bg-slate-100">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {t("messages.tab.archive")}
                    </TabsTrigger>
                </TabsList>

                {/* --- 1. FÜL: TEENDŐK --- */}
                <TabsContent value="todo" className="space-y-4">
                    {pendingRequests.length === 0 ? (
                        <Card className="bg-indigo-50/30 border-dashed border-2 flex flex-col items-center justify-center p-10 text-center">
                            <div className="bg-white p-4 rounded-full shadow-sm mb-4"><CheckCircle2 className="h-10 w-10 text-indigo-300" /></div>
                            <h3 className="text-lg font-medium text-indigo-900">{t("messages.todo.empty_title")}</h3>
                            <p className="text-sm text-indigo-700/70">{t("messages.todo.empty_desc")}</p>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {pendingRequests.map(req => (
                                <Card key={req.id} className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border bg-indigo-50 text-indigo-700 font-bold">
                                                    <AvatarFallback>{req.createdByName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <CardTitle className="text-base">{req.createdByName}</CardTitle>
                                                    <CardDescription className="text-xs">{req.dateISO}</CardDescription>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">{req.hours} {t("works.hours_label").split(' ')[1]}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pb-2">
                                        <p className="text-sm font-medium text-slate-800">{req.task}</p>
                                        {req.note && <p className="text-xs text-slate-500 mt-1 italic">"{req.note}"</p>}
                                    </CardContent>
                                    <CardFooter className="bg-slate-50/50 pt-2 pb-2 flex justify-end gap-2">
                                        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 border-red-200 h-8" onClick={() => handleReject(req)}>
                                            <X className="w-4 h-4 mr-1" /> {t("messages.todo.reject")}
                                        </Button>
                                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-8" onClick={() => handleApprove(req)}>
                                            <Check className="w-4 h-4 mr-1" /> {t("messages.todo.approve")}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* --- 2. FÜL: ÉRTESÍTÉSEK --- */}
                <TabsContent value="inbox" className="space-y-4">
                    <div className="flex justify-end mb-2">
                        <Button variant="ghost" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0} className="text-xs text-muted-foreground">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> {t("messages.inbox.mark_all")}
                        </Button>
                    </div>

                    <ScrollArea className="h-[600px] pr-4">
                        <div className="space-y-3">
                            {notifications.map(n => (
                                <div key={n.id} className={cn(
                                    "flex gap-4 p-4 rounded-xl border transition-all relative group",
                                    n.read ? "bg-white border-slate-100" : "bg-white border-amber-200 shadow-sm"
                                )}>
                                    <div className={cn("p-2 rounded-full h-fit",
                                        n.read ? "bg-slate-100 text-slate-400" : "bg-amber-100 text-amber-600"
                                    )}>
                                        {n.type === 'alert' ? <AlertCircle className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className={cn("text-sm font-semibold", n.read ? "text-slate-600" : "text-slate-900")}>{n.title}</h4>
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                                {n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleDateString(language === 'hu' ? 'hu-HU' : 'en-US') : "Ma"}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.body}</p>
                                    </div>
                                    <Button
                                        variant="ghost" size="icon"
                                        className="absolute right-2 bottom-2 h-6 w-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => handleDeleteNotification(n.id)}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            ))}
                            {notifications.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground">{t("messages.inbox.empty")}</div>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* --- 3. FÜL: ELŐZMÉNYEK --- */}
                <TabsContent value="archive">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t("messages.archive.title")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-0 divide-y">
                                {processedRequests.map(req => (
                                    <div key={req.id} className="py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={cn("w-2 h-2 rounded-full", req.status === 'approved' ? "bg-emerald-500" : "bg-red-500")} />
                                            <div>
                                                <p className="text-sm font-medium text-slate-900">
                                                    {req.createdByName} <span className="text-slate-400 mx-1">•</span> {req.hours} {t("works.hours_label").split(' ')[1]}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{req.task} ({req.dateISO})</p>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className={cn(
                                            "text-[10px] uppercase",
                                            req.status === 'approved' ? "text-emerald-600 border-emerald-200 bg-emerald-50" : "text-red-600 border-red-200 bg-red-50"
                                        )}>
                                            {req.status === 'approved' ? t("works.status.approved") : t("works.status.rejected")}
                                        </Badge>
                                    </div>
                                ))}
                                {processedRequests.length === 0 && (
                                    <div className="py-8 text-center text-xs text-muted-foreground">{t("messages.archive.empty")}</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
        </div>
    );
}
