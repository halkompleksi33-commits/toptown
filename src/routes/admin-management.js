export function register({
  app,
  db,
  users,
  rooms,
  presence,
  sessions,
  messages,
  signals,
  notifications,
  friends,
  fail,
  key,
  hashPassword,
}) {
  app.use("/api/admin", (req, res, next) =>
    req.user?.is_admin ? next() : fail(res, 403, "Yönetici yetkisi gerekiyor."),
  );
  async function transaction(work) {
    if (!db) return work(null);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const revoke = (id) => {
    for (const [token, record] of sessions)
      if (record.userId === id) sessions.delete(token);
    presence.delete(id);
    signals.delete(id);
    for (const [id2, list] of signals)
      signals.set(
        id2,
        list.filter((item) => item.from !== id),
      );
  };
  app.get("/api/admin/rooms", (req, res) =>
    res.json({
      rooms: [...rooms.values()].map((room) => ({
        id: room.id,
        name: room.name,
        owner: room.owner,
        ownerName: users.get(room.owner)?.name || "—",
        locked: !!room.locked,
        private_room: !!room.private_room,
        online: [...presence.values()].filter((p) => p.room === room.id).length,
      })),
    }),
  );
  app.post("/api/admin/users/:id/update", async (req, res) => {
    const user = users.get(req.params.id);
    if (!user) return fail(res, 404, "Kullanıcı bulunamadı.");
    const name = String(req.body?.name || "").trim(),
      city = String(req.body?.city || "").trim(),
      age = Number(req.body?.age),
      password = String(req.body?.password || "");
    if (
      name.length < 2 ||
      name.length > 30 ||
      city.length < 2 ||
      city.length > 50 ||
      !Number.isInteger(age) ||
      age < 18 ||
      age > 120 ||
      (password && (password.length < 4 || password.length > 128))
    )
      return fail(res, 400, "İsim, şehir, yaş veya şifre geçersiz.");
    const login = key(name);
    if (user.is_admin && login !== user.login)
      return fail(res, 400, "Yönetici kullanıcı adı değiştirilemez.");
    if (!user.is_admin && login === "admin")
      return fail(res, 400, "Bu kullanıcı adı ayrılmıştır.");
    if (
      [...users.values()].some(
        (other) => other.id !== user.id && other.login === login,
      )
    )
      return fail(res, 409, "Bu kullanıcı adı kullanılıyor.");
    const hashed = password ? await hashPassword(password) : user.password;
    try {
      await transaction(async (client) => {
        if (!client) return;
        await client.query(
          "UPDATE users SET name=$1,login=$2,city=$3,age=$4,password=$5 WHERE id=$6",
          [name, login, city, age, hashed, user.id],
        );
        if (password)
          await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [
            user.id,
          ]);
      });
    } catch (error) {
      if (error.code === "23505")
        return fail(res, 409, "Bu kullanıcı adı kullanılıyor.");
      throw error;
    }
    Object.assign(user, { name, login, city, age, password: hashed });
    if (password) revoke(user.id);
    res.json({
      ok: true,
      reauthenticate: !!password && user.id === req.user.id,
    });
  });
  app.post("/api/admin/users/:id/delete", async (req, res) => {
    const user = users.get(req.params.id);
    if (!user) return fail(res, 404, "Kullanıcı bulunamadı.");
    if (user.is_admin || user.id === req.user.id)
      return fail(res, 403, "Yönetici hesabı silinemez.");
    if (req.body?.confirm !== user.id)
      return fail(res, 400, "Silme onayı gerekli.");
    await transaction(async (client) => {
      if (!client) return;
      await client.query("UPDATE rooms SET owner=$1 WHERE owner=$2", [
        req.user.id,
        user.id,
      ]);
      await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [
        user.id,
      ]);
      await client.query(
        "DELETE FROM friends WHERE user_id=$1 OR friend_id=$1",
        [user.id],
      );
      await client.query(
        "DELETE FROM direct_messages WHERE sender=$1 OR recipient=$1",
        [user.id],
      );
      await client.query("DELETE FROM notifications WHERE user_id=$1", [
        user.id,
      ]);
      await client.query("DELETE FROM daily_rewards WHERE user_id=$1", [
        user.id,
      ]);
      await client.query(
        "DELETE FROM gift_history WHERE sender=$1 OR recipient=$1",
        [user.id],
      );
      await client.query("DELETE FROM reports WHERE reporter=$1 OR target=$1", [
        user.id,
      ]);
      await client.query("DELETE FROM bans WHERE user_id=$1 OR by_user=$1", [
        user.id,
      ]);
      await client.query("DELETE FROM room_playlist WHERE added_by=$1", [
        user.id,
      ]);
      await client.query(
        "UPDATE messages SET user_id='',name='Silinen kullanıcı' WHERE user_id=$1",
        [user.id],
      );
      await client.query("DELETE FROM users WHERE id=$1", [user.id]);
    });
    revoke(user.id);
    users.delete(user.id);
    notifications.delete(user.id);
    friends.delete(user.id);
    for (const set of friends.values()) set.delete(user.id);
    for (const room of rooms.values())
      if (room.owner === user.id) room.owner = req.user.id;
    for (const history of messages.values())
      for (const item of history)
        if (
          item.user_id === user.id ||
          (!item.user_id && item.name === user.name)
        ) {
          item.name = "Silinen kullanıcı";
          item.user_id = "";
        }
    res.json({ ok: true });
  });
  app.post("/api/admin/rooms/:id/update", async (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return fail(res, 404, "Oda bulunamadı.");
    const name = String(req.body?.name || "").trim(),
      owner = String(req.body?.owner || ""),
      locked = req.body?.locked;
    if (
      name.length < 2 ||
      name.length > 50 ||
      !users.has(owner) ||
      typeof locked !== "boolean"
    )
      return fail(res, 400, "Oda adı, sahibi veya kilit bilgisi geçersiz.");
    if (db)
      await db.query(
        "UPDATE rooms SET name=$1,owner=$2,locked=$3 WHERE id=$4",
        [name, owner, locked, room.id],
      );
    Object.assign(room, { name, owner, locked });
    res.json({ ok: true });
  });
  app.post("/api/admin/rooms/:id/delete", async (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return fail(res, 404, "Oda bulunamadı.");
    if (req.body?.confirm !== room.id)
      return fail(res, 400, "Silme onayı gerekli.");
    await transaction(async (client) => {
      if (!client) return;
      for (const table of [
        "messages",
        "room_playlist",
        "room_images",
        "room_levels",
        "bans",
        "reports",
      ])
        await client.query("DELETE FROM " + table + " WHERE room_id=$1", [
          room.id,
        ]);
      await client.query("DELETE FROM rooms WHERE id=$1", [room.id]);
    });
    for (const [id, p] of presence)
      if (p.room === room.id) {
        presence.delete(id);
        signals.delete(id);
      }
    rooms.delete(room.id);
    messages.delete(room.id);
    res.json({ ok: true });
  });
}
