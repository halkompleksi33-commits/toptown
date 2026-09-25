import { roomFun } from "./room-fun.js";
export function register(context) {
  const {
    app,
    db,
    rooms,
    presence,
    messages,
    state,
    hash,
    fail,
    now,
    notice,
    people,
    leaveRoom,
    roomEvent,
  } = context;
  app.post("/api/join", async (q, r) => {
    let x = rooms.get(q.body?.room);
    if (!x) return fail(r, 404, "Oda bulunamadı.");
    if (
      db &&
      (
        await db.query(
          "SELECT 1 FROM bans WHERE room_id=$1 AND user_id=$2 LIMIT 1",
          [x.id, q.user.id],
        )
      ).rowCount
    )
      return fail(r, 403, "Bu odadan yasaklandınız.");
    if (
      x.private_room &&
      x.owner !== q.user.id &&
      x.code_hash !== hash(q.body?.code || "")
    )
      return fail(r, 403, "Bu özel oda için şifre gerekli.");
    await leaveRoom(q.user.id);
    presence.set(q.user.id, {
      room: x.id,
      seat: null,
      muted: false,
      seen: now(),
    });
    await roomEvent(x.id, q.user, "join", "odaya katıldı.");
    await notice(q.user.id, "“" + x.name + "” odasına giriş yaptın.");
    r.json({ ok: true });
  });
  app.post("/api/leave", async (q, r) => {
    await leaveRoom(q.user.id);
    r.json({ ok: true });
  });
  app.get("/api/state", (q, r) => {
    let p = presence.get(q.user.id),
      x = rooms.get(p?.room);
    if (!x) return fail(r, 409, "Önce bir odaya katılın.");
    p.seen = now();
    let after = +q.query.after || 0;
    r.json({
      room: { ...x, code_hash: undefined, banned_words: undefined },
      people: people(x.id),
      messages: (messages.get(x.id) || []).filter((m) => m.id > after),
      coins: q.user.coins,
      fun: roomFun(x, q.user.id),
      canManageActivities: x.owner === q.user.id || !!q.user.is_admin,
    });
  });
}
