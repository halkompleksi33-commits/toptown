import { register as registerAuth } from "./src/routes/auth.js";
import { register as registerRooms } from "./src/routes/rooms.js";
import { register as registerRoomFun } from "./src/routes/room-fun.js";
import { register as registerPresence } from "./src/routes/presence.js";
import { register as registerChat } from "./src/routes/chat.js";
import { register as registerEconomy } from "./src/routes/economy.js";
import { register as registerPlaylist } from "./src/routes/playlist.js";
import { register as registerSocial } from "./src/routes/social.js";
import { register as registerModeration } from "./src/routes/moderation.js";
import { register as registerAdmin } from "./src/routes/admin.js";
import { register as registerAdminManagement } from "./src/routes/admin-management.js";
import { register as registerImages } from "./src/routes/images.js";
import { register as registerLevels } from "./src/routes/levels.js";
import { migrate } from "./src/database.js";
import {
  hashPassword,
  verifyPassword,
  createAuthLimiter,
} from "./src/security.js";
import express from "express";
import { createServer } from "node:http";
import pg from "pg";
import { randomUUID, createHash } from "node:crypto";
const app = express(),
  server = createServer(app),
  db = process.env.DATABASE_URL
    ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
    : null,
  users = new Map(),
  sessions = new Map(),
  rooms = new Map(),
  presence = new Map(),
  messages = new Map(),
  signals = new Map(),
  notifications = new Map(),
  friends = new Map();
const state = { messageId: 0 };
const hash = (x) => createHash("sha256").update(String(x)).digest("hex"),
  key = (x) =>
    String(x || "")
      .trim()
      .toLocaleLowerCase("tr-TR"),
  fail = (r, s, e) => r.status(s).json({ error: e }),
  me = (q) => sessionUser(q),
  now = () => Date.now(),
  prof = (u) => ({
    id: u.id,
    name: u.name,
    emoji: u.emoji || "🙂",
    city: u.city,
    age: u.age,
    coins: u.coins,
    avatar: u.avatar || "",
    xp: u.xp || 0,
    level: 1 + Math.floor((u.xp || 0) / 1000),
  }),
  yt = (x) =>
    x
      ? (String(x).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1]
      : null;
const save = async (u) => {
  if (db)
    await db.query(
      "INSERT INTO users(id,name,login,city,age,password,coins,emoji,avatar,xp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,city=EXCLUDED.city,age=EXCLUDED.age,password=EXCLUDED.password,coins=EXCLUDED.coins,emoji=EXCLUDED.emoji,avatar=EXCLUDED.avatar,xp=EXCLUDED.xp",
      [
        u.id,
        u.name,
        u.login,
        u.city,
        u.age,
        u.password,
        u.coins,
        u.emoji,
        u.avatar || "",
        u.xp || 0,
      ],
    );
};
const notice = async (id, text) => {
  let n = { id: randomUUID(), text, created: now() },
    a = notifications.get(id) || [];
  a.unshift(n);
  notifications.set(id, a.slice(0, 100));
  if (db)
    await db.query(
      "INSERT INTO notifications(id,user_id,text,created) VALUES($1,$2,$3,$4)",
      [n.id, id, n.text, n.created],
    );
};
const people = (id) =>
    [...presence]
      .filter(([, p]) => p.room === id)
      .map(([id, p]) =>
        users.has(id)
          ? { ...prof(users.get(id)), seat: p.seat, muted: !!p.muted }
          : null,
      )
      .filter(Boolean),
  inRoom = (id, room) => presence.get(id)?.room === room;
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
async function issueSession(user) {
  const token = randomUUID() + randomUUID(),
    record = { userId: user.id, expires: now() + SESSION_AGE };
  if (db)
    await db.query(
      "INSERT INTO auth_sessions(token,user_id,expires) VALUES($1,$2,$3)",
      [token, record.userId, record.expires],
    );
  sessions.set(token, record);
  return token;
}
function sessionUser(req) {
  const token = (req.get("authorization") || "").replace(/^Bearer /, ""),
    record = sessions.get(token);
  if (!record || record.expires < now()) {
    sessions.delete(token);
    return null;
  }
  return users.get(record.userId);
}
async function restoreSessions() {
  if (!db) return;
  await db.query(
    "CREATE TABLE IF NOT EXISTS auth_sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires BIGINT NOT NULL)",
  );
  await db.query("DELETE FROM auth_sessions WHERE expires<$1", [now()]);
  for (const row of (await db.query("SELECT * FROM auth_sessions")).rows)
    sessions.set(row.token, { userId: row.user_id, expires: +row.expires });
}
async function roomEvent(roomId, user, kind, text) {
  if (!user) return;
  const entry = {
    id: ++state.messageId,
    name: user.name,
    user_id: user.id,
    kind,
    text,
    created: now(),
  };
  if (db)
    await db.query(
      "INSERT INTO messages(id,room_id,user_id,name,kind,text,created) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [entry.id, roomId, user.id, entry.name, kind, text, entry.created],
    );
  const history = messages.get(roomId) || [];
  history.push(entry);
  messages.set(roomId, history);
}
async function leaveRoom(userId) {
  const p = presence.get(userId);
  if (!p) return;
  presence.delete(userId);
  signals.delete(userId);
  await roomEvent(p.room, users.get(userId), "leave", "odadan ayrıldı.");
}
setInterval(() => {
  for (const [id, p] of presence)
    if (now() - (p.seen || 0) > 60000) leaveRoom(id).catch(console.error);
}, 15000).unref();

