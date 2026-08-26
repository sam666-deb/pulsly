import { useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { SunIcon, MoonIcon } from "../components/icons";
import { Brand } from "../components/Logo";
import "./Home.css";

function newRoomId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function AccountMenu({ navigate }: { navigate: (path: string) => void }) {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <button className="account-button" onClick={signInWithGoogle}>
        Sign in
      </button>
    );
  }

  return (
    <div className="account-menu-wrap">
      <button className="account-button" onClick={() => setOpen((v) => !v)}>
        {user.picture && <img src={user.picture} alt="" className="account-avatar" />}
        <span>{user.name ?? user.email}</span>
      </button>
      {open && (
        <div className="account-menu">
          <button
            onClick={() => {
              setOpen(false);
              navigate(`/room/${user.roomSlug}`);
            }}
          >
            Your room
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate("/history");
            }}
          >
            History
          </button>
          <button
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Home({ navigate }: { navigate: (path: string) => void }) {
  const [joinCode, setJoinCode] = useState("");
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="home">
      <AccountMenu navigate={navigate} />

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

        <button className="primary" onClick={() => navigate(`/room/${newRoomId()}`)}>
          Start a call
        </button>

        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            const code = joinCode.trim();
            if (code) navigate(`/room/${code}`);
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
