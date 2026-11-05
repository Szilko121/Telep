import { useEffect, useState } from "react";
import { getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { farmCollection } from "@/lib/farmDb"; // <--- FARM DB
import { getWatchlist, toggleWatchUser } from "@/services/watchlistService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Eye, User } from "lucide-react";

type UserItem = {
    uid: string; // Auth UID vagy Doc ID attól függően, hogy tárolod
    authUid?: string;
    displayName: string;
    role: string;
};

export default function WatchlistSettings() {
    const [users, setUsers] = useState<UserItem[]>([]);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // 1. Felhasználók betöltése (FARM-SZINTŰ)
                const q = query(farmCollection("users"));
                const snap = await getDocs(q);
                const userList: UserItem[] = [];
                snap.forEach(doc => {
                    const d = doc.data();
                    // Csak azokat listázzuk, akiknek van authUid-ja (be tudnak lépni)
                    if (d.authUid) {
                        userList.push({
                            uid: d.authUid,
                            authUid: d.authUid,
                            displayName: d.displayName || d.username || "Névtelen",
                            role: d.role || "dolgozó"
                        });
                    }
                });
                setUsers(userList);

                // 2. Figyelőlista betöltése
                const watchlist = await getWatchlist();
                setWatchedIds(watchlist);

            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleToggle = async (uid: string, checked: boolean) => {
        // Optimista UI frissítés
        setWatchedIds(prev => checked ? [...prev, uid] : prev.filter(id => id !== uid));

        // Mentés
        await toggleWatchUser(uid, checked);
    };

    if (loading) return <div>Betöltés...</div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-indigo-500" /> Megfigyelés beállítása
                </CardTitle>
                <CardDescription>
                    Ha bekapcsolod egy felhasználónál, minden Admin értesítést kap (az appon belül), amikor az illető bejelentkezik.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {users.map(u => (
                    <div key={u.uid} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border bg-white">
                                <AvatarFallback className="bg-indigo-50 text-indigo-700">
                                    {u.displayName.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <div className="font-semibold text-slate-800 flex items-center gap-2">
                                    {u.displayName}
                                    <Badge variant="outline" className="text-[10px] h-5">{u.role}</Badge>
                                </div>
                                <div className="text-xs text-slate-500 font-mono">{u.uid.substring(0, 8)}...</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground mr-2">
                                {watchedIds.includes(u.uid) ? "Figyelve" : ""}
                            </span>
                            <Switch
                                checked={watchedIds.includes(u.uid)}
                                onCheckedChange={(checked) => handleToggle(u.uid, checked)}
                            />
                        </div>
                    </div>
                ))}
                {users.length === 0 && <p className="text-center text-muted-foreground py-4">Nincs megjeleníthető felhasználó.</p>}
            </CardContent>
        </Card>
    );
}
