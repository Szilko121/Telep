// src/services/work.ts
import {
  addDoc, getDocs, getDoc, serverTimestamp,
  Timestamp, updateDoc, query, where, limit
} from "firebase/firestore";
import { farmCollection, farmDoc } from "@/lib/farmDb";

export type WorkRequest = {
  id?: string;
  createdByUid: string;
  createdByName: string;
  turnusId: string;
  dateISO: string;           // "YYYY-MM-DD"
  task: string;
  hours: number;
  note?: string;
  status: "pending" | "approved" | "rejected";
  submittedAt?: Timestamp;
  // jóváhagyó (a kiválasztott nap műszakosa) auth uid-je
  shiftOperatorUid?: string;
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  rejectionReason?: string;
};

export async function createWorkRequest(req: WorkRequest) {
  const col = farmCollection("workRequests");
  const res = await addDoc(col, { ...req, submittedAt: serverTimestamp() });
  return res.id;
}

export async function approveWorkRequest(id: string, approverUid: string, approverName: string) {
  const ref = farmDoc("workRequests", id);
  await updateDoc(ref, {
    status: "approved",
    approvedByUid: approverUid,
    approvedByName: approverName,
    approvedAt: serverTimestamp(),
  });
}

export async function rejectWorkRequest(id: string, approverUid: string, approverName: string, reason?: string) {
  const ref = farmDoc("workRequests", id);
  await updateDoc(ref, {
    status: "rejected",
    approvedByUid: approverUid,
    approvedByName: approverName,
    approvedAt: serverTimestamp(),
    rejectionReason: reason || "",
  });
}

// ---- Segédek a műszakhoz ----
function fromISO(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function pad2(n: number) { return String(n).padStart(2, "0"); }
// function toISO(d:Date){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;} // Nem használt
function atLocal(iso: string, start = "07:00") {
  const [hh, mm] = (start || "07:00").split(":").map(Number);
  const d = fromISO(iso); d.setHours(hh || 0, mm || 0, 0, 0); return d;
}

/** A MEGADOTT NAPHOZ tartozó műszakos visszaadása (operator authUid + név). */
export async function getShiftForDate(turnusId: string, dateISO: string): Promise<{
  dateISO: string;
  operatorId: string;
  operatorName: string;
  operatorUid: string | null;
} | null> {
  const daysCol = farmCollection(`turnusok/${turnusId}/muszakBeosztasDays`);
  const q = query(daysCol, where("date", "==", dateISO), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const row = snap.docs[0].data() as any;
  const muszakId = row.operator?.id || "";
  let operatorUid: string | null = null;
  let operatorName = row.operator?.nev || "-";

  if (muszakId) {
    const muszakSnap = await getDoc(farmDoc("muszakosok", muszakId));
    if (muszakSnap.exists()) {
      const d = muszakSnap.data() as any;
      operatorUid = (d.authUid || "") || null; // <- fontos: authUid legyen kitöltve a muszakosnál
      if (!operatorName && d.nev) operatorName = d.nev;
    }
  }

  return {
    dateISO,
    operatorId: muszakId,
    operatorName,
    operatorUid
  };
}

/** AKTUÁLIS időpillanat szerinti műszakos (UI infóhoz jó). */
export async function getCurrentShift(turnusId: string) {
  const daysCol = farmCollection(`turnusok/${turnusId}/muszakBeosztasDays`);
  const snap = await getDocs(daysCol);
  const rows = snap.docs.map(d => d.data() as any)
    .filter(x => x?.date)
    .map(x => {
      const start = atLocal(x.date, x.shiftStart || "07:00");
      const hours = Number(x.shiftHours || 24);
      const end = new Date(start.getTime() + hours * 3600_000);
      return { ...x, start, end, hours };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const now = new Date();
  const current = rows.find(r => r.start <= now && now < r.end)
    ?? rows.filter(r => r.start <= now).pop()
    ?? null;

  if (!current) return null;

  const muszakId = current.operator?.id || "";
  const muszakSnap = muszakId ? await getDoc(farmDoc("muszakosok", muszakId)) : null;
  const authUid = muszakSnap?.exists() ? (muszakSnap.data() as any).authUid || "" : "";

  return {
    dateISO: current.date,
    operatorId: muszakId,
    operatorName: current.operator?.nev || "-",
    operatorUid: authUid || null,
    nextChangeAt: current.end,
  };
}

// egyszerű értesítés
export async function pushNotification(targetUid: string, payload: {
  title: string; body: string; type?: string; ref?: { col: string, id: string, turnusId: string }
}) {
  // farms/{farmId}/notifications/{uid}/items
  const col = farmCollection(`notifications/${targetUid}/items`);
  await addDoc(col, {
    ...payload,
    type: payload.type || "work",
    createdAt: serverTimestamp(),
    read: false,
  });
}
