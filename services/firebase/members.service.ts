import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import type { Member } from '@/types/firestore';
import { converter } from './converters';
import { db } from './client';

type MemberDoc = Member & { id: string };

export function subscribeMembers(companyId: string, onData: (rows: Member[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'companies', companyId, 'members').withConverter(converter<MemberDoc>()),
    where('active', '==', true),
  );
  return onSnapshot(q, (snap) => onData(snap.docs.map((d) => ({ ...d.data(), uid: d.id }))));
}
