import { useState } from "react";
import "./Home.css";

function newRoomId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function Home({ onCreateRoom }: { onCreateRoom: (roomId: string) => void }) {
  const [joinCode, setJoinCode] = useState("");

  return (
    <main className="home">
      <div className="home-card">
        <span className="eyebrow">Pulsly</span>
        <h1>Video calls, straight from the browser.</h1>
        <p className="lede">No account, no download. Start a call and send the link.</p>

        <button className="primary" onClick={() => onCreateRoom(newRoomId())}>
          Start a call
        </button>

        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            const code = joinCode.trim();
            if (code) onCreateRoom(code);
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Have a room code?"
            aria-label="Room code"
          />
          <button type="submit" className="secondary" disabled={!joinCode.trim()}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
