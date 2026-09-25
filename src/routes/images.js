export function register(context) {
  const { app, db, rooms, fail, now } = context;
  app.post("/api/room/image", async (q, r) => {
    let room = rooms.get(String(q.body?.room || "")),
      image = String(q.body?.image || "");
    if (!room || room.owner !== q.user.id)
      return fail(r, 403, "Yalnızca oda sahibi görsel ekleyebilir.");
    if (
      !/^data:image\/(png|jpeg|webp);base64,/.test(image) ||
      image.length > 200000
    )
      return fail(
        r,
        400,
        "PNG, JPEG veya WebP görseli en fazla 150 KB olmalı.",
      );
    if (db) {
      await db.query(
        "CREATE TABLE IF NOT EXISTS room_images(room_id TEXT PRIMARY KEY,image TEXT NOT NULL,updated BIGINT NOT NULL)",
      );
      await db.query(
        "INSERT INTO room_images(room_id,image,updated) VALUES($1,$2,$3) ON CONFLICT(room_id) DO UPDATE SET image=EXCLUDED.image,updated=EXCLUDED.updated",
        [room.id, image, now()],
      );
    }
    room.image = image;
    r.json({ ok: true });
  });
  app.get("/api/room/images", async (q, r) => {
    let items = db
      ? (
          await db.query(
            "SELECT r.name,i.image FROM room_images i JOIN rooms r ON r.id=i.room_id ORDER BY i.updated DESC",
          )
        ).rows
      : [...rooms.values()]
          .filter((x) => x.image)
          .map((x) => ({ name: x.name, image: x.image }));
    r.json({ items });
  });
}
