import { useCallback, useState } from "react";

const STORAGE_KEY = "pulsly-name";

export function useDisplayName() {
  const [name, setNameState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const setName = useCallback((value: string) => {
    const trimmed = value.trim().slice(0, 30);
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setNameState(trimmed);
  }, []);

  return { name, setName };
}
