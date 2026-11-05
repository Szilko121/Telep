// src/lib/farmDb.ts
import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Ez a "telepnaplotelepek" (Data Project)

// Segédfüggvény: Kiolvassa a kiválasztott Farm ID-t a tárhelyből
const getFarmId = () => localStorage.getItem("current_farm_id");

/**
 * Multi-tenant Collection Helper
 * Helyettesíti a sima `collection(db, "users")` hívást.
 * Eredmény: `farms/{farmId}/users`
 */
export const farmCollection = (path: string, ...pathSegments: string[]) => {
  const farmId = getFarmId();
  if (!farmId) throw new Error("Nincs kiválasztott telep! (Internal Error)");
  return collection(db, "farms", farmId, path, ...pathSegments);
};

/**
 * Multi-tenant Document Helper
 * Helyettesíti a sima `doc(db, "users", id)` hívást.
 * Eredmény: `farms/{farmId}/users/{id}`
 */
export const farmDoc = (path: string, ...pathSegments: string[]) => {
  const farmId = getFarmId();
  if (!farmId) throw new Error("Nincs kiválasztott telep! (Internal Error)");
  return doc(db, "farms", farmId, path, ...pathSegments);
};
