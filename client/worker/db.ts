import { randomToken } from "./crypto";
import type { User } from "./types";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  room_slug: string;
}

function rowToUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, picture: row.picture, roomSlug: row.room_slug };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  return row ? rowToUser(row) : null;
}

async function generateUniqueRoomSlug(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomToken(4); // 8 hex chars, matches the ad-hoc room code format
    const existing = await db.prepare("SELECT 1 FROM users WHERE room_slug = ?").bind(slug).first();
    if (!existing) return slug;
  }
  throw new Error("could not generate a unique room slug");
}

export async function createUser(
  db: D1Database,
  info: { email: string; name?: string | null; picture?: string | null },
): Promise<User> {
  const id = randomToken(16);
  const roomSlug = await generateUniqueRoomSlug(db);
  await db
    .prepare("INSERT INTO users (id, email, name, picture, room_slug, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, info.email, info.name ?? null, info.picture ?? null, roomSlug, Date.now())
    .run();
  return { id, email: info.email, name: info.name ?? null, picture: info.picture ?? null, roomSlug };
}

export async function findOrCreateUser(
  db: D1Database,
  info: { email: string; name?: string | null; picture?: string | null },
): Promise<User> {
  const existing = await findUserByEmail(db, info.email);
  if (existing) return existing;
  return createUser(db, info);
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const id = randomToken(32);
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, now, now + SESSION_LIFETIME_MS)
    .run();
  return id;
}

export async function getSessionUser(db: D1Database, sessionId: string): Promise<User | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.picture, u.room_slug
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, Date.now())
    .first<UserRow>();
  return row ? rowToUser(row) : null;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}
