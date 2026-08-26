export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // Origin the worker is actually reachable at (used for the OAuth
  // redirect_uri) — e.g. https://pulsly.<subdomain>.workers.dev
  PUBLIC_URL: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  roomSlug: string;
}
