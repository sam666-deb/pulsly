# Pulsly

Browser-based video calling. No accounts, no downloads — start a call, send the link.

## Status

Phase 1 of the build roadmap: 1:1 calling over WebRTC, signaling only through a WebSocket
server, STUN only (no TURN yet — that's phase 2).

## How it works

Your browser and the other person's browser negotiate a direct connection (WebRTC). The
`server` package only relays that negotiation — offers, answers, ICE candidates — never the
audio or video itself. Once connected, media flows peer-to-peer.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

This starts the signaling server on `ws://localhost:8080` and the client on
`http://localhost:5173`. Open the client in two browser tabs (or two devices) — the
first tab creates a room, the second joins it via the shared link.

## Project layout

```
client/   React + TypeScript frontend (Vite)
server/   WebSocket signaling server (Node + ws)
```

## Configuration

Copy `client/.env.example` to `client/.env` to point the client at a different signaling
server (e.g. once it's deployed):

```
VITE_SIGNALING_URL=wss://your-server-domain
```
