import { useState, useEffect } from "react";
import { Home } from "./Home";
import { Room } from "./Room";

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
  return roomId ? (
    <Room roomId={roomId} onLeave={() => navigate("/")} />
  ) : (
    <Home onCreateRoom={(id) => navigate(`/room/${id}`)} />
  );
}
