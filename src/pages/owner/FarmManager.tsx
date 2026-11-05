import { useEffect, useState } from "react";
import { useOwnerAuth } from "@/contexts/OwnerAuthContext";
import { useFarm } from "@/contexts/FarmContext";
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ownerDb } from "@/lib/firebaseOwners";
import { db, firebaseConfig } from "@/lib/firebase"; 
import { sha256Hex } from "@/utils/hash"; 
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Warehouse, Plus, ArrowRight, LogOut, Loader2, KeyRound } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// Auth importok: signInWithEmailAndPassword hozzáadva!
import { initializeApp } from "firebase/app"; 
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";

export default function FarmManager() {
  const { user, logout } = useOwnerAuth();
  const { selectFarm } = useFarm();
  const navigate = useNavigate();

  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [newFarmName, setNewFarmName] = useState("");
  const [farmPassword, setFarmPassword] = useState(""); 
  const [ownerUsername, setOwnerUsername] = useState<string>(""); 

  useEffect(() => {
    if (!user && !loading) {
        navigate("/owner/login");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
      if(!user) return;
      const fetchOwnerData = async () => {
          try {
              const ownerDocRef = doc(ownerDb, "owners", user.uid);
              const ownerSnap = await getDoc(ownerDocRef);
              if (ownerSnap.exists()) {
                  const data = ownerSnap.data();
                  setOwnerUsername(data.username || user.email?.split("@")[0] || "admin");
              }
          } catch (err) {
              console.error("Nem sikerült lekérni a tulajdonos adatait:", err);
          }
      };
      fetchOwnerData();
  }, [user]);

  const handleLogout = async () => {
      await logout();
      navigate("/owner/login");
  };

  useEffect(() => {
    if (!user) return;
    const loadFarms = async () => {
      try {
        const q = query(collection(ownerDb, "owners_farms"), where("ownerUid", "==", user.uid));
        const snap = await getDocs(q);
        setFarms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadFarms();
  }, [user]);

  const createFarm = async () => {
    if (!newFarmName.trim() || !user || !farmPassword.trim()) return;
    
    if (!ownerUsername) {
        toast({ title: "Hiba", description: "Nem található felhasználónév.", variant: "destructive" });
        return;
    }

    setIsCreating(true);
    try {
        const farmId = "farm_" + Date.now(); 
        const userDocId = ownerUsername.toLowerCase().trim();
        const userEmail = `${userDocId}@telep.hu`;

        // 1. Auth User kezelése (Létrehozás VAGY Belépés)
        const tempApp = initializeApp(firebaseConfig, "TempDataAppForCreation");
        const tempAuth = getAuth(tempApp);
        let createdAuthUid = "";

        try {
            console.log(`Kísérlet Auth létrehozásra: ${userEmail}`);
            const userCredential = await createUserWithEmailAndPassword(tempAuth, userEmail, farmPassword);
            createdAuthUid = userCredential.user.uid;
            
        } catch (authError: any) {
             // JAVÍTÁS: Ha a felhasználó már létezik, próbáljunk meg belépni
             if (authError.code === 'auth/email-already-in-use') {
                 console.log("Felhasználó létezik, próbálkozás belépéssel...");
                 try {
                     const loginCredential = await signInWithEmailAndPassword(tempAuth, userEmail, farmPassword);
                     createdAuthUid = loginCredential.user.uid;
                     console.log("Sikeres belépés (UID újrafelhasználása):", createdAuthUid);
                 } catch (loginError: any) {
                     // Ha a belépés is sikertelen (pl. rossz jelszó), akkor dobunk hibát
                     throw new Error(`Ez a felhasználónév (${userEmail}) már foglalt, és a megadott jelszó nem egyezik a meglévő fiókéval.`);
                 }
             } else {
                 throw authError;
             }
        } finally {
            // Mindenképp kijelentkezünk a temp appból
            await signOut(tempAuth);
        }

        // 2. Firestore adatok mentése
        // Owner DB
        await setDoc(doc(ownerDb, "owners_farms", farmId), {
            name: newFarmName,
            ownerUid: user.uid,
            createdAt: serverTimestamp()
        });

        // Farm DB Meta
        await setDoc(doc(db, "farms", farmId), {
            name: newFarmName,
            ownerEmail: user.email,
            ownerUid: user.uid,
            createdAt: serverTimestamp()
        });

        const passwordHash = await sha256Hex(farmPassword);

        // USER PROFIL (Data DB)
        await setDoc(doc(db, "farms", farmId, "users", userDocId), {
            username: ownerUsername,
            usernameLower: userDocId,
            email: userEmail, 
            passwordHash: passwordHash, 
            role: "főnök",
            displayName: user.displayName || "Tulajdonos",
            active: true,
            authUid: createdAuthUid, 
            muszakosId: null, 
            fonokId: userDocId, // <--- FONTOS: Főnök ID beállítása
            createdAt: serverTimestamp()
        });

        // USER_ROLES (Data DB)
        // Ez szintén a farmId alatt van, így nem írja felül a másik telepen lévő jogokat.
        await setDoc(doc(db, "farms", farmId, "user_roles", createdAuthUid), {
            role: "főnök",
            username: ownerUsername,
            fonokId: userDocId, // <--- FONTOS: Itt is beállítjuk
            createdAt: serverTimestamp()
        });

        toast({ title: "Siker", description: `Telep létrehozva! Főnök: ${ownerUsername}` });
        setFarms(prev => [...prev, { id: farmId, name: newFarmName }]);
        setNewFarmName("");
        setFarmPassword(""); 

    } catch (e: any) {
        console.error(e);
        toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
        setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <header className="max-w-4xl mx-auto flex justify-between items-center mb-8">
            <div>
                <h1 className="text-2xl font-bold text-emerald-400">FarmLog Pro</h1>
                <p className="text-slate-400 text-sm">
                    Bejelentkezve: <span className="text-white font-mono">{ownerUsername}</span> ({user?.email})
                </p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="text-slate-300 border-slate-700 hover:bg-slate-800">
                <LogOut className="mr-2 h-4 w-4"/> Kijelentkezés
            </Button>
        </header>

        <main className="max-w-4xl mx-auto space-y-8">
            <Card className="bg-slate-900 border-slate-800 shadow-xl">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <Plus className="h-5 w-5 text-emerald-500"/> Új Telep Hozzáadása
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Új telep létrehozásakor automatikusan létrejön egy 
                        <strong className="text-emerald-400 ml-1">Főnök</strong> fiók a 
                        <span className="font-mono bg-slate-800 px-1 mx-1 rounded text-white">{ownerUsername}</span> 
                        felhasználónévvel.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="farmname" className="text-slate-300">Telep neve</Label>
                        <Input 
                            id="farmname" 
                            placeholder="Pl. Napsugár Kft. 1-es telep" 
                            className="bg-slate-950 border-slate-700 text-white"
                            value={newFarmName}
                            onChange={e => setNewFarmName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="farmPass" className="text-slate-300 flex items-center gap-2">
                            <KeyRound className="h-3 w-3"/> Kezdő jelszó a Főnök fiókhoz
                        </Label>
                        <Input 
                            id="farmPass"
                            type="password" 
                            placeholder="Add meg a belépési jelszót..." 
                            className="bg-slate-950 border-slate-700 text-white focus:border-emerald-500"
                            value={farmPassword}
                            onChange={e => setFarmPassword(e.target.value)}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button 
                        onClick={createFarm} 
                        disabled={isCreating || !newFarmName || !farmPassword} 
                        className="bg-emerald-600 hover:bg-emerald-700 w-full md:w-auto"
                    >
                        {isCreating ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : null}
                        {isCreating ? "Létrehozás..." : "Telep és Fiók Létrehozása"}
                    </Button>
                </CardFooter>
            </Card>

            <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Warehouse className="h-5 w-5"/> Elérhető Telepeim
                </h2>
                
                {loading ? <div className="flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin"/> Betöltés...</div> : farms.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500">
                        Még nincs létrehozott teleped. Hozz létre egyet feljebb!
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {farms.map(farm => (
                            <Card key={farm.id} className="bg-slate-900 border-slate-800 hover:border-emerald-500/50 transition-all group cursor-pointer shadow-lg hover:shadow-emerald-900/10" onClick={() => selectFarm(farm.id, farm.name)}>
                                <CardHeader>
                                    <CardTitle className="text-white group-hover:text-emerald-400 transition-colors">{farm.name}</CardTitle>
                                    <CardDescription className="text-slate-500 font-mono text-xs">ID: {farm.id}</CardDescription>
                                </CardHeader>
                                <CardFooter className="border-t border-slate-800 pt-4">
                                    <Button variant="ghost" className="w-full text-slate-300 hover:text-white hover:bg-slate-800 justify-between">
                                        Belépés <ArrowRight className="h-4 w-4 text-emerald-500"/>
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </main>
    </div>
  );
}
