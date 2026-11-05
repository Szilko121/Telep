// src/services/pluszorak.ts
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc, query, where, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db, waitForAuth } from "@/lib/firebase";

export type Pluszora = {
  createdBy: { uid: string; name: string; };
  date: string;                // 'YYYY-MM-DD'
  hours: number;
  type: string;                // pl. 'almolás'
  note?: string;
  status: "pending" | "accepted" | "rejected";
  shiftOperatorUid: string;
  createdAt: any;
  approvedBy?: { uid: string; name: string; };
  approvedAt?: any;
};

/** A nap azonosítója 'YYYY-MM-DD' (Budapest idõzóna szerint) */
export function toDateId(d = new Date(), timeZone = "Europe/Budapest") {
  const y = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(d);
  const m = new Intl.DateTimeFormat("en-CA", { timeZone, month: "2-digit" }).format(d);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, day: "2-digit" }).format(d);
  return `${y}-${m}-${day}`; // pl. 2025-10-28
}

/** +Óra kérelem beküldése "pending" státusszal (jóváhagyásra vár) */
export async function submitPluszora(input: {
  date: string;          // 'YYYY-MM-DD'
  hours: number;
  type: string;
  note?: string;
}) {
  const user = await waitForAuth();
  if (!user) throw new Error("Nincs bejelentkezve.");

  // Ki a mûszakos azon a napon?
  const shiftRef = doc(db, "shifts", input.date);
  const shiftSnap = await getDoc(shiftRef);
  if (!shiftSnap.exists()) {
    throw new Error(`Nincs mûszak beállítva a(z) ${input.date} napra.`);
  }
  const { operatorUid, operatorName } = shiftSnap.data() as { operatorUid: string; operatorName?: string };

  const payload: Pluszora = {
    createdBy: { uid: user.uid, name: (user.displayName || user.email || "ismeretlen") },
    date: input.date,
    hours: Number(input.hours),
    type: input.type,
    note: input.note || "",
    status: "pending",
    shiftOperatorUid: operatorUid,
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, "pluszorak"), payload);
}

/** Jóváhagyás vagy elutasítás (csak aznapi mûszakos vagy admin/fõnök) */
export async function approvePluszora(id: string, accept: boolean) {
  const user = await waitForAuth();
  if (!user) throw new Error("Nincs bejelentkezve.");

  await updateDoc(doc(db, "pluszorak", id), {
    status: accept ? "accepted" : "rejected",
    approvedBy: { uid: user.uid, name: (user.displayName || user.email || "ismeretlen") },
    approvedAt: serverTimestamp()
  });
}

/** A jelenlegi felhasználóra váró „pending” kérelmek figyelése (mûszakos értesítés) */
export async function listenMyPendingPluszorak(
  cb: (items: Array<{ id: string; data: Pluszora }>) => void
): Promise<Unsubscribe> {
  const user = await waitForAuth();
  if (!user) throw new Error("Nincs bejelentkezve.");

  const q = query(
    collection(db, "pluszorak"),
    where("shiftOperatorUid", "==", user.uid),
    where("status", "==", "pending")
  );

  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, data: d.data() as Pluszora }));
    cb(list);
  });
}
