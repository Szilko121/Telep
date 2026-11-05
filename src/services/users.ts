// src/services/users.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // ha nálad máshol van, írd át

export type DbUser = {
  username: string;
  displayName?: string;
  passwordHash: string;
  role: 'dolgozo' | 'fonok' | 'admin';
  active?: boolean;
};

export async function getUserByUsername(username: string): Promise<(DbUser & { id: string }) | null> {
  const id = (username || '').trim().toLowerCase();
  if (!id) return null;
  const ref = doc(db, 'users', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as DbUser;
  return { id, ...data };
}
