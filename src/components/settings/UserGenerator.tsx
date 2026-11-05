import React, { useCallback, useEffect, useState } from "react";
import { farmDoc, farmCollection } from "@/lib/farmDb";
import { getDocs, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
// HOZZÁADVA: signInWithEmailAndPassword importálása
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "@/lib/firebase";
import { sha256Hex } from "@/utils/hash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { useFarm } from "@/contexts/FarmContext";

type Role = "dolgozó" | "főnök" | "admin";
type Muszakos = { id: string; name: string; raw: any; };

function toDocIdFromUsername(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "");
}

function pickName(data: any): string {
    return data?.displayName ?? data?.name ?? data?.nev ?? "Név nélkül";
}

async function loadMuszakosok(): Promise<Muszakos[]> {
    const snap = await getDocs(farmCollection("muszakosok"));
    return snap.docs.map((d) => ({ id: d.id, name: pickName(d.data()), raw: d.data() }));
}

function getSecondaryAuth() {
    let secondaryApp;
    if (getApps().length > 1) {
        secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
    } else {
        secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    }
    return getAuth(secondaryApp);
}

// Paraméterek típusa
type RegisterParams = {
    username: string;
    password: string;
    displayName: string;
    role: Role;
    active: boolean;
    muszakosId: string | null;
};

// ==========================================
// JAVÍTOTT FÜGGVÉNY
// ==========================================
async function registerAndSaveUser({
    username, password, displayName, role, active, muszakosId
}: RegisterParams) {
    const docId = toDocIdFromUsername(username);
    if (!docId) throw new Error("Érvénytelen felhasználónév.");

    const email = `${docId}@telep.hu`;
    const secondaryAuth = getSecondaryAuth();
    let createdAuthUid = "";

    // 1. Auth User Létrehozása VAGY Megkeresése
    try {
        console.log(`Auth regisztráció: ${email}`);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        createdAuthUid = userCredential.user.uid;
        await signOut(secondaryAuth);
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            console.log("Auth user létezik, UID megszerzése belépéssel...");
            // Ha már létezik az Auth user, megpróbálunk belépni a megadott jelszóval, hogy megkapjuk az UID-t.
            try {
                const credential = await signInWithEmailAndPassword(secondaryAuth, email, password);
                createdAuthUid = credential.user.uid;
                await signOut(secondaryAuth);
                console.log("Meglévő user azonosítva:", createdAuthUid);
            } catch (loginErr: any) {
                // Ha a jelszó nem egyezik, vagy egyéb hiba van
                if (loginErr.code === 'auth/wrong-password') {
                    throw new Error("Ez a felhasználónév már létezik a rendszerben (másik telepen), de a megadott jelszó helytelen.");
                }
                throw new Error("A felhasználó létezik, de nem sikerült azonosítani: " + loginErr.message);
            }
        } else {
            throw error;
        }
    }

    if (!createdAuthUid) throw new Error("Nem sikerült az UID megszerzése.");

    const passHash = await sha256Hex(password);

    // --- ID GENERÁLÁS (Admin/Főnök) ---
    let finalMuszakosId = null;
    let finalFonokId = null;
    let finalAdminId = null;

    if (role === 'dolgozó') {
        finalMuszakosId = muszakosId; 
    } else if (role === 'főnök') {
        finalFonokId = docId; 
    } else if (role === 'admin') {
        finalAdminId = docId; 
    }

    // 2. USERS Mentése (Farm DB)
    // Most már nem érdekel minket, hogy létezett-e előtte a doksi, 
    // mindenképpen felülírjuk/összefésüljük (merge: true) az aktuális telepre vonatkozó adatokkal.
    const userRef = farmDoc("users", docId);
    const userData: any = {
        authUid: createdAuthUid,
        username,
        usernameLower: docId,
        email,
        passwordHash: passHash,
        role,
        displayName,
        active,
        updatedAt: serverTimestamp(),
        // createdAt-et nem írjuk felül, ha már létezik
    };

    // Csak új létrehozásnál állítsuk be a createdAt-et
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
        userData.createdAt = serverTimestamp();
    }

    if (finalMuszakosId) userData.muszakosId = finalMuszakosId;
    if (finalFonokId) userData.fonokId = finalFonokId;
    if (finalAdminId) userData.adminId = finalAdminId;

    await setDoc(userRef, userData, { merge: true });

    // 3. USER_ROLES Mentése (Farm DB - Jogosultság)
    const roleRef = farmDoc("user_roles", createdAuthUid);
    const userRoleData: any = {
        role: role,
        username: username,
        updatedAt: serverTimestamp()
    };

    if (finalMuszakosId) userRoleData.muszakosId = finalMuszakosId;
    if (finalFonokId) userRoleData.fonokId = finalFonokId;
    if (finalAdminId) userRoleData.adminId = finalAdminId;

    await setDoc(roleRef, userRoleData, { merge: true });

    // 4. MŰSZAKOSOK kollekció frissítése (CSAK DOLGOZÓKNÁL)
    if (role === 'dolgozó' && finalMuszakosId) {
        const muszakosRef = farmDoc("muszakosok", finalMuszakosId);
        await setDoc(muszakosRef, {
            nev: displayName,
            displayName: displayName,
            linkedUserDocId: docId,
            authUid: createdAuthUid,
            updatedAt: serverTimestamp()
        }, { merge: true });
    }

    return { email, uid: createdAuthUid };
}

