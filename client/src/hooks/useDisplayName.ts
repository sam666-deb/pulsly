import { useCallback, useState } from "react";

const STORAGE_KEY = "pulsly-name";

// sessionStorage, not localStorage — scoped per tab rather than per browser.
// Two tabs of the same browser (e.g. testing a call with yourself) are two
// different "people" as far as a call is concerned, so they shouldn't share
// a name just because they're the same origin.
export function useDisplayName() {
  const [name, setNameState] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));

  const setName = useCallback((value: string) => {
    const trimmed = value.trim().slice(0, 30);
    if (!trimmed) return;
    sessionStorage.setItem(STORAGE_KEY, trimmed);
    setNameState(trimmed);
  }, []);

  return { name, setName };
}
