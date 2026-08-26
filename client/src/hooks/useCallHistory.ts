import { useEffect, useRef } from "react";
import type { AuthUser } from "./useAuth";
import type { RemotePeer } from "./useCall";

// Only tracks *that a call happened and who was in it* — recordings still
// save straight to your own device, never touch the server, so there's
// nothing here to host or pay to store.
export function useCallHistory(user: AuthUser | null, roomId: string, peers: RemotePeer[]) {
  const historyIdRef = useRef<string | null>(null);
  const namesSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    fetch("/api/history/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    })
      .then((res) => res.json() as Promise<{ id?: string }>)
      .then((data) => {
        if (!cancelled && data.id) historyIdRef.current = data.id;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      const id = historyIdRef.current;
      if (!id) return;
      const participantNames = Array.from(namesSeenRef.current);
      fetch("/api/history/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, participantNames }),
        keepalive: true,
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roomId]);

  useEffect(() => {
    for (const peer of peers) {
      if (peer.name) namesSeenRef.current.add(peer.name);
    }
  }, [peers]);
}
