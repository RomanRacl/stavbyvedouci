import { Timestamp, type FirestoreDataConverter, type DocumentData } from 'firebase/firestore';

/** Rekurzivně převede Timestamp -> Date (čtení) a Date -> Timestamp (zápis). */
function revive(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k, v]) => k !== 'id' && v !== undefined)
        .map(([k, v]) => [k, serialize(v)]),
    );
  }
  return value;
}

/** Generický typovaný konvertor; `id` se bere z cesty dokumentu, neukládá se do dat. */
export function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (model) => serialize(model) as DocumentData,
    fromFirestore: (snap, options) => ({ id: snap.id, ...(revive(snap.data(options)) as object) }) as T,
  };
}
