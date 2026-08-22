// Fallback used if the signaling server's ICE endpoint is unreachable.
// STUN alone can't punch through every NAT — a real TURN relay (fetched
// below, from our own coturn) is what makes calls across different
// networks reliable.
const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8080";
const ICE_SERVERS_URL = SIGNALING_URL.replace(/^ws/, "http") + "/ice-servers";

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(ICE_SERVERS_URL);
    if (!res.ok) return STUN_ONLY;
    const servers: RTCIceServer[] = await res.json();
    return servers.length ? servers : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  }
}
