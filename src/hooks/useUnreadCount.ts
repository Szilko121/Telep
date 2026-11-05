import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { farmCollection } from "@/lib/farmDb";

export function useUnreadCount(uid?: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!uid) return;
    const q = query(farmCollection(`notifications/${uid}/items`), where("read", "==", false));
    return onSnapshot(q, (snap) => setCount(snap.size));
  }, [uid]);
  return count;
}
