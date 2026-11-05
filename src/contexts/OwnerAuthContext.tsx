import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ownerAuth, ownerDb } from "@/lib/firebaseOwners";

export type OwnerUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  subscriptionPlan?: string | null;
  subscriptionValidUntil?: any | null;
};

type OwnerAuthContextType = {
  user: OwnerUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (params: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const OwnerAuthContext = createContext<OwnerAuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export const useOwnerAuth = () => useContext(OwnerAuthContext);

async function loadOwnerProfile(firebaseUser: FirebaseUser): Promise<OwnerUser> {
  const ref = doc(ownerDb, "owners", firebaseUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const base = {
      email: firebaseUser.email,
      name: firebaseUser.displayName || "",
      createdAt: serverTimestamp(),
      subscriptionPlan: "none",
      subscriptionValidUntil: null,
    };
    await setDoc(ref, base, { merge: true });
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: base.name,
      subscriptionPlan: base.subscriptionPlan,
      subscriptionValidUntil: base.subscriptionValidUntil,
    };
  }

  const data = snap.data() as any;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: data.name ?? data.displayName ?? firebaseUser.displayName ?? null,
    subscriptionPlan: data.subscriptionPlan ?? "none",
    subscriptionValidUntil: data.subscriptionValidUntil ?? null,
  };
}

export const OwnerAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<OwnerUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(ownerAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await loadOwnerProfile(firebaseUser);
        setUser(profile);
      } catch (err) {
        console.error("[OwnerAuth] Profil betöltési hiba:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(ownerAuth, email, password);
  };

  const register = async ({ name, email, password }: { name: string; email: string; password: string }) => {
    const cred = await createUserWithEmailAndPassword(ownerAuth, email, password);

    const ref = doc(ownerDb, "owners", cred.user.uid);
    await setDoc(
      ref,
      {
        email,
        name,
        createdAt: serverTimestamp(),
        subscriptionPlan: "none",
        subscriptionValidUntil: null,
      },
      { merge: true }
    );

    const profile: OwnerUser = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: name,
      subscriptionPlan: "none",
      subscriptionValidUntil: null,
    };

    setUser(profile);
  };

  const logout = async () => {
    await signOut(ownerAuth);
    setUser(null);
  };

  return (
    <OwnerAuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </OwnerAuthContext.Provider>
  );
};