async function boot() {
  if (db) {
    await migrate(db);
    let a = {
      id: randomUUID(),
      name: "admin",
      login: "admin",
      city: "Mersin",
      age: 18,
      password: await hashPassword(process.env.ADMIN_PASSWORD || randomUUID()),
      coins: 1000,
      emoji: "🛡️",
      avatar: "",
      xp: 0,
    };
    await db.query(
      "INSERT INTO users(id,name,login,city,age,password,coins,emoji,avatar,xp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(login) DO NOTHING",
      [
        a.id,
        a.name,
        a.login,
        a.city,
        a.age,
        a.password,
        a.coins,
        a.emoji,
        "",
        0,
      ],
    );
    for (const u of (await db.query("SELECT * FROM users")).rows)
      users.set(u.id, { ...u, is_admin: u.login === "admin" });
    for (const r of (
      await db.query(
        "SELECT id,name,owner,youtube,locked,private_room,code_hash,banned_words FROM rooms ORDER BY created",
      )
    ).rows) {
      rooms.set(r.id, r);
      messages.set(r.id, []);
    }
    for (const m of (await db.query("SELECT * FROM messages ORDER BY id"))
      .rows) {
      let a = messages.get(m.room_id) || [];
      a.push({
        id: +m.id,
        name: m.name,
        user_id: m.user_id,
        kind: m.kind,
        text: m.text,
        created: +m.created,
      });
      messages.set(m.room_id, a);
      state.messageId = Math.max(state.messageId, +m.id);
    }
    for (const n of (
      await db.query("SELECT * FROM notifications ORDER BY created DESC")
    ).rows) {
      let a = notifications.get(n.user_id) || [];
      a.push({ id: n.id, text: n.text, created: +n.created });
      notifications.set(n.user_id, a);
    }
    for (const f of (await db.query("SELECT * FROM friends")).rows) {
      let a = friends.get(f.user_id) || new Set();
      a.add(f.friend_id);
      friends.set(f.user_id, a);
    }
  } else {
    let a = {
      id: randomUUID(),
      name: "admin",
      login: "admin",
      city: "Mersin",
      age: 18,
      password: await hashPassword(process.env.ADMIN_PASSWORD || randomUUID()),
      coins: 1000,
      emoji: "🛡️",
      avatar: "",
      xp: 0,
      is_admin: true,
    };
    users.set(a.id, a);
  }
  await restoreSessions();
  server.listen(process.env.PORT || 3000, () =>
    console.log("TopTown Node.js ready"),
  );
}
app.disable("x-powered-by");
app.use((q, r, n) => {
  r.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self)",
  });
  n();
});
app.use(express.json({ limit: "200kb" }));
app.use(["/api/login", "/api/register"], createAuthLimiter());
app.use(express.static("public"));
app.get("/api/health", (_, r) =>
  r.json({
    ok: true,
    version: "v020",
    runtime: "node",
    rooms: rooms.size,
    persistence: !!db,
  }),
);
const services = {
  app,
  db,
  users,
  sessions,
  rooms,
  presence,
  messages,
  signals,
  notifications,
  friends,
  state,
  hash,
  key,
  fail,
  me,
  now,
  prof,
  yt,
  save,
  notice,
  people,
  inRoom,
  issueSession,
  leaveRoom,
  roomEvent,
  hashPassword,
  verifyPassword,
};
registerAuth(services);
registerRooms(services);
registerRoomFun(services);
registerPresence(services);
registerChat(services);
registerEconomy(services);
registerPlaylist(services);
registerSocial(services);
registerModeration(services);
registerAdmin(services);
registerAdminManagement(services);
registerImages(services);
app.get("/api/room/owners", (q, r) =>
  r.json({
    items: [...rooms.values()].map((x) => ({
      name: x.name,
      owner: users.get(x.owner)?.name || "Bilinmiyor",
    })),
  }),
);
registerLevels(services);
app.use("/api", (q, r) => fail(r, 404, "API yolu bulunamadı."));
app.use((e, q, r, n) => {
  console.error("API error", e);
  if (q.path?.startsWith("/api/"))
    return fail(r, 500, "Sunucu isteği işleyemedi.");
  n(e);
});
(async () => {
  if (db)
    await db.query(
      "CREATE TABLE IF NOT EXISTS room_images(room_id TEXT PRIMARY KEY,image TEXT NOT NULL,updated BIGINT NOT NULL)",
    );
  await boot();
})().catch((e) => {
  console.error("PostgreSQL başlatılamadı", e);
  process.exit(1);
});
