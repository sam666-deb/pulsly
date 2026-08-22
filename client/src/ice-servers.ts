// Fallback used if Metered isn't configured, or its API is unreachable.
// STUN alone can't punch through every NAT — a real TURN relay (fetched below)
// is what makes calls across different networks reliable.
const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const APP_DOMAIN = import.meta.env.VITE_METERED_APP_DOMAIN;
// Must be a credential-scoped API key (from POST /api/v1/turn/credential),
// not the account Secret Key — that one is meant to stay server-side only.
const API_KEY = import.meta.env.VITE_METERED_API_KEY;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (!APP_DOMAIN || !API_KEY) return STUN_ONLY;

  try {
    const res = await fetch(
      `https://${APP_DOMAIN}/api/v1/turn/credentials?apiKey=${API_KEY}`,
    );
    if (!res.ok) return STUN_ONLY;
    const servers: RTCIceServer[] = await res.json();
    return servers.length ? servers : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  }
}
