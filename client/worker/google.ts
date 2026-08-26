import { randomToken } from "./crypto";
import { parseCookies, setCookie } from "./cookies";
import { findOrCreateUser, createSession } from "./db";
import type { Env } from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function redirectUri(env: Env): string {
  return `${env.PUBLIC_URL}/api/auth/google/callback`;
}

export function googleAuthStart(env: Env): Response {
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const headers = new Headers();
  headers.set("Location", `${AUTH_URL}?${params}`);
  headers.append("Set-Cookie", setCookie("oauth_state", state, { maxAge: 600 }));
  return new Response(null, { status: 302, headers });
}

export async function googleAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("Cookie"));

  if (!code || !state || state !== cookies.oauth_state) {
    return new Response("Invalid or expired sign-in attempt. Please try again.", { status: 400 });
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return new Response("Google sign-in failed (token exchange).", { status: 502 });
  const tokenData = await tokenRes.json<{ access_token: string }>();

  const profileRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) return new Response("Google sign-in failed (profile fetch).", { status: 502 });
  const profile = await profileRes.json<{ email: string; name?: string; picture?: string }>();

  const user = await findOrCreateUser(env.DB, { email: profile.email, name: profile.name, picture: profile.picture });
  const sessionId = await createSession(env.DB, user.id);

  const headers = new Headers();
  headers.set("Location", "/");
  headers.append("Set-Cookie", setCookie("session", sessionId, { maxAge: 60 * 60 * 24 * 30 }));
  headers.append("Set-Cookie", setCookie("oauth_state", "", { maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}
