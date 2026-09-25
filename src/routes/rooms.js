import { randomUUID } from "node:crypto";
export function register(context) {
  const { app, db, users, rooms, messages, hash, fail, me, now, prof, people } =
    context;
  app.get("/api/me", (q, r) =>
    r.json({ user: prof(q.user), admin: !!q.user.is_admin }),
  );
  app.get("/api/rooms", async (_, r) => {
    r.set("Cache-Control", "no-store");
    const metadata = db
      ? (
          await db.query(
            "SELECT r.id,i.image,COALESCE(l.xp,0) xp FROM rooms r LEFT JOIN room_images i ON i.room_id=r.id LEFT JOIN room_levels l ON l.room_id=r.id",
          )
        ).rows
      : [...rooms.values()];
    const details = new Map(metadata.map((row) => [row.id, row]));
    r.json(
      [...rooms.values()].map((x) => ({
        id: x.id,
        name: x.name,
        owner: x.owner,
        ownerName: users.get(x.owner)?.name || "TopTown",
        image: details.get(x.id)?.image || "",
        xp: +(details.get(x.id)?.xp || 0),
        level: 1 + Math.floor((details.get(x.id)?.xp || 0) / 1000),
        locked: x.locked,
        private_room: x.private_room,
        online: people(x.id).length,
      })),
    );
  });
  app.post("/api/rooms", async (q, r) => {
    let name = String(q.body?.name || "").trim(),
      private_room = !!q.body?.private_room,
      code = String(q.body?.code || "");
    if (name.length < 2 || name.length > 50)
      return fail(r, 400, "Oda adı 2–50 karakter olmalı.");
    if (private_room && code.length < 4)
      return fail(r, 400, "Özel oda şifresi en az 4 karakter olmalı.");
    let x = {
      id: randomUUID(),
      name,
      owner: q.user.id,
      youtube: null,
      locked: false,
      private_room,
      code_hash: private_room ? hash(code) : null,
      banned_words: "",
    };
    if (db)
      await db.query(
        "INSERT INTO rooms(id,name,owner,youtube,locked,created,private_room,code_hash,banned_words) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          x.id,
          x.name,
          x.owner,
          null,
          false,
          now(),
          x.private_room,
          x.code_hash,
          "",
        ],
      );
    rooms.set(x.id, x);
    messages.set(x.id, []);
    r.json({ id: x.id });
  });
}
