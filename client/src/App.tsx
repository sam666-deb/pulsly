import { useState, useEffect } from "react";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";
import { History } from "./pages/History";

function roomIdFromPath(path: string): string | null {
  const match = path.match(/^\/room\/([\w-]+)$/);
  return match ? match[1] : null;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    setPath(to);
  };

  const roomId = roomIdFromPath(path);
  if (roomId) return <Room roomId={roomId} onLeave={() => navigate("/")} />;
  if (path === "/history") return <History onBack={() => navigate("/")} />;
  return <Home navigate={navigate} />;
}
