import {
  addDoc,
  serverTimestamp,
  updateDoc,
  increment,
} from "firebase/firestore";
// FONTOS: farmDb használata a sima db helyett!
import { farmCollection, farmDoc } from "@/lib/farmDb"; 

export type UserSessionDoc = {
  userId: string;
  username?: string | null;
  loginAt: any;
  logoutAt?: any | null;
  activeMs: number;
  lastUpdateAt: any;
};

/**
 * Új session indítása a JELENLEGI TELEPEN.
 */
export async function startUserSession(userId: string, username?: string) {
  // farmCollection("userSessions") -> farms/{farmId}/userSessions
  const ref = await addDoc(farmCollection("userSessions"), {
    userId,
    username: username ?? null,
    loginAt: serverTimestamp(),
    logoutAt: null,
    activeMs: 0,
    lastUpdateAt: serverTimestamp(),
  } as Partial<UserSessionDoc>);

  return ref.id;
}

/**
 * Aktív idő hozzáadása ms-ben.
 */
export async function addActiveTime(sessionId: string, deltaMs: number) {
  // farmDoc használata
  const ref = farmDoc("userSessions", sessionId);
  await updateDoc(ref, {
    activeMs: increment(deltaMs),
    lastUpdateAt: serverTimestamp(),
  });
}

/**
 * Session lezárása.
 */
export async function endUserSession(sessionId: string) {
  const ref = farmDoc("userSessions", sessionId);
  await updateDoc(ref, {
    logoutAt: serverTimestamp(),
  });
}

export function formatActiveDurationHMS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hStr = String(hours);
  const mStr = minutes.toString().padStart(2, "0");
  const sStr = seconds.toString().padStart(2, "0");

  return `${hStr}:${mStr}:${sStr}`;
}

export function formatActiveDurationHu(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} óra`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes} perc`);
  parts.push(`${seconds} másodperc`);

  return parts.join(" ");
}
