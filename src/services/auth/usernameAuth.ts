// src/services/auth/usernameAuth.ts
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  linkWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import {
  db
} from "@/lib/firebase";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

/**
 * Egy belső, nem publikusan használt domain a "felhasználónév → email" trükkhöz.
 * Így a Firebase Auth e-mail/jelszó providerét tudjuk használni, miközben a UI-ban csak felhasználónév szerepel.
 */
const LOCAL_DOMAIN = "telep.local";

function normalizeUsername(u: string) {
  const trimmed = (u || "").trim();
  if (!trimmed) throw new Error("empty_username");
  // csak betű-szám-alsóvonás-pont kötőjel
  const ok = /^[a-zA-Z0-9._-]{3,32}$/.test(trimmed);
  if (!ok) throw new Error("invalid_username");
  return { original: trimmed, lower: trimmed.toLowerCase() };
}

function usernameToEmail(usernameLower: string) {
  return `${usernameLower}@${LOCAL_DOMAIN}`;
}

/**
 * Regisztráció felhasználónév + jelszóval.
 * Ha a felhasználó éppen anonim (Auth), akkor összelinkeljük, így megmarad az UID és a Firestore adatai.
 * Közben lefoglaljuk a `usernames/{usernameLower}` dokumentumot (egyediség).
 */
export async function createAccountWithUsername(username: string, password: string) {
  const { original, lower } = normalizeUsername(username);
  if ((password || "").length < 6) throw new Error("weak_password");

  const auth = getAuth();
  const current = auth.currentUser;
  const email = usernameToEmail(lower);

  // 1) Foglaljuk a usernevet tranzakcióval (ha már foglalt, dobjunk hibát)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "usernames", lower);
    const snap = await tx.get(ref);
    if (snap.exists()) {
      throw new Error("username_taken");
    }
    // Ideiglenesen tegyünk be egy "pending" recordot, hogy ne legyen versenyhelyzet.
    tx.set(ref, { pending: true, createdAt: serverTimestamp() });
  });

  try {
    let uid = "";
    if (current && current.isAnonymous) {
      // 2) Anonim → link e-mail/jelszóhoz
      const cred = EmailAuthProvider.credential(email, password);
      const linkRes = await linkWithCredential(current, cred);
      uid = linkRes.user.uid;
      await updateProfile(linkRes.user, { displayName: original });
    } else {
      // 2) Normál reg – létrehozzuk az Auth usert
      const res = await createUserWithEmailAndPassword(auth, email, password);
      uid = res.user.uid;
      await updateProfile(res.user, { displayName: original });
    }

    // 3) Véglegesítsük a username rekordot
    await setDoc(doc(db, "usernames", lower), {
      uid,
      username: original,
      email,
      createdAt: serverTimestamp(),
    });

    // 4) A users/{uid} profilt a setupUserProfileMirror fogja feltölteni/Frissíteni.
    return { uid, username: original };
  } catch (e) {
    // Ha bármi baj történik, takarítsuk el az ideiglenes username foglalást
    await deleteDoc(doc(db, "usernames", lower)).catch(() => {});
    throw e;
  }
}

/**
 * Bejelentkezés felhasználónév + jelszó.
 * A `usernames/{lower}` rekordból kivesszük az emailt, majd rendes e-mail/jelszó bejelentkezést végzünk.
 */
export async function signInWithUsername(username: string, password: string) {
  const { lower } = normalizeUsername(username);
  const mapSnap = await getDoc(doc(db, "usernames", lower));
  if (!mapSnap.exists()) throw new Error("username_not_found");
  const email = mapSnap.data()?.email as string;
  const auth = getAuth();
  return await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Felhasználónév csere (bejelentkezve).
 * Tranzakcióval foglalja az újat, törli a régit.
 */
export async function changeUsername(newUsername: string) {
  const { original, lower } = normalizeUsername(newUsername);
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("not_authenticated");

  await runTransaction(db, async (tx) => {
    const newRef = doc(db, "usernames", lower);
    const oldLower = (user.displayName || "").toLowerCase();
    const oldRef = doc(db, "usernames", oldLower);

    const newSnap = await tx.get(newRef);
    if (newSnap.exists()) throw new Error("username_taken");

    // töröljük a régit, létrehozzuk az újat
    if (oldLower) tx.delete(oldRef);
    tx.set(newRef, {
      uid: user.uid,
      username: original,
      email: usernameToEmail(lower),
      createdAt: serverTimestamp(),
    });
  });

  await updateProfile(auth.currentUser!, { displayName: original });
  // A users/{uid} mirrort az authProfile kezeli.
}
