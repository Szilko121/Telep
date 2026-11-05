// src/services/turnus.ts

import {
  collection, // fontos: erre panaszkodik most a runtime
  query,
  where,
  limit,
  getDocs,
  runTransaction,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db, waitForAuth } from "@/lib/firebase";
import { farmCollection, farmDoc } from "@/lib/farmDb";

export type TurnusDoc = {
  id: string;
  turnusId: string;
  active: boolean;
  createdAt: Timestamp;
  closedAt?: Timestamp | null;
  deploy?: {
    csoportId?: string | null;
    betelepitesDatum?: string | null; // YYYY-MM-DD
    csirkeDb?: number | null;
    olak?: Record<string, number> | any[];
    osszesCsirke?: number | null;
  };
};

export type ShiftConfig = {
  order?: string[];
  shiftStart?: string;
  shiftHours?: number;
  savedAt?: Timestamp;
};

const MONTH_HU = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "szept",
  "okt",
  "nov",
  "dec",
];

export function generateTurnusId(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = MONTH_HU[date.getMonth()];
  return `${y}${m}${seq}`;
}

export async function getActiveTurnus(): Promise<TurnusDoc | null> {
  await waitForAuth();

  console.log("[getActiveTurnus] start");

  const q = query(
    farmCollection("turnusok"),
    where("active", "==", true),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("[getActiveTurnus] no active turnus");
    return null;
  }

  const d = snap.docs[0];
  const res = { id: d.id, ...(d.data() as Omit<TurnusDoc, "id">) };
  console.log("[getActiveTurnus] found:", res);
  return res;
}

export async function getActiveTurnusId(): Promise<string | null> {
  const t = await getActiveTurnus();
  return t ? t.id : null;
}

export async function createTurnus(): Promise<TurnusDoc> {
  await waitForAuth();
  console.log("[createTurnus] start");
  const exist = await getActiveTurnus();
  if (exist) {
    console.error("[createTurnus] already have active turnus", exist);
    throw new Error("Már létezik egy aktív turnus. Először zárd le azt.");
  }

  await runTransaction(db, async (tx) => {
    const countersRef = farmDoc("meta", "counters");

    const countersSnap = await tx.get(countersRef);
    const total = countersSnap.exists() ? countersSnap.data().turnusTotal || 0 : 0;
    const next = total + 1;
    const now = new Date();
    const turnusId = generateTurnusId(now, next);

    console.log("[createTurnus][tx] next seq:", next, "turnusId:", turnusId);

    const tRef = doc(farmCollection("turnusok"));

    tx.set(tRef, {
      turnusId,
      active: true,
      createdAt: serverTimestamp(),
      deploy: {},
    });

    tx.set(countersRef, { turnusTotal: next }, { merge: true });

    const cfgRef = doc(tRef, "muszakBeosztas", "config");
    tx.set(cfgRef, { shiftStart: "07:00", shiftHours: 24 }, { merge: true });
  });

  const active = await getActiveTurnus();
  if (!active) {
    console.error("[createTurnus] active turnus not found after transaction");
    throw new Error("Turnus létrehozása nem sikerült.");
  }
  console.log("[createTurnus] done:", active);
  return active;
}

export async function saveDeploy(
  turnusDocId: string,
  data: Partial<TurnusDoc["deploy"]>
) {
  await waitForAuth();

  console.log("[saveDeploy] start", { turnusDocId, data });

  const ref = farmDoc("turnusok", turnusDocId);

  // deploy mező frissítése
  await updateDoc(ref, { deploy: data });
  console.log("[saveDeploy] deploy updated in turnus doc");

  if (data.csoportId && data.betelepitesDatum) {
    const cRef = farmDoc("csoportok", data.csoportId);
    await updateDoc(cRef, { betelepitesDatum: data.betelepitesDatum });
    console.log("[saveDeploy] csoport betelepitesDatum frissítve", {
      csoportId: data.csoportId,
      betelepitesDatum: data.betelepitesDatum,
    });
  }

  // Életkor újraszámolás – körülötte külön try/catch
  try {
    console.log(
      "[saveDeploy] calling recalcAgesForTurnus, typeof collection =",
      typeof collection
    );
    await recalcAgesForTurnus(turnusDocId);
    console.log("[saveDeploy] recalcAgesForTurnus finished ok");
  } catch (err) {
    console.error(
      "[saveDeploy] recalcAgesForTurnus ERROR:",
      err instanceof Error ? err.message : err,
      err
    );
    // opcionálisan NEM dobjuk tovább, hogy a UI ne essen szét:
    // ha azt akarod, hogy ne dobja fel hibának, kommenteld ki a következőt:
    // throw err;
  }
}

