import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Brand } from "../components/Logo";
import "./History.css";

interface HistoryEntry {
  id: string;
  roomId: string;
  startedAt: number;
  endedAt: number | null;
  participantNames: string[];
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(startedAt: number, endedAt: number | null): string {
  if (!endedAt) return "in progress";
  const totalSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function History({ onBack }: { onBack: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/history")
      .then((res) => res.json() as Promise<{ history: HistoryEntry[] }>)
      .then((data) => setEntries(data.history))
      .catch(() => setEntries([]));
  }, [user]);

  return (
    <main className="history-page">
      <header className="history-header">
        <Brand size={22} />
        <button className="secondary" onClick={onBack}>
          Back
        </button>
      </header>

      <div className="history-body">
        <h1>Call history</h1>

        {authLoading && <p className="lede">Loading…</p>}

        {!authLoading && !user && (
          <p className="lede">Sign in from the home page to see your call history.</p>
        )}

        {!authLoading && user && entries === null && <p className="lede">Loading…</p>}

        {!authLoading && user && entries !== null && entries.length === 0 && (
          <p className="lede">No calls yet — history starts recording once you sign in and join a call.</p>
        )}

        {entries && entries.length > 0 && (
          <ul className="history-list">
            {entries.map((entry) => (
              <li key={entry.id} className="history-entry">
                <div className="history-entry-main">
                  <span className="history-room">Room {entry.roomId}</span>
                  <span className="history-when">{formatDateTime(entry.startedAt)}</span>
                </div>
                <div className="history-entry-meta">
                  <span>{formatDuration(entry.startedAt, entry.endedAt)}</span>
                  {entry.participantNames.length > 0 && <span>with {entry.participantNames.join(", ")}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
