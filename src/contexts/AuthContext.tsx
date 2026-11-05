import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth } from "@/lib/firebase"; 
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  startUserSession,
  addActiveTime,
  endUserSession,
} from "@/services/activity";
import { notifyAdminsIfWatched } from "@/services/watchlistService";
import { farmCollection, farmDoc } from "@/lib/farmDb";

/* ---------------------- Firestore user típus ---------------------- */

export type AppUserDoc = {
  uid: string; // Auth UID
  username: string;
  displayName: string;
  role: "dolgozó" | "főnök" | "admin";
  authUid?: string;
  
  // Szerepkör specifikus ID-k
  muszakosId?: string; 
  fonokId?: string;
  adminId?: string;
};

/* ---------------------- AuthContext típus ---------------------- */

type AuthContextType = {
  user: AppUserDoc | null;
  loading: boolean;
  logout: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => { },
  login: async () => { },
});

export const useAuth = () => useContext(AuthContext);

/* ---------------------- Segédfüggvények ---------------------- */

// Profil betöltése a KIVÁLASZTOTT FARM ALÓL
async function loadUserProfile(firebaseUser: FirebaseUser): Promise<AppUserDoc | null> {
  try {
    // 1. Keresés authUid alapján a farm users kollekciójában
    const q = query(
      farmCollection("users"), 
      where("authUid", "==", firebaseUser.uid)
    );
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const snap = querySnapshot.docs[0];
      const data = snap.data() as Omit<AppUserDoc, "uid">;
      return {
        ...data,
        uid: firebaseUser.uid,
      };
    }

    // 2. Fallback: Username alapján (első belépés / migráció)
    const email = firebaseUser.email || "";
    const usernameFromEmail = email.split("@")[0];

    if (!usernameFromEmail) {
      console.error("AuthContext: nincs email/username.");
      return null;
    }

    const userRef = farmDoc("users", usernameFromEmail);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.error(`AuthContext: User nem található a telepen: ${usernameFromEmail}`);
      return null;
    }

    // AuthUID összekapcsolása (Migráció)
    await setDoc(
      userRef,
      { authUid: firebaseUser.uid },
      { merge: true }
    );

    const data = userSnap.data() as Omit<AppUserDoc, "uid">;
    return {
      ...data,
      uid: firebaseUser.uid,
    };

  } catch (err: any) {
    console.error("AuthContext: profil betöltési hiba:", err);
    if (err.code === 'permission-denied') {
        console.error("JOGOSULTSÁG HIBA: Nem olvasható a 'users' kollekció. Ellenőrizd a Firestore Rules-t!");
    }
    return null;
  }
}

// Szerepkör ÉS azonosítók szinkronizálása a farm alá (user_roles)
async function syncUserRole(uid: string, data: Omit<AppUserDoc, "uid">) {
  try {
    const roleRef = farmDoc("user_roles", uid);
    
    const roleData: any = {
      role: data.role,
      username: data.username,
      updatedAt: serverTimestamp()
    };

    if (data.muszakosId) roleData.muszakosId = data.muszakosId;
    if (data.fonokId) roleData.fonokId = data.fonokId;
    if (data.adminId) roleData.adminId = data.adminId;

    await setDoc(roleRef, roleData, { merge: true });
  } catch (e) {
    console.error("AuthContext: user_roles szinkronizálási hiba:", e);
  }
}

/* ---------------------- AuthProvider ---------------------- */

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AppUserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Session lezárása (CSAK AKKOR HÍVD, HA MÉG VAN AUTH JOG!)
  const closeCurrentSessionSafe = async () => {
    if (!sessionIdRef.current) return;
    try {
      await endUserSession(sessionIdRef.current);
    } catch (e) { console.error("Session lezárás hiba:", e); } 
    finally { setSessionId(null); }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          // Itt már nincs bejelentkezett felhasználó, ezért TILOS adatbázisba írni.
          // Csak a helyi állapotot töröljük.
          setUser(null);
          setSessionId(null);
          sessionIdRef.current = null;
          setLoading(false);
          return;
        }

        const finalUser = await loadUserProfile(firebaseUser);

        if (!finalUser) {
          console.error("AuthContext: Nem sikerült betölteni a profilt (vagy nincs joga).");
          // Ha sikertelen a profil betöltés, kijelentkeztetjük
          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }

        setUser(finalUser);
        
        // Jogosultságok és ID-k frissítése
        await syncUserRole(firebaseUser.uid, finalUser);

        // Itt még van User, tehát lezárhatjuk az esetleg beragadt előző sessiont
        await closeCurrentSessionSafe();

        notifyAdminsIfWatched({
            uid: firebaseUser.uid,
            displayName: finalUser.displayName,
            role: finalUser.role
        });

        try {
          const newSessionId = await startUserSession(firebaseUser.uid, finalUser.username);
          setSessionId(newSessionId);
        } catch (e) {
          console.error("Session indítás hiba:", e);
        }

      } catch (error) {
        console.error("AuthContext: Kritikus hiba az auth folyamatban:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        addActiveTime(sessionId, 60_000).catch(() => {});
      }
    }, 60_000);
    
    // Ablak bezárásakor megpróbáljuk lezárni (best effort)
    const handleBeforeUnload = () => { if (sessionIdRef.current) endUserSession(sessionIdRef.current).catch(() => { }); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => { clearInterval(interval); window.removeEventListener("beforeunload", handleBeforeUnload); };
  }, [sessionId]);

  const logout = async () => {
    try {
      // 1. ELŐSZÖR zárjuk le a sessiont, amíg még be vagyunk jelentkezve (van Firestore írási jog)
      await closeCurrentSessionSafe();
      
      // 2. CSAK UTÁNA léptetjük ki az Auth-ból
      await signOut(auth);
    } catch (e) { 
      console.error("Logout hiba:", e); 
      // Ha hiba van, akkor is kényszerítjük a kilépést
      await signOut(auth);
    } finally { 
      setUser(null); 
    }
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, login }}>
      {loading ? (
        <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-white">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
            <p className="text-sm text-slate-400">{t("common.loading")}</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
