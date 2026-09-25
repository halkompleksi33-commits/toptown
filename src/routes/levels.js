export function register(context) {
  const { app, db, rooms, presence, fail } = context;
  app.get("/api/room/levels", async (q, r) => {
    if (!db)
      return r.json({
        items: [...rooms.values()].map((x) => ({
          id: x.id,
          name: x.name,
          xp: x.xp || 0,
          level: 1 + Math.floor((x.xp || 0) / 1000),
        })),
      });
    await db.query(
      "CREATE TABLE IF NOT EXISTS room_levels(room_id TEXT PRIMARY KEY,xp INTEGER NOT NULL DEFAULT 0)",
    );
    let items = (
      await db.query(
        "SELECT r.id,r.name,COALESCE(l.xp,0) xp FROM rooms r LEFT JOIN room_levels l ON l.room_id=r.id ORDER BY r.created",
      )
    ).rows.map((x) => ({
      ...x,
      xp: +x.xp,
      level: 1 + Math.floor(+x.xp / 1000),
    }));
    r.json({ items });
  });
  // Compatibility endpoint: XP is now awarded atomically by /api/gift.
  app.post("/api/room/xp", (req, res) => {
    const room = rooms.get(presence.get(req.user.id)?.room);
    if (!room) return fail(res, 409, "Önce odaya katılın.");
    res.json({
      ok: true,
      gain: 0,
      xp: room.xp || 0,
      level: 1 + Math.floor((room.xp || 0) / 1000),
    });
  });
}
