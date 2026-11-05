// src/services/auth.ts

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sha256Hex } from "@/utils/hash";

export type Role = "dolgozó" | "főnök" | "admin";

export type AuthUser = {
  id: string;
  username: string;
  displayName?: string;
  role: Role;
};

const LS_KEY = "telepnaplo.authUser.v1";

export async function loginWithUsernamePassword(username: string, password: string): Promise<AuthUser> {
  if (!db) throw new Error("Firebase nincs inicializálva (db=null).");
  const passHash = await sha256Hex(password);
  const q = query(
    collection(db, "users"),
    where("username", "==", username),
    where("passwordHash", "==", passHash),
    where("active", "==", true),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error("Hibás felhasználónév vagy jelszó.");
  }
  const doc = snap.docs[0];
  const data = doc.data() as any;
  const user: AuthUser = {
    id: doc.id,
    username: data.username,
    displayName: data.displayName || data.username,
    role: (data.role || "dolgozó") as Role,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(user));
  return user;
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem(LS_KEY);
}
