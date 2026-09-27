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
    rewards = new Map(),
    purchases = new Map(),
    taskClaims = new Set();
  const store = [
    { id: "rose-badge", icon: "🌹", name: "Gül Rozeti", price: 250 },
    { id: "rocket-badge", icon: "🚀", name: "Roket Rozeti", price: 600 },
    { id: "crown-badge", icon: "👑", name: "Taç Rozeti", price: 1200 },
  ];
  const dayKey = () => new Date(now()).toISOString().slice(0, 10);
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
  async function overviewFor(user) {
      const today = dayKey();
      let sent = 0, received = 0, messagesToday = 0, owned = [];
      if (db) {
        const midnight = new Date(today + "T00:00:00.000Z").getTime();
        const [gifts, chats, inventory] = await Promise.all([
          db.query("SELECT COALESCE(SUM(CASE WHEN sender=$1 THEN 1 ELSE 0 END),0) sent,COALESCE(SUM(CASE WHEN recipient=$1 THEN 1 ELSE 0 END),0) received FROM gift_history WHERE (sender=$1 OR recipient=$1) AND created >= $2", [user.id, midnight]),
          db.query("SELECT count(*) count FROM messages WHERE user_id=$1 AND kind='chat' AND created >= $2", [user.id, midnight]),
          db.query("SELECT item FROM economy_purchases WHERE user_id=$1", [user.id]),
        ]);
        sent = +gifts.rows[0].sent; received = +gifts.rows[0].received;
        messagesToday = +chats.rows[0].count; owned = inventory.rows.map((x) => x.item);
      } else {
        owned = [...(purchases.get(user.id) || new Set())];
        messagesToday = [...(history || [])].filter((x) => x.sender === user.id && x.created >= Date.now()-86400000).length;
      }
      const tasks = [
        { id: "hello", title: "Sohbete katıl", progress: messagesToday > 0 ? 1 : 0, target: 1, reward: 25 },
        { id: "chat3", title: "3 mesaj gönder", progress: Math.min(messagesToday,3), target: 3, reward: 50 },
        { id: "gift", title: "Bir hediye gönder", progress: Math.min(sent,1), target: 1, reward: 75 },
      ];
      let claimed = [];
      if (db) claimed = (await db.query("SELECT task FROM economy_task_claims WHERE user_id=$1 AND day=$2", [user.id,today])).rows.map((x)=>x.task);
      else claimed = tasks.filter((t)=>taskClaims.has([user.id,t.id,today].join(":"))).map((t)=>t.id);
      return { coins:user.coins, xp:user.xp || 0, level:1+Math.floor((user.xp||0)/1000), store:store.map((item)=>({...item,owned:owned.includes(item.id)})), tasks:tasks.map((t)=>({...t,claimed:claimed.includes(t.id)})), collection:{ sent, received, owned } };
  }
  app.get("/api/economy", async (req, res, next) => {
    try { res.json(await overviewFor(req.user)); } catch (error) { next(error); }
  });
  app.post("/api/economy/buy", handler(async (req) => {
    const item = store.find((x) => x.id === req.body?.item), user = req.user;
    if (!item) reject(400, "Mağaza ürünü bulunamadı.");
    const result = await transaction(async (client) => {
      let balance = user.coins, exists = purchases.get(user.id)?.has(item.id);
      if (client) {
        balance = +(await client.query("SELECT coins FROM users WHERE id=$1 FOR UPDATE",[user.id])).rows[0].coins;
        exists = (await client.query("SELECT 1 FROM economy_purchases WHERE user_id=$1 AND item=$2",[user.id,item.id])).rowCount > 0;
      }
      if (exists) reject(409,"Bu rozet zaten koleksiyonunda.");
      if (balance < item.price) reject(400,"Yeterli jeton yok.");
      if (client) { await client.query("UPDATE users SET coins=coins-$1 WHERE id=$2",[item.price,user.id]); await client.query("INSERT INTO economy_purchases(user_id,item,created) VALUES($1,$2,$3)",[user.id,item.id,now()]); }
      return balance-item.price;
    });
    user.coins = result; let items=purchases.get(user.id)||new Set(); items.add(item.id); purchases.set(user.id,items);
    return { ok:true, coins:result, item:item.id };
  }));
  app.post("/api/economy/task", handler(async (req) => {
    const task = String(req.body?.task||""), today=dayKey(), user=req.user;
    const overview = await overviewFor(user);
    const chosen=overview?.tasks?.find((x)=>x.id===task);
    if (!chosen || chosen.progress<chosen.target) reject(400,"Görev henüz tamamlanmadı.");
    const key=[user.id,task,today].join(":");
    const result=await transaction(async(client)=>{
      let claimed=taskClaims.has(key);
      if(client) claimed=(await client.query("SELECT 1 FROM economy_task_claims WHERE user_id=$1 AND task=$2 AND day=$3",[user.id,task,today])).rowCount>0;
      if(claimed) reject(409,"Bu görev ödülü zaten alındı.");
      if(client){await client.query("UPDATE users SET coins=coins+$1,xp=xp+$2 WHERE id=$3",[chosen.reward,chosen.reward,user.id]);await client.query("INSERT INTO economy_task_claims(user_id,task,day,created) VALUES($1,$2,$3,$4)",[user.id,task,today,now()]);}
      return {coins:+user.coins+chosen.reward,xp:+user.xp+chosen.reward};
    });
    taskClaims.add(key); Object.assign(user,result); return {ok:true,...result,reward:chosen.reward};
  }));
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
