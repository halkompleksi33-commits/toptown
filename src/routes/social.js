import { randomUUID } from "node:crypto";
export function register(context) {
  const {
    app,
    db,
    users,
    messages,
    notifications,
    friends,
    fail,
    now,
    prof,
    notice,
  } = context;
  app.get("/api/notifications", (q, r) =>
    r.json({ items: notifications.get(q.user.id) || [] }),
  );
  app.get("/api/friends", (q, r) =>
    r.json(
      [...(friends.get(q.user.id) || [])]
        .map((id) => users.get(id))
        .filter(Boolean)
        .map(prof),
    ),
  );
  app.post("/api/friends", async (q, r) => {
    let id = String(q.body?.user || "");
    if (!users.has(id) || id === q.user.id)
      return fail(r, 400, "Geçersiz kullanıcı.");
    let a = friends.get(q.user.id) || new Set();
    a.add(id);
    friends.set(q.user.id, a);
    const reciprocal = friends.get(id) || new Set();
    reciprocal.add(q.user.id);
    friends.set(id, reciprocal);
    if (db) {
      await db.query(
        "INSERT INTO friends(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [q.user.id, id],
      );
      await db.query(
        "INSERT INTO friends(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, q.user.id],
      );
    }
    await notice(id, q.user.name + " seni arkadaş olarak ekledi.");
    r.json({ ok: true });
  });
  app.post("/api/messages/private", async (q, r) => {
    let recipient = String(q.body?.recipient || ""),
      text = String(q.body?.text || "").trim();
    if (!users.has(recipient) || !text)
      return fail(r, 400, "Alıcı ve mesaj gerekli.");
    if (db)
      await db.query(
        "INSERT INTO direct_messages(id,sender,recipient,text,created) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), q.user.id, recipient, text, now()],
      );
    await notice(recipient, "Özel mesaj · " + q.user.name + ": " + text);
    r.json({ ok: true });
  });
  app.get("/api/messages/private", async (q, r) => {
    let id = String(q.query.with || "");
    if (!id) return fail(r, 400, "Kullanıcı gerekli.");
    let items = db
      ? (
          await db.query(
            "SELECT * FROM direct_messages WHERE (sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1) ORDER BY created DESC LIMIT 100",
            [q.user.id, id],
          )
        ).rows
      : [];
    r.json({ items: items.reverse() });
  });
}
