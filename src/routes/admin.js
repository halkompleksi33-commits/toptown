export function register(context) {
  const {
    app,
    db,
    users,
    sessions,
    rooms,
    presence,
    signals,
    fail,
    prof,
    leaveRoom,
  } = context;
  app.post("/api/logout", async (q, r) => {
    await leaveRoom(q.user.id);
    const token = (q.get("authorization") || "").replace(/^Bearer /, "");
    sessions.delete(token);
    if (db) await db.query("DELETE FROM auth_sessions WHERE token=$1", [token]);
    r.json({ ok: true });
  });
  app.get("/api/signal", (q, r) => {
    let a = signals.get(q.user.id) || [];
    signals.set(q.user.id, []);
    r.json(a);
  });
  app.post("/api/signal", (q, r) => {
    let to = String(q.body?.to || ""),
      payload = q.body?.payload,
      a = presence.get(q.user.id),
      b = presence.get(to);
    if (!payload || !to || !a || a.room !== b?.room)
      return fail(r, 400, "Sinyal alıcısı odada değil.");
    let x = signals.get(to) || [];
    x.push({ from: q.user.id, payload });
    signals.set(to, x);
    r.json({ ok: true });
  });
  app.get("/api/admin", (q, r) =>
    q.user.is_admin
      ? r.json({
          summary: {
            users: users.size,
            rooms: rooms.size,
            online: presence.size,
          },
          users: [...users.values()].map((u) => ({
            ...prof(u),
            is_admin: u.is_admin,
          })),
        })
      : fail(r, 403, "Yönetici yetkisi gerekiyor."),
  );
  app.get("/api/admin/reports", async (q, r) => {
    if (!q.user.is_admin) return fail(r, 403, "Yönetici yetkisi gerekiyor.");
    r.json({
      reports: db
        ? (
            await db.query(
              "SELECT * FROM reports ORDER BY created DESC LIMIT 100",
            )
          ).rows
        : [],
    });
  });
  app.get("/api/admin/bans", async (q, r) => {
    if (!q.user.is_admin) return fail(r, 403, "Yönetici yetkisi gerekiyor.");
    r.json({
      bans: db
        ? (await db.query("SELECT * FROM bans ORDER BY created DESC LIMIT 100"))
            .rows
        : [],
    });
  });
}
