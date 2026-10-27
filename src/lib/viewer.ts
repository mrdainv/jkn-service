import { useCallback, useState } from 'react';

// Per-viewer conveniences only (which facility or participant this browser is "signed in" as).
// Never used for shared data; storage may be unavailable, so every access is guarded.

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(`jkn-service/pref/${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(`jkn-service/pref/${key}`, value);
  } catch {
    // Private mode or blocked storage: the choice simply is not remembered.
  }
}

/** A remembered choice. The first resolved fallback is stored too, so a reload never switches it. */
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    const stored = readPref(key);
    if (stored === null) writePref(key, fallback);
    return stored ?? fallback;
  });
  const set = useCallback(
    (v: string) => {
      writePref(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set];
}
