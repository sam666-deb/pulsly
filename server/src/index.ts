import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "./types.js";

// Phase 1 scope: 1:1 calls only. Bump this once group calls (phase 3) land.
const MAX_PEERS_PER_ROOM = 2;
const PORT = Number(process.env.PORT) || 8080;

interface Peer {
  id: string;
  ws: WebSocket;
  room: string;
}

const rooms = new Map<string, Peer[]>();

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function otherPeer(room: string, selfId: string): Peer | undefined {
  return rooms.get(room)?.find((p) => p.id !== selfId);
}

function leaveRoom(peer: Peer): void {
  const peers = rooms.get(peer.room);
  if (!peers) return;
  const remaining = peers.filter((p) => p.id !== peer.id);
  if (remaining.length === 0) {
    rooms.delete(peer.room);
  } else {
    rooms.set(peer.room, remaining);
    for (const p of remaining) {
      send(p.ws, { type: "peer-left", peerId: peer.id });
    }
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let self: Peer | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "malformed message" });
      return;
    }

    if (msg.type === "join") {
      if (self) return; // already joined a room on this connection
      const room = String(msg.room || "").slice(0, 64);
      if (!room) {
        send(ws, { type: "error", message: "room is required" });
        return;
      }

      const existing = rooms.get(room) ?? [];
      if (existing.length >= MAX_PEERS_PER_ROOM) {
        send(ws, { type: "room-full" });
        ws.close();
        return;
      }

      self = { id: randomUUID(), ws, room };
      rooms.set(room, [...existing, self]);

      const peer = otherPeer(room, self.id);
      console.log(`[join] room=${room} self=${self.id.slice(0, 8)} existingPeer=${peer?.id.slice(0, 8) ?? "none"}`);
      send(ws, { type: "joined", selfId: self.id, peerId: peer?.id ?? null });
      if (peer) {
        send(peer.ws, { type: "peer-joined", peerId: self.id });
      }
      return;
    }

    if (msg.type === "signal") {
      if (!self) return;
      const target = otherPeer(self.room, self.id);
      console.log(
        `[signal] room=${self.room} from=${self.id.slice(0, 8)} to=${msg.to.slice(0, 8)} kind=${msg.data.kind} matched=${target?.id === msg.to}`,
      );
      if (target && target.id === msg.to) {
        send(target.ws, { type: "signal", from: self.id, data: msg.data });
      }
      return;
    }
  });

  ws.on("close", () => {
    if (self) {
      console.log(`[leave] room=${self.room} self=${self.id.slice(0, 8)}`);
      leaveRoom(self);
    }
  });
});

console.log(`Pulsly signaling server listening on ws://localhost:${PORT}`);
