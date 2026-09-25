import { randomUUID } from "node:crypto";
export function register(context) {
  const { app, db, rooms, presence, hash, fail, now, notice, inRoom } = context;
  app.post("/api/report", async (q, r) => {
    let p = presence.get(q.user.id),
      reason = String(q.body?.reason || "").trim(),
      target = String(q.body?.target || "") || null;
    if (!reason) return fail(r, 400, "Rapor nedeni gerekli.");
    if (db)
      await db.query(
        "INSERT INTO reports(id,reporter,target,room_id,reason,created) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), q.user.id, target, p?.room || null, reason, now()],
      );
    r.json({ ok: true });
  });
  app.post("/api/room/moderate", async (q, r) => {
    let p = presence.get(q.user.id),
      x = rooms.get(p?.room),
      action = String(q.body?.action || ""),
      target = String(q.body?.target || "");
    if (!x || x.owner !== q.user.id)
      return fail(r, 403, "Yalnızca oda sahibi yönetebilir.");
    if (action === "lock") {
      x.locked = !x.locked;
      if (db)
        await db.query("UPDATE rooms SET locked=$1 WHERE id=$2", [
          x.locked,
          x.id,
        ]);
      return r.json({ ok: true, locked: x.locked });
    }
    if (!target || target === q.user.id || !inRoom(target, x.id))
      return fail(r, 400, "Kullanıcı odada değil.");
    if (action === "kick") presence.delete(target);
    else if (action === "mute")
      presence.get(target).muted = !presence.get(target).muted;
    else if (action === "ban") {
      presence.delete(target);
      if (db)
        await db.query(
          "INSERT INTO bans(id,room_id,user_id,by_user,reason,created) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            x.id,
            target,
            q.user.id,
            String(q.body?.reason || "Oda sahibi tarafından yasaklandı"),
            now(),
          ],
        );
    } else return fail(r, 400, "Geçersiz işlem.");
    await notice(
      target,
      x.name +
        ": " +
        (action === "mute"
          ? "susturuldun"
          : action === "kick"
            ? "odadan atıldın"
            : "yasaklandın") +
        ".",
    );
    r.json({ ok: true });
  });
  app.post("/api/room/policy", async (q, r) => {
    let p = presence.get(q.user.id),
      x = rooms.get(p?.room);
    if (!x || x.owner !== q.user.id)
      return fail(r, 403, "Yalnızca oda sahibi yönetebilir.");
    let words = String(q.body?.banned_words || "").slice(0, 1000),
      code = String(q.body?.code || "");
    x.banned_words = words;
    if (typeof q.body?.private_room === "boolean")
      x.private_room = q.body.private_room;
    if (code) {
      if (code.length < 4)
        return fail(r, 400, "Şifre en az 4 karakter olmalı.");
      x.code_hash = hash(code);
      x.private_room = true;
    }
    if (!x.private_room) x.code_hash = null;
    if (db)
      await db.query(
        "UPDATE rooms SET private_room=$1,code_hash=$2,banned_words=$3 WHERE id=$4",
        [x.private_room, x.code_hash, x.banned_words, x.id],
      );
    r.json({ ok: true });
  });
}
