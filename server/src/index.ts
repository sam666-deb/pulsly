import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "./types.js";
import { RateLimiter } from "./rate-limit.js";

// Phase 3: small full-mesh group calls. Each client opens a direct connection
// to every other peer, so cost/bandwidth grows with the square of room size —
// keep this modest until there's a real SFU in front of larger rooms.
const MAX_PEERS_PER_ROOM = 4;
const PORT = Number(process.env.PORT) || 8080;

// Trust X-Real-IP only from loopback (i.e. our own nginx) — a client
// connecting directly could otherwise forge any IP it wants and dodge
// these limits entirely. Direct access to this port is also firewalled
// off at the network level; nginx is the only intended path in.
function getClientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? "unknown";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (isLoopback) {
    const forwarded = req.headers["x-real-ip"];
    if (typeof forwarded === "string" && forwarded) return forwarded;
  }
  return remote;
}

const connectionLimiter = new RateLimiter(15, 60_000); // 15 new WS connections / IP / minute
const iceServersLimiter = new RateLimiter(20, 60_000); // 20 credential fetches / IP / minute
const MESSAGE_LIMIT = 60;
const MESSAGE_WINDOW_MS = 10_000; // 60 signaling messages / connection / 10s

setInterval(() => {
  connectionLimiter.sweep();
  iceServersLimiter.sweep();
}, 5 * 60_000).unref();

// Coturn's static-auth-secret — used to mint short-lived TURN credentials via
// the standard REST-API scheme (username = expiry timestamp, credential =
// HMAC-SHA1(secret, username)). Coturn validates this itself; nothing here
// needs to be trusted beyond keeping the secret off the client.
const TURN_SECRET = process.env.TURN_SECRET;
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? "localhost";

function iceServers(): unknown[] {
  const stun = { urls: `stun:${PUBLIC_HOST}:3478` };
  if (!TURN_SECRET) return [stun];

  const username = String(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
  const credential = createHmac("sha1", TURN_SECRET).update(username).digest("base64");
  return [
    stun,
    { urls: `turn:${PUBLIC_HOST}:3478?transport=udp`, username, credential },
    { urls: `turn:${PUBLIC_HOST}:3478?transport=tcp`, username, credential },
  ];
}

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

function otherPeers(room: string, selfId: string): Peer[] {
  return rooms.get(room)?.filter((p) => p.id !== selfId) ?? [];
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

const httpServer = createServer((req, res) => {
  if (req.url === "/ice-servers") {
    const ip = getClientIp(req);
    if (!iceServersLimiter.check(ip)) {
      console.log(`[rate-limit] ice-servers ip=${ip}`);
      res.writeHead(429, { "Content-Type": "text/plain" }).end("Too Many Requests");
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(iceServers()));
    return;
  }
  res.writeHead(426, { "Content-Type": "text/plain" }).end("Upgrade Required");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const ip = getClientIp(req);
  if (!connectionLimiter.check(ip)) {
    console.log(`[rate-limit] connection ip=${ip}`);
    ws.close(1008, "rate limited");
    return;
  }

  let self: Peer | null = null;
  const messageTimestamps: number[] = [];

  ws.on("message", (raw) => {
    const now = Date.now();
    while (messageTimestamps.length && messageTimestamps[0] <= now - MESSAGE_WINDOW_MS) {
      messageTimestamps.shift();
    }
    messageTimestamps.push(now);
    if (messageTimestamps.length > MESSAGE_LIMIT) {
      console.log(`[rate-limit] messages ip=${ip}`);
      ws.close(1008, "rate limited");
      return;
    }

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

      const peers = otherPeers(room, self.id);
      console.log(
        `[join] room=${room} self=${self.id.slice(0, 8)} existingPeers=${peers.length ? peers.map((p) => p.id.slice(0, 8)).join(",") : "none"}`,
      );
      send(ws, { type: "joined", selfId: self.id, peerIds: peers.map((p) => p.id) });
      for (const peer of peers) {
        send(peer.ws, { type: "peer-joined", peerId: self.id });
      }
      return;
    }

    if (msg.type === "signal") {
      if (!self) return;
      const target = rooms.get(self.room)?.find((p) => p.id === msg.to);
      console.log(
        `[signal] room=${self.room} from=${self.id.slice(0, 8)} to=${msg.to.slice(0, 8)} kind=${msg.data.kind} matched=${!!target}`,
      );
      if (target) {
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

httpServer.listen(PORT, () => {
  console.log(`Pulsly signaling server listening on ws://localhost:${PORT}`);
});
