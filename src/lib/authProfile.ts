// src/lib/authProfile.ts
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * Auth → Firestore "users/{uid}" tükör.
 * Ezt hívd meg egyszer az app indulásakor.
 */
export function setupUserProfileMirror() {
  const auth = getAuth();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    const base = {
      uid: user.uid,
      email: user.email ?? null,
      phoneNumber: user.phoneNumber ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      providerIds: user.providerData.map((p) => p.providerId),
      isAnonymous: user.isAnonymous ?? false,
      role: "dolgozó" as "dolgozó" | "főnök" | "admin",
    };

    if (!snap.exists()) {
      await setDoc(
        ref,
        {
          ...base,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await updateDoc(ref, { lastLoginAt: serverTimestamp() });
    }
  });
}
