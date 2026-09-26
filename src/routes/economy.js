import { randomUUID } from "node:crypto";
import { giftEvent } from "./room-fun.js";
import { botRoster } from "../bot-presence.js";

export function register({
  app,
  db,
  users,
  rooms,
  presence,
  fail,
  now,
  notice,
}) {
  const history = [],
    rewards = new Map();
  let queue = Promise.resolve();
  // Serialise economy operations on the supported single-instance deployment.
  const exclusive = (fn) => {
    const operation = queue.then(fn);
    queue = operation.catch(() => {});
    return operation;
  };
  async function transaction(fn) {
    const client = db ? await db.connect() : null;
    try {
      if (client) await client.query("BEGIN");
      const result = await fn(client);
      if (client) await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      throw error;
    } finally {
      client?.release();
    }
  }
  const reject = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const handler = (fn) => async (req, res, next) => {
    try {
      res.json(await exclusive(() => fn(req)));
    } catch (error) {
      if (error.status) fail(res, error.status, error.message);
      else next(error);
    }
  };
  app.post(
    ["/api/gift", "/api/admin/bot/gift"],
    handler(async (req) => {
      const gift = String(req.body?.gift || ""),
        cost = { rose: 30, cake: 120, rocket: 300, crown: 800 }[gift];
      const sender = req.user,
        recipient = users.get(String(req.body?.recipient || ""));
      const asBot = req.path === "/api/admin/bot/gift";
      if (asBot && !sender.is_admin) reject(403, "Yönetici yetkisi gerekiyor.");
      const room = rooms.get(
        asBot ? req.body?.room_id : presence.get(sender.id)?.room,
      );
      const bot = asBot ? botRoster.get(room?.id) : null;
      if (asBot && !bot) reject(409, "Bot önce odaya katılmalı.");
      if (
        !cost ||
        !room ||
        !recipient ||
        recipient.id === sender.id ||
        presence.get(recipient.id)?.room !== room.id
      )
        reject(400, "Hediye alıcısını odadan seçin.");
      const created = now(),
        id = randomUUID();
      const result = await transaction(async (client) => {
        let from = sender,
          to = recipient;
        if (client) {
          const rows = (
            await client.query(
              "SELECT id,coins,xp FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
              [[sender.id, recipient.id]],
            )
          ).rows;
          from = rows.find((row) => row.id === sender.id);
          to = rows.find((row) => row.id === recipient.id);
        }
        if (!from || !to || from.coins < cost)
          reject(400, "Yeterli jeton yok.");
        const a = {
          coins: +from.coins - cost,
          xp: +from.xp + Math.ceil(cost / 2),
        };
        const b = { coins: +to.coins + cost, xp: +to.xp + cost };
        let roomXp = (room.xp || 0) + cost;
        if (client) {
          await client.query("UPDATE users SET coins=$1,xp=$2 WHERE id=$3", [
            a.coins,
            a.xp,
            sender.id,
          ]);
          await client.query("UPDATE users SET coins=$1,xp=$2 WHERE id=$3", [
            b.coins,
            b.xp,
            recipient.id,
          ]);
          await client.query(
            "INSERT INTO gift_history(id,sender,recipient,gift,cost,created,room_xp_applied) VALUES($1,$2,$3,$4,$5,$6,true)",
            [id, sender.id, recipient.id, gift, cost, created],
          );
          roomXp = +(
            await client.query(
              "INSERT INTO room_levels(room_id,xp) VALUES($1,$2) ON CONFLICT(room_id) DO UPDATE SET xp=room_levels.xp+EXCLUDED.xp RETURNING xp",
              [room.id, cost],
            )
          ).rows[0].xp;
        }
        return { a, b, roomXp };
      });
      Object.assign(sender, result.a);
      Object.assign(recipient, result.b);
      room.xp = result.roomXp;
      const displaySender = bot ? { name: bot.name + " [BOT]" } : sender;
      giftEvent(room, displaySender, recipient, gift);
      history.unshift({
        id,
        sender: sender.id,
        recipient: recipient.id,
        gift,
        cost,
        created,
      });
      if (history.length > 500) history.length = 500;
      await notice(
        recipient.id,
        displaySender.name +
          " sana " +
          gift +
          " hediyesi gönderdi." +
          (bot ? " Yönetici sponsorluğunda." : ""),
      ).catch(console.error);
      return {
        ok: true,
        coins: sender.coins,
        gain: cost,
        xp: room.xp,
        level: 1 + Math.floor(room.xp / 1000),
      };
    }),
  );
  app.get("/api/gifts/history", async (req, res) =>
    res.json({
      items: db
        ? (
            await db.query(
              "SELECT * FROM gift_history WHERE sender=$1 OR recipient=$1 ORDER BY created DESC LIMIT 100",
              [req.user.id],
            )
          ).rows
        : history
            .filter(
              (row) =>
                row.sender === req.user.id || row.recipient === req.user.id,
            )
            .slice(0, 100),
    }),
  );
  app.post(
    "/api/reward",
    handler(async (req) => {
      const day = Math.floor(now() / 86400000),
        user = req.user;
      const result = await transaction(async (client) => {
        let balance = user,
          old = rewards.get(user.id);
        if (client) {
          balance = (
            await client.query(
              "SELECT coins,xp FROM users WHERE id=$1 FOR UPDATE",
              [user.id],
            )
          ).rows[0];
          old = (
            await client.query("SELECT * FROM daily_rewards WHERE user_id=$1", [
              user.id,
            ])
          ).rows[0];
        }
        if (old && Math.floor(+old.last_claim / 86400000) === day)
          reject(409, "Günlük ödül zaten alındı.");
        const streak =
          old && Math.floor(+old.last_claim / 86400000) === day - 1
            ? +old.streak + 1
            : 1;
        const reward = 100 + Math.min(streak, 7) * 10,
          coins = +balance.coins + reward,
          xp = +balance.xp + 25,
          claimed = now();
        if (client) {
          await client.query("UPDATE users SET coins=$1,xp=$2 WHERE id=$3", [
            coins,
            xp,
            user.id,
          ]);
          await client.query(
            "INSERT INTO daily_rewards(user_id,last_claim,streak) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET last_claim=EXCLUDED.last_claim,streak=EXCLUDED.streak",
            [user.id, claimed, streak],
          );
        }
        return { coins, xp, reward, streak, claimed };
      });
      Object.assign(user, { coins: result.coins, xp: result.xp });
      rewards.set(user.id, {
        last_claim: result.claimed,
        streak: result.streak,
      });
      return { ok: true, ...result };
    }),
  );
}
