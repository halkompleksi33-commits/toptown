export function register(context) {
  const {
    app,
    db,
    rooms,
    presence,
    messages,
    state,
    fail,
    now,
    prof,
    save,
    people,
  } = context;
  app.post("/api/message", async (q, r) => {
    let p = presence.get(q.user.id),
      text = String(q.body?.text || "").trim(),
      x = rooms.get(p?.room);
    if (!p || !text || text.length > 1000)
      return fail(r, 400, "Önce odaya katılıp mesaj yazın.");
    if (p.muted) return fail(r, 403, "Oda sahibi seni susturdu.");
    let words = String(x?.banned_words || "")
      .split(",")
      .map((y) => y.trim().toLocaleLowerCase("tr-TR"))
      .filter(Boolean);
    if (words.some((w) => text.toLocaleLowerCase("tr-TR").includes(w)))
      return fail(r, 400, "Mesaj küfür filtresine takıldı.");
    let m = {
        id: ++state.messageId,
        name: q.user.name,
        user_id: q.user.id,
        kind: "chat",
        text,
        created: now(),
      },
      a = messages.get(p.room) || [];
    a.push(m);
    messages.set(p.room, a);
    if (db)
      await db.query(
        "INSERT INTO messages(id,room_id,user_id,name,kind,text,created) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [m.id, p.room, q.user.id, m.name, m.kind, m.text, m.created],
      );
    r.json({ ok: true });
  });
  app.post("/api/seat", (q, r) => {
    let p = presence.get(q.user.id),
      seat = q.body?.seat;
    if (!p) return fail(r, 409, "Önce odaya katılın.");
    if (
      seat !== null &&
      rooms.get(p.room)?.locked &&
      rooms.get(p.room)?.owner !== q.user.id
    )
      return fail(r, 403, "Koltuklar kilitli.");
    if (p.muted && seat !== null)
      return fail(r, 403, "Susturulduğun için koltuğa oturamazsın.");
    if (seat !== null && (!Number.isInteger(seat) || seat < 0 || seat > 8))
      return fail(r, 400, "Geçersiz koltuk.");
    if (seat !== null && people(p.room).some((x) => x.seat === seat))
      return fail(r, 409, "Koltuk dolu.");
    p.seat = seat;
    r.json({ ok: true });
  });
  app.post("/api/profile", async (q, r) => {
    const emoji = String(q.body?.emoji || "🙂").slice(0, 8);
    let avatar = q.user.avatar || "";
    if (q.body?.avatar !== undefined) {
      if (
        typeof q.body.avatar !== "string" ||
        q.body.avatar.length > 200000 ||
        (q.body.avatar !== "" &&
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
            q.body.avatar,
          ))
      ) {
        return fail(r, 400, "Geçerli bir PNG, JPEG veya WebP görseli seçin.");
      }
      avatar = q.body.avatar;
    }
    if (db)
      await db.query("UPDATE users SET emoji=$1,avatar=$2 WHERE id=$3", [
        emoji,
        avatar,
        q.user.id,
      ]);
    Object.assign(q.user, { emoji, avatar });
    r.json({ user: prof(q.user) });
  });
}
