export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  // Origin the worker is actually reachable at (used for OAuth redirect_uri
  // and links in emails) — e.g. https://pulsly.<subdomain>.workers.dev
  PUBLIC_URL: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  roomSlug: string;
}
