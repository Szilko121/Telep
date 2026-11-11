// src/services/weightService.ts
import { 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  Timestamp, 
  deleteDoc, 
  updateDoc 
} from "firebase/firestore";
// FONTOS: farmCollection és farmDoc importálása a sima collection/doc/db helyett
import { farmCollection, farmDoc } from "@/lib/farmDb";

export interface WeightMeasurement {
  id?: string;
  batchId: string;
  barnId: string;
  barnName: string;
  date: string;
  /** Optional HH:mm local clock time for hour-accurate forecasting. */
  measuredTime?: string;
  ageInDays: number;
  headCount: number;
  totalWeight: number;
  averageWeight: number;
  note?: string;
  fcr?: number | null; 
  weather?: { temp: number; humidity: number } | null;
  createdAt: any;
}

export const addWeightMeasurement = async (data: Omit<WeightMeasurement, "id" | "createdAt">) => {
  try {
    const payload = {
      ...data,
      fcr: data.fcr ?? null,
      weather: data.weather ?? null,
      note: data.note ?? null,
      createdAt: Timestamp.now(),
    };

    // JAVÍTVA: farmCollection használata (farms/{farmId}/weights)
    const docRef = await addDoc(farmCollection("weights"), payload);
    console.log("Sikeres mentés, ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Hiba a súly mentésekor:", error);
    throw error;
  }
};

export const getWeightsByBatch = async (batchId: string) => {
  // console.log("--- Lekérdezés indítása ---");
  // console.log("Keresett Turnus ID:", batchId);

  try {
    // JAVÍTVA: farmCollection használata a root collection helyett
    const q = query(
      farmCollection("weights"),
      where("batchId", "==", batchId),
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);
    
    // console.log("Találatok száma:", snapshot.size);
    
    if (snapshot.empty) {
      console.warn("A lekérdezés lefutott, de üres listát adott vissza.");
    }

    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeightMeasurement));
    return results;

  } catch (error: any) {
    console.error("KRITIKUS HIBA a lekérdezéskor:", error);
    
    if (error.code === 'failed-precondition' || error.message.includes('index')) {
      console.error(">>> HIÁNYZÓ INDEX! Kattints a linkre a hibaüzenetben (ha van), vagy ellenőrizd a Firebase Console-t.");
    }
    
    if (error.code === 'permission-denied') {
      console.error(">>> JOGOSULTSÁG HIBA! Ellenőrizd a firestore.rules fájlt vagy a farmCollection útvonalát.");
    }

    return [];
  }
};

// --- ÚJ FUNKCIÓK A SZERKESZTÉSHEZ ÉS TÖRLÉSHEZ ---

export const deleteWeightMeasurement = async (id: string) => {
  try {
    // JAVÍTVA: farmDoc használata
    await deleteDoc(farmDoc("weights", id));
    console.log("Sikeres törlés:", id);
  } catch (error) {
    console.error("Hiba a törléskor:", error);
    throw error;
  }
};

export const updateWeightMeasurement = async (id: string, data: Partial<WeightMeasurement>) => {
  try {
    // JAVÍTVA: farmDoc használata
    await updateDoc(farmDoc("weights", id), data);
    console.log("Sikeres frissítés:", id);
  } catch (error) {
    console.error("Hiba a frissítéskor:", error);
    throw error;
  }
};
