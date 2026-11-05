import {
  query, where, limit, getDocs, runTransaction,
  doc, setDoc, serverTimestamp, updateDoc, Timestamp, getDoc, collection
} from "firebase/firestore";
import { db, waitForAuth } from "@/lib/firebase";
import { farmCollection, farmDoc } from "@/lib/farmDb"; // <--- FONTOS: farmDb importálása

export type TurnusDoc = {
  id: string;
  turnusId: string;
  active: boolean;
  createdAt: Timestamp;
  closedAt?: Timestamp | null;
  deploy?: {
    csoportId?: string | null;
    betelepitesDatum?: string | null; // YYYY-MM-DD (globális entry a UI-hoz)
    csirkeDb?: number | null;
    olak?: Record<string, number>; // olId -> betelepített darab
  };
};

export type ShiftConfig = {
  order?: string[];
  shiftStart?: string; // "HH:mm", local time (default "07:00")
  shiftHours?: number; // default 24
  savedAt?: Timestamp;
};

const MONTH_HU = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "szept", "okt", "nov", "dec"];

export function generateTurnusId(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = MONTH_HU[date.getMonth()];
  return `${y}${m}${seq}`;
}

export async function getActiveTurnus(): Promise<TurnusDoc | null> {
  await waitForAuth();
  // farmCollection használata!
  const q = query(farmCollection("turnusok"), where("active", "==", true), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<TurnusDoc, "id">) };
}

export async function createTurnus(): Promise<TurnusDoc> {
  await waitForAuth();
  const exist = await getActiveTurnus();
  if (exist) throw new Error("Már létezik egy aktív turnus. Először zárd le azt.");

  await runTransaction(db, async (tx) => {
    // farmDoc használata!
    const countersRef = farmDoc("meta", "counters");
    const countersSnap = await tx.get(countersRef);
    const total = countersSnap.exists() ? (countersSnap.data().turnusTotal || 0) : 0;
    const next = total + 1;
    const now = new Date();
    const turnusId = generateTurnusId(now, next);

    // Új turnus dokumentum létrehozása (automatikusan generált ID-vel vagy manuálissal, itt auto)
    // Mivel a tx.set-hez docRef kell, és a farmCollection nem ad docRef-et közvetlenül új doksihoz,
    // ezért manuálisan generálunk egy ID-t vagy használjuk a doc() függvényt a farmCollection útvonalával.
    // De a farmDb.ts-ben a farmDoc függvény fix ID-t vár.
    // Megoldás: Kérünk egy új docRef-et a farmCollection-ből.

    // Mivel a farmCollection egy CollectionReference-t ad vissza:
    const tRef = doc(farmCollection("turnusok"));

    tx.set(tRef, {
      turnusId, active: true, createdAt: serverTimestamp(), deploy: {},
    });
    tx.set(countersRef, { turnusTotal: next }, { merge: true });

    // default shift config -> al-kollekció elérése
    // farmDoc nem támogatja közvetlenül az al-kollekciókat argumentumként, 
    // ezért manuálisan fűzzük össze az útvonalat vagy használjuk a doc() függvényt a szülőre.
    // A legegyszerűbb, ha a tRef-ből indulunk ki.
    const cfgRef = doc(tRef, "muszakBeosztas", "config");
    tx.set(cfgRef, { shiftStart: "07:00", shiftHours: 24 }, { merge: true });
  });

  const active = await getActiveTurnus();
  if (!active) throw new Error("Turnus létrehozása nem sikerült.");
  return active;
}

export async function saveDeploy(turnusDocId: string, data: Partial<TurnusDoc["deploy"]>) {
  await waitForAuth();
  // farmDoc használata!
  const ref = farmDoc("turnusok", turnusDocId);
  await updateDoc(ref, { deploy: data });

  if (data.csoportId && data.betelepitesDatum) {
    const cRef = farmDoc("csoportok", data.csoportId);
    await updateDoc(cRef, { betelepitesDatum: data.betelepitesDatum });
  }

  await recalcAgesForTurnus(turnusDocId);
}

export async function closeTurnus(turnusDocId: string) {
  await waitForAuth();
  const ref = farmDoc("turnusok", turnusDocId);
  await updateDoc(ref, { active: false, closedAt: serverTimestamp() });
}

export async function getShiftConfig(turnusDocId: string): Promise<ShiftConfig> {
  // Al-kollekció elérése farmDoc segítségével
  const ref = doc(farmDoc("turnusok", turnusDocId), "muszakBeosztas", "config");
  const snap = await getDoc(ref);
  return (snap.exists() ? (snap.data() as ShiftConfig) : { shiftStart: "07:00", shiftHours: 24 });
}

export async function saveShiftConfig(turnusDocId: string, cfg: Partial<ShiftConfig>) {
  const ref = doc(farmDoc("turnusok", turnusDocId), "muszakBeosztas", "config");
  await setDoc(ref, { ...cfg, savedAt: serverTimestamp() }, { merge: true });
}

export async function checkShiftExpiry(turnusId: string): Promise<{ expired: boolean, lastDate: string | null }> {
  await waitForAuth();
  // Al-kollekció elérése
  const daysRef = collection(farmDoc("turnusok", turnusId), "muszakBeosztasDays");
  const q = query(daysRef, limit(1), where("date", ">", "2000-01-01"));

  const snap = await getDocs(daysRef); // Itt a daysRef már a query része lehetne, de a logikát megtartjuk
  if (snap.empty) return { expired: false, lastDate: null };

  const dates = snap.docs.map(d => d.id).sort();
  const lastDate = dates[dates.length - 1];

  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return { expired: lastDate < todayISO, lastDate };
}

// === ÉLETKOR ÚJRASZÁMOLÁS ===

function fromISO(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m - 1), d); }
function toISO(d: Date): string { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${dd}`; }
function diffDays(aISO: string, bISO: string): number { return Math.floor((fromISO(aISO).getTime() - fromISO(bISO).getTime()) / (1000 * 60 * 60 * 24)); }

export async function recalcAgesForTurnus(turnusDocId: string) {
  await waitForAuth();
  const tRef = farmDoc("turnusok", turnusDocId);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) return;

  const cSnap = await getDocs(farmCollection("csoportok"));
  const groups = cSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string; nev: string; betelepitesDatum?: string | null }>;

  const daysRef = collection(tRef, "muszakBeosztasDays");
  const dSnap = await getDocs(daysRef);
  const dayDocs = dSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string; date: string; ages?: Record<string, number | null> }>;

  for (const d of dayDocs) {
    const iso = d.date || d.id || toISO(new Date());
    const ages: Record<string, number | null> = { ...(d.ages || {}) };
    for (const g of groups) {
      const start = g.betelepitesDatum || null;
      if (!start) { ages[g.id] = null; continue; }
      const val = diffDays(iso, start);
      ages[g.id] = (val < 0 ? null : val);
    }

    const docRef = doc(daysRef, iso);
    await setDoc(docRef, { ages }, { merge: true });

    const idxRef = doc(tRef, "agesByDate", iso);
    await setDoc(idxRef, { date: iso, ages }, { merge: true });
  }
}
