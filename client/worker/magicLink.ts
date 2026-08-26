import { randomToken } from "./crypto";
import { setCookie } from "./cookies";
import { findOrCreateUser, createSession } from "./db";
import type { Env } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_LIFETIME_MS = 15 * 60 * 1000;

export async function requestMagicLink(request: Request, env: Env): Promise<Response> {
  let email: string | undefined;
  try {
    ({ email } = await request.json<{ email?: string }>());
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO magic_links (token, email, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)")
    .bind(token, email, now, now + LINK_LIFETIME_MS)
    .run();

  const verifyUrl = `${env.PUBLIC_URL}/api/auth/magic-link/verify?token=${token}`;
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: "Sign in to Pulsly",
      html: `<p>Click below to sign in to Pulsly. This link expires in 15 minutes.</p><p><a href="${verifyUrl}">Sign in to Pulsly</a></p>`,
    }),
  });

  if (!emailRes.ok) {
    const detail = await emailRes.text().catch(() => "");
    console.error("Resend send failed", emailRes.status, detail);
    return Response.json({ error: "Could not send the sign-in email. Please try again." }, { status: 502 });
  }

  return Response.json({ ok: true });
}

export async function verifyMagicLink(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing sign-in token.", { status: 400 });

  const row = await env.DB.prepare("SELECT email, expires_at, used FROM magic_links WHERE token = ?")
    .bind(token)
    .first<{ email: string; expires_at: number; used: number }>();

  if (!row || row.used || row.expires_at < Date.now()) {
    return new Response("This sign-in link is invalid or has expired. Request a new one.", { status: 400 });
  }
  await env.DB.prepare("UPDATE magic_links SET used = 1 WHERE token = ?").bind(token).run();

  const user = await findOrCreateUser(env.DB, { email: row.email });
  const sessionId = await createSession(env.DB, user.id);

  const headers = new Headers();
  headers.set("Location", "/");
  headers.append("Set-Cookie", setCookie("session", sessionId, { maxAge: 60 * 60 * 24 * 30 }));
  return new Response(null, { status: 302, headers });
}
