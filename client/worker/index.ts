import { googleAuthStart, googleAuthCallback } from "./google";
import { requestMagicLink, verifyMagicLink } from "./magicLink";
import { getHistory, startHistory, endHistory, requireUser } from "./history";
import { parseCookies, setCookie } from "./cookies";
import { deleteSession } from "./db";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    if (pathname === "/api/auth/google/start") return googleAuthStart(env);
    if (pathname === "/api/auth/google/callback") return googleAuthCallback(request, env);
    if (pathname === "/api/auth/magic-link/request" && method === "POST") return requestMagicLink(request, env);
    if (pathname === "/api/auth/magic-link/verify") return verifyMagicLink(request, env);

    if (pathname === "/api/auth/me" && method === "GET") {
      const user = await requireUser(request, env);
      return Response.json({ user });
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      const cookies = parseCookies(request.headers.get("Cookie"));
      if (cookies.session) await deleteSession(env.DB, cookies.session);
      const headers = new Headers();
      headers.append("Set-Cookie", setCookie("session", "", { maxAge: 0 }));
      return new Response(null, { status: 204, headers });
    }

    if (pathname === "/api/history" && method === "GET") return getHistory(request, env);
    if (pathname === "/api/history/start" && method === "POST") return startHistory(request, env);
    if (pathname === "/api/history/end" && method === "POST") return endHistory(request, env);

    return env.ASSETS.fetch(request);
  },
};