export async function closeTurnus(turnusDocId: string) {
  await waitForAuth();
  console.log("[closeTurnus] closing", { turnusDocId });
  const ref = farmDoc("turnusok", turnusDocId);
  await updateDoc(ref, { active: false, closedAt: serverTimestamp() });
  console.log("[closeTurnus] closed");
}

export async function getShiftConfig(
  turnusDocId: string
): Promise<ShiftConfig> {
  const ref = doc(
    farmDoc("turnusok", turnusDocId),
    "muszakBeosztas",
    "config"
  );
  const snap = await getDoc(ref);
  const res = snap.exists()
    ? (snap.data() as ShiftConfig)
    : { shiftStart: "07:00", shiftHours: 24 };
  console.log("[getShiftConfig]", { turnusDocId, res });
  return res;
}

export async function saveShiftConfig(
  turnusDocId: string,
  cfg: Partial<ShiftConfig>
) {
  const ref = doc(
    farmDoc("turnusok", turnusDocId),
    "muszakBeosztas",
    "config"
  );
  console.log("[saveShiftConfig] saving", { turnusDocId, cfg });
  await setDoc(ref, { ...cfg, savedAt: serverTimestamp() }, { merge: true });
  console.log("[saveShiftConfig] saved");
}

// ===== ÉLETKOR ÚJRASZÁMOLÁS =====

function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function diffDays(aISO: string, bISO: string): number {
  return Math.floor(
    (fromISO(aISO).getTime() - fromISO(bISO).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

/**
 * Újraszámolja az életkorokat az adott turnushoz tartozó összes napra.
 */
export async function recalcAgesForTurnus(turnusDocId: string) {
  console.log(
    "[recalcAgesForTurnus] START",
    { turnusDocId },
    "typeof collection =",
    typeof collection
  );

  // Ha valamiért mégis undefined a collection, logoljuk ki és lépjünk ki szépen.
  if (typeof collection === "undefined") {
    console.error(
      "[recalcAgesForTurnus] collection IS UNDEFINED! Valami nagyon nem oké az importtal."
    );
    return;
  }

  try {
    await waitForAuth();

    const tRef = farmDoc("turnusok", turnusDocId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) {
      console.warn("[recalcAgesForTurnus] turnus doc does not exist", {
        turnusDocId,
      });
      return;
    }

    // Csoportok
    const cSnap = await getDocs(farmCollection("csoportok"));
    const groups = cSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as Array<{
      id: string;
      nev: string;
      betelepitesDatum?: string | null;
    }>;

    console.log("[recalcAgesForTurnus] groups:", groups);

    // Napi doksik
    const daysRef = collection(tRef, "muszakBeosztasDays");
    console.log(
      "[recalcAgesForTurnus] daysRef created, typeof daysRef =",
      typeof daysRef
    );

    const dSnap = await getDocs(daysRef);
    console.log(
      "[recalcAgesForTurnus] found days:",
      dSnap.docs.map((d) => d.id)
    );

    const batch = writeBatch(db);
    let hasUpdates = false;

    dSnap.docs.forEach((docSnap) => {
      const d = docSnap.data();
      const iso = d.date || docSnap.id || toISO(new Date());
      const ages: Record<string, number | null> = { ...(d.ages || {}) };

      for (const g of groups) {
        const start = g.betelepitesDatum || null;
        if (!start) {
          ages[g.id] = null;
          continue;
        }
        const val = diffDays(iso, start);
        ages[g.id] = val < 0 ? null : val;
      }

      batch.update(docSnap.ref, { ages });
      hasUpdates = true;
    });

    if (hasUpdates) {
      console.log(
        "[recalcAgesForTurnus] committing batch updates for days, count =",
        dSnap.docs.length
      );
      await batch.commit();
      console.log("[recalcAgesForTurnus] batch commit done");
    } else {
      console.log(
        "[recalcAgesForTurnus] no days / no updates to apply, exiting"
      );
    }

    console.log("[recalcAgesForTurnus] END ok");
  } catch (err) {
    console.error(
      "[recalcAgesForTurnus] ERROR:",
      err instanceof Error ? err.message : err,
      err
    );
    // dobhatjuk tovább, ha akarod, hogy a hívó is lássa
    throw err;
  }
}