export default function UserGenerator() {
    const { farmName } = useFarm();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("titkos123");
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState<Role>("dolgozó");
    const [active, setActive] = useState(true);
    const [muszakosok, setMuszakosok] = useState<Muszakos[]>([]);
    const [muszakosId, setMuszakosId] = useState<string>("");
    const [log, setLog] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const list = await loadMuszakosok();
                setMuszakosok(list);
                if (list.length > 0) setMuszakosId(list[0].id);
            } catch (e: any) { console.warn("Műszakosok betöltése hiba:", e.message); }
        })();
    }, []);

    useEffect(() => {
        if (role !== 'dolgozó') {
            setMuszakosId("");
        } else if (!muszakosId && muszakosok.length > 0) {
            setMuszakosId(muszakosok[0].id);
        }
    }, [role, muszakosok]);

    const run = useCallback(async () => {
        if (role === 'dolgozó' && !muszakosId) {
            setLog(l => ["HIBA: Dolgozónál kötelező műszakost választani!", ...l]);
            return;
        }

        setBusy(true);
        setLog((l) => [`Feldolgozás (${farmName})...`, ...l]);

        try {
            const result = await registerAndSaveUser({
                username, password, displayName, role, active,
                muszakosId: role === 'dolgozó' ? muszakosId : null
            });

            setLog((l) => [`SIKER! ${result.email} létrehozva/frissítve (Role: ${role}).`, ...l]);
            toast({ title: "Siker", description: "Felhasználó rögzítve." });

            setUsername(""); setDisplayName("");
        } catch (e: any) {
            console.error(e);
            setLog((l) => ["HIBA: " + e.message, ...l]);
            toast({ title: "Hiba", description: e.message, variant: "destructive" });
        } finally { setBusy(false); }
    }, [username, password, displayName, role, active, muszakosId, farmName]);

    return (
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    Felhasználó Generátor
                </CardTitle>
                <CardDescription>
                    Új felhasználók létrehozása a(z) {farmName} telepen.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Felhasználónév</Label>
                        <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="pl. kovacs.janos" />
                    </div>
                    <div className="space-y-2">
                        <Label>Jelszó</Label>
                        <Input value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Teljes Név</Label>
                        <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="pl. Kovács János" />
                    </div>
                    <div className="space-y-2">
                        <Label>Jogosultság</Label>
                        <Select value={role} onValueChange={(v: any) => setRole(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="főnök">Főnök</SelectItem>
                                <SelectItem value="dolgozó">Dolgozó</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {role === 'dolgozó' && (
                        <div className="space-y-2 md:col-span-2">
                            <Label>Műszakos kiválasztása (Kötelező)</Label>
                            <Select value={muszakosId} onValueChange={setMuszakosId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {muszakosok.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <div className="pt-4">
                    <Button onClick={run} disabled={busy} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500">
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Felhasználó Létrehozása
                    </Button>
                </div>

                {log.length > 0 && (
                    <div className="mt-4 bg-muted/50 p-3 rounded-lg h-32 overflow-y-auto text-xs font-mono border border-border">
                        {log.map((l, i) => <div key={i} className="py-0.5 border-b border-border/50 last:border-0">{l}</div>)}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
