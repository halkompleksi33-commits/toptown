import { randomUUID } from "node:crypto";
export function register(context) {
  const {
    app,
    db,
    users,
    key,
    fail,
    me,
    prof,
    save,
    issueSession,
    hashPassword,
    verifyPassword,
  } = context;
  app.post("/api/register", async (q, r) => {
    let b = q.body || {},
      login = key(b.name);
    if (
      login === "admin" ||
      login.length < 2 ||
      login.length > 30 ||
      !Number.isInteger(+b.age) ||
      !String(b.city || "").trim() ||
      +b.age < 18 ||
      +b.age > 120 ||
      String(b.password || "").length < 4 ||
      String(b.password || "").length > 128 ||
      String(b.city || "").length > 50
    )
      return fail(r, 400, "Alanları kontrol edin.");
    if ([...users.values()].some((u) => u.login === login))
      return fail(r, 409, "Bu isim kullanılıyor.");
    let u = {
      id: randomUUID(),
      name: String(b.name).trim(),
      login,
      city: String(b.city).trim(),
      age: +b.age,
      password: await hashPassword(String(b.password)),
      coins: 1000,
      emoji: "🙂",
      avatar: "",
      xp: 0,
    };
    try {
      await save(u);
    } catch {
      return fail(r, 409, "Bu isim kullanılıyor.");
    }
    users.set(u.id, u);
    let t = await issueSession(u);
    r.json({ token: t, user: prof(u) });
  });
  app.post("/api/login", async (q, r) => {
    let u = [...users.values()].find((x) => x.login === key(q.body?.name));
    if (
      !u ||
      !(await verifyPassword(String(q.body?.password || ""), u.password))
    )
      return fail(r, 401, "İsim veya şifre hatalı.");
    if (!u.password.startsWith("scrypt:")) {
      u.password = await hashPassword(String(q.body.password));
      if (db)
        await db.query("UPDATE users SET password=$1 WHERE id=$2", [
          u.password,
          u.id,
        ]);
    }
    let t = await issueSession(u);
    r.json({ token: t, user: prof(u) });
  });
  app.use("/api", (q, r, n) => {
    if (["/health", "/login", "/register"].includes(q.path)) return n();
    q.user = me(q);
    if (!q.user) return fail(r, 401, "Oturum sona erdi. Tekrar giriş yapın.");
    n();
  });
}
