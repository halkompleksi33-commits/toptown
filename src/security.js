import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof encoded !== "string" || typeof password !== "string") return false;
  if (!encoded.startsWith("scrypt:")) {
    const legacy = createHash("sha256").update(password).digest("hex");
    return (
      /^[a-f0-9]{64}$/.test(encoded) &&
      timingSafeEqual(Buffer.from(legacy), Buffer.from(encoded))
    );
  }
  const [, salt, key] = encoded.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(key))
    return false;
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}

export function createAuthLimiter({ limit = 15, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    for (const [key, value] of buckets)
      if (value.reset <= Date.now()) buckets.delete(key);
  }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.set("Retry-After", String(Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({
        error: "Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.",
      });
    }
    next();
  };
}
