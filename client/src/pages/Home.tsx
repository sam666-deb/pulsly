import { useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { SunIcon, MoonIcon } from "../components/icons";
import { Brand } from "../components/Logo";
import "./Home.css";

function newRoomId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function Home({ onCreateRoom }: { onCreateRoom: (roomId: string) => void }) {
  const [joinCode, setJoinCode] = useState("");
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="home">
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      <div className="home-card">
        <Brand size={34} />
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
