// src/services/muszak.ts
import { waitForAuth } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { farmDoc } from "@/lib/farmDb"; // <--- FARM DB

/** Visszaadja az aktuális nap műszak adatait egy turnusban. */
export async function getCurrentShift(turnusId: string): Promise<{ operatorUid: string | null, operatorName: string, dateISO: string } | null> {
  const today = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dateISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  // farmDoc használata al-kollekcióhoz
  const ref = doc(farmDoc("turnusok", turnusId), "muszakBeosztasDays", dateISO);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return {
    operatorUid: d.operatorAuthUid || null,
    operatorName: (d.operator && d.operator.name) || d.operatorName || "-",
    dateISO
  };
}

/** Admin javító: beírja a muszakBeosztasDays/{dateISO}.operatorAuthUid mezőt, ha hiányzik. */
export async function fixOperatorAuthUid(turnusId: string, dateISO: string, operatorAuthUid: string) {
  await waitForAuth();
  const ref = doc(farmDoc("turnusok", turnusId), "muszakBeosztasDays", dateISO);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const d = snap.data() as any;
  if (d.operatorAuthUid !== operatorAuthUid) {
    await updateDoc(ref, { operatorAuthUid });
  }
}
