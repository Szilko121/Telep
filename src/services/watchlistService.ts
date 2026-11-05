import { 
  getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, 
  query, where, getDocs, addDoc, serverTimestamp 
} from "firebase/firestore";
import { farmDoc, farmCollection } from "@/lib/farmDb"; // <--- FONTOS IMPORT

const WATCHLIST_PATH = "settings"; // A farmDoc majd hozzáteszi a farm ID-t
const WATCHLIST_DOC_ID = "watchlist";

// --- 1. Admin beállítások: Kit figyeljünk? ---

export async function getWatchlist(): Promise<string[]> {
  try {
    // farmDoc("settings", "watchlist") -> farms/{farmId}/settings/watchlist
    const snap = await getDoc(farmDoc(WATCHLIST_PATH, WATCHLIST_DOC_ID));
    if (snap.exists()) {
      return snap.data().watchedUids || [];
    }
    return [];
  } catch (error) {
    console.error("Watchlist lekérdezési hiba:", error);
    return [];
  }
}

export async function toggleWatchUser(uid: string, watch: boolean) {
  const ref = farmDoc(WATCHLIST_PATH, WATCHLIST_DOC_ID);
  
  // Ha még nem létezik a doksi, létrehozzuk
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { watchedUids: [] });
  }

  await updateDoc(ref, {
    watchedUids: watch ? arrayUnion(uid) : arrayRemove(uid)
  });
}

// --- 2. Bejelentkezéskor futó logika: Adminok értesítése ---

export async function notifyAdminsIfWatched(user: { uid: string; displayName: string; role: string }) {
  try {
    // A) Megnézzük, rajta van-e a figyelőlistán (FARM SZINTŰ LISTA)
    const watchedUids = await getWatchlist();
    if (!watchedUids.includes(user.uid)) {
      return; // Nincs figyelés alatt
    }

    // B) Megkeressük az összes Admint a JELENLEGI TELEPEN
    const adminQuery = query(farmCollection("users"), where("role", "==", "admin"));
    const adminSnaps = await getDocs(adminQuery);

    if (adminSnaps.empty) return;

    // C) Értesítés küldése minden adminnak
    // Az értesítéseket is a farm alá mentjük: farms/{farmId}/notifications/{adminAuthUid}/items
    const promises = adminSnaps.docs.map(async (adminDoc) => {
      const adminData = adminDoc.data();
      const adminAuthUid = adminData.authUid; 

      if (adminAuthUid && adminAuthUid !== user.uid) {
        // farmCollection használata az értesítésekhez is!
        await addDoc(farmCollection(`notifications/${adminAuthUid}/items`), {
          title: "Figyelt felhasználó belépett!",
          body: `${user.displayName} (${user.role}) éppen most lépett be és aktív.`,
          type: "alert",
          read: false,
          createdAt: serverTimestamp()
        });
      }
    });

    await Promise.all(promises);
    console.log("Adminok értesítve a belépésről.");

  } catch (error) {
    console.error("Hiba az admin értesítésekor:", error);
  }
}
