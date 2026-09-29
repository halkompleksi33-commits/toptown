import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const codeTtl = 5 * 60 * 1000;
const tokenTtl = 24 * 60 * 60 * 1000;
const base64url = (value) => Buffer.from(value).toString("base64url");
const fromBase64url = (value) => Buffer.from(value, "base64url").toString("utf8");

export function register(context) {
  const { app, users, rooms, inRoom, fail, me, now } = context;
  const codes = new Map();
  const secret = () => process.env.SUD_TOKEN_SECRET || process.env.SUD_APP_SECRET || "";
  const configured = () => Boolean(process.env.SUD_APP_ID && process.env.SUD_APP_KEY && secret());
  const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");
  const issueToken = (userId) => {
    const payload = base64url(JSON.stringify({ uid: userId, exp: now() + tokenTtl, purpose: "sud" }));
    return `${payload}.${sign(payload)}`;
  };
  const readToken = (token) => {
    if (!configured() || typeof token !== "string") return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = sign(payload);
    if (signature.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try { const value = JSON.parse(fromBase64url(payload)); return value.purpose === "sud" && value.exp > now() ? value : null; } catch { return null; }
  };
  const error = (r, message, sdkErrorCode = 1005) => r.json({ ret_code: 1, ret_msg: message, sdk_error_code: sdkErrorCode, data: {} });
  const responseUser = (user) => ({
    uid: String(user.id), nick_name: String(user.name).slice(0, 60),
    avatar_url: /^https:\/\//.test(user.avatar || "") ? user.avatar : "https://toptown-production-c656.up.railway.app/toptown-logo.png",
    gender: "", is_ai: user.is_bot ? 1 : 0, ai_level: user.is_bot ? 1 : 0,
  });

  app.get("/api/sud/config", (q, r) => {
    if (!me(q)) return fail(r, 401, "Oturum sona erdi. Tekrar giriş yapın.");
    r.json({ enabled: configured(), appId: process.env.SUD_APP_ID || "", appKey: process.env.SUD_APP_KEY || "", ludoId: process.env.SUD_LUDO_ID || "1468180338417074177" });
  });
  app.post("/api/sud/code", (q, r) => {
    const user = me(q), roomId = String(q.body?.roomId || "");
    if (!user) return fail(r, 401, "Oturum sona erdi. Tekrar giriş yapın.");
    if (!configured()) return fail(r, 503, "SUD oyun ayarları henüz tamamlanmadı.");
    if (!rooms.has(roomId) || !inRoom(user.id, roomId)) return fail(r, 403, "Ludo yalnızca bulunduğun oda için açılabilir.");
    const code = randomBytes(32).toString("base64url");
    codes.set(code, { userId: user.id, expires: now() + codeTtl });
    r.json({ code, expires: now() + codeTtl });
  });
  app.post("/api/sud/get-sstoken", (q, r) => {
    const code = String(q.body?.code || ""), record = codes.get(code); codes.delete(code);
    if (!record || record.expires < now()) return error(r, "Kod geçersiz veya süresi dolmuş.");
    const user = users.get(record.userId); if (!user) return error(r, "Kullanıcı bulunamadı.");
    const ssToken = issueToken(user.id);
    r.json({ ret_code: 0, ret_msg: "", sdk_error_code: 0, data: { ss_token: ssToken, expire_date: now() + tokenTtl, expire_date_str: String(now() + tokenTtl), user_info: responseUser(user) } });
  });
  app.post("/api/sud/update-sstoken", (q, r) => {
    const record = readToken(String(q.body?.ss_token || ""));
    if (!record || !users.has(record.uid)) return error(r, "Oturum anahtarı geçersiz veya süresi dolmuş.");
    const ssToken = issueToken(record.uid);
    r.json({ ret_code: 0, ret_msg: "", sdk_error_code: 0, data: { ss_token: ssToken, expire_date: now() + tokenTtl, expire_date_str: String(now() + tokenTtl) } });
  });
  app.post("/api/sud/get-user-info", (q, r) => {
    const record = readToken(String(q.body?.ss_token || "")), user = record && users.get(record.uid);
    if (!user) return error(r, "Oturum anahtarı geçersiz veya süresi dolmuş.");
    r.json({ ret_code: 0, ret_msg: "", sdk_error_code: 0, data: responseUser(user) });
  });
}
