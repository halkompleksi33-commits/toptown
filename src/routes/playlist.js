import { randomUUID } from "node:crypto";
export function register(context) {
  const { app, db, rooms, presence, fail, now, yt } = context;
  app.post("/api/youtube", async (q, r) => {
    let p = presence.get(q.user.id),
      url = String(q.body?.url || "").trim(),
      x = rooms.get(p?.room),
      id = yt(url);
    if (!p) return fail(r, 409, "Önce odaya katılın.");
    if (url && !id)
      return fail(r, 400, "Geçerli bir YouTube bağlantısı girin.");
    x.youtube = id || null;
    if (db)
      await db.query("UPDATE rooms SET youtube=$1 WHERE id=$2", [
        x.youtube,
        x.id,
      ]);
    r.json({ ok: true });
  });
  app.get("/api/playlist", async (q, r) => {
    let p = presence.get(q.user.id);
    if (!p) return fail(r, 409, "Önce bir odaya katılın.");
    r.json({
      items: db
        ? (
            await db.query(
              "SELECT * FROM room_playlist WHERE room_id=$1 ORDER BY position,created",
              [p.room],
            )
          ).rows
        : [],
    });
  });
  app.post("/api/playlist", async (q, r) => {
    let p = presence.get(q.user.id),
      id = yt(q.body?.url);
    if (!p || !id) return fail(r, 400, "Geçerli bir YouTube bağlantısı girin.");
    let pos = db
        ? +(
            await db.query(
              "SELECT COALESCE(MAX(position),0)+1 next FROM room_playlist WHERE room_id=$1",
              [p.room],
            )
          ).rows[0].next
        : 1,
      item = {
        id: randomUUID(),
        room: p.room,
        video: id,
        owner: q.user.id,
        position: pos,
        created: now(),
      };
    if (db)
      await db.query(
        "INSERT INTO room_playlist(id,room_id,video_id,added_by,position,created) VALUES($1,$2,$3,$4,$5,$6)",
        [
          item.id,
          item.room,
          item.video,
          item.owner,
          item.position,
          item.created,
        ],
      );
    r.json({ ok: true, item });
  });
  app.post("/api/playlist/next", async (q, r) => {
    let p = presence.get(q.user.id),
      x = rooms.get(p?.room);
    if (!p) return fail(r, 409, "Önce bir odaya katılın.");
    let i = db
      ? (
          await db.query(
            "SELECT * FROM room_playlist WHERE room_id=$1 ORDER BY position,created LIMIT 1",
            [p.room],
          )
        ).rows[0]
      : null;
    if (!i) return fail(r, 404, "Oynatma listesi boş.");
    x.youtube = i.video_id;
    if (db) {
      await db.query("UPDATE rooms SET youtube=$1 WHERE id=$2", [
        x.youtube,
        x.id,
      ]);
      await db.query("DELETE FROM room_playlist WHERE id=$1", [i.id]);
    }
    r.json({ ok: true, video: x.youtube });
  });
}
