import { useSyncExternalStore } from 'react';

/** Header "Sound OFF" toggle — shared across screens. UI state only (no audio is bundled). */
let on = false;
const subs = new Set<() => void>();

export function useSound(): [boolean, () => void] {
  const value = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => on,
    () => on,
  );
  return [
    value,
    () => {
      on = !on;
      subs.forEach((f) => f());
    },
  ];
}
