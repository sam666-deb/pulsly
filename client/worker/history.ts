import { randomToken } from "./crypto";
import { parseCookies } from "./cookies";
import { getSessionUser } from "./db";
import type { Env, User } from "./types";

export async function requireUser(request: Request, env: Env): Promise<User | null> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  if (!cookies.session) return null;
  return getSessionUser(env.DB, cookies.session);
}

interface HistoryRow {
  id: string;
  roomId: string;
  startedAt: number;
  endedAt: number | null;
  participantNames: string;
}

export async function getHistory(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { results } = await env.DB.prepare(
    `SELECT id, room_id as roomId, started_at as startedAt, ended_at as endedAt,
            participant_names as participantNames
     FROM call_history WHERE user_id = ? ORDER BY started_at DESC LIMIT 50`,
  )
    .bind(user.id)
    .all<HistoryRow>();

  const history = results.map((r) => ({
    id: r.id,
    roomId: r.roomId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    participantNames: JSON.parse(r.participantNames) as string[],
  }));
  return Response.json({ history });
}

export async function startHistory(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let roomId: string | undefined;
  try {
    ({ roomId } = await request.json<{ roomId?: string }>());
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  if (!roomId) return Response.json({ error: "roomId required" }, { status: 400 });

  const id = randomToken(16);
  await env.DB.prepare(
    "INSERT INTO call_history (id, user_id, room_id, started_at, participant_names) VALUES (?, ?, ?, ?, '[]')",
  )
    .bind(id, user.id, roomId, Date.now())
    .run();
  return Response.json({ id });
}

export async function endHistory(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let id: string | undefined;
  let participantNames: string[] = [];
  try {
    const body = await request.json<{ id?: string; participantNames?: string[] }>();
    id = body.id;
    participantNames = body.participantNames ?? [];
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await env.DB.prepare("UPDATE call_history SET ended_at = ?, participant_names = ? WHERE id = ? AND user_id = ?")
    .bind(Date.now(), JSON.stringify(participantNames.slice(0, 20)), id, user.id)
    .run();
  return Response.json({ ok: true });
}
