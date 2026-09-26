import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { register } from "../src/routes/ai-bot.js";
import { botRoster, botSeats } from "../src/bot-presence.js";
import { register as registerChat } from "../src/routes/chat.js";
import { register as registerEconomy } from "../src/routes/economy.js";

test("bot seats reject unauthorized, occupied and locked seats; departure releases seat", async (t) => {
  botRoster.clear();
  botSeats.clear();
  const { request, context } = await fixture(t);
  await request(
    "admin/ai",
    { room_id: "room", name: "Bot", enabled: true, joined: true },
    "admin",
  );
  assert.equal(
    (await request("admin/bot/seat", { room_id: "room", seat: 0 })).status,
    403,
  );
  context.presence.get("member").seat = 0;
  assert.equal(
    (await request("admin/bot/seat", { room_id: "room", seat: 0 }, "admin"))
      .status,
    409,
  );
  assert.equal(
    (await request("admin/bot/seat", { room_id: "room", seat: 1 }, "admin"))
      .status,
    200,
  );
  assert.equal((await request("seat", { seat: 1 })).status, 409);
  context.rooms.get("room").locked = true;
  assert.equal(
    (await request("admin/bot/seat", { room_id: "room", seat: 2 }, "admin"))
      .status,
    403,
  );
  await request(
    "admin/ai",
    { room_id: "room", name: "Bot", enabled: false },
    "admin",
  );
  assert.equal(botSeats.has("room"), false);
});

test("bot gifts spend sponsor coins, credit recipient and reject unauthorized or unfunded gifts", async (t) => {
  const app = express();
  app.use(express.json());
  const users = new Map([
    ["admin", { id: "admin", name: "Admin", is_admin: true, coins: 30, xp: 0 }],
    ["member", { id: "member", name: "Member", coins: 100, xp: 0 }],
  ]);
  app.use((q, r, next) => {
    q.user = users.get(q.headers["x-user"] || "admin");
    next();
  });
  const rooms = new Map([["gift-room", { id: "gift-room" }]]),
    presence = new Map([["member", { room: "gift-room" }]]);
  botRoster.set("gift-room", { name: "GiftBot" });
  registerEconomy({
    app,
    users,
    rooms,
    presence,
    fail: (r, s, error) => r.status(s).json({ error }),
    now: Date.now,
    notice: async () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    botRoster.delete("gift-room");
  });
  const send = (user = "admin") =>
    fetch(`http://127.0.0.1:${server.address().port}/api/admin/bot/gift`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": user },
      body: JSON.stringify({
        room_id: "gift-room",
        recipient: "member",
        gift: "rose",
      }),
    });
  assert.equal((await send("member")).status, 403);
  assert.equal((await send()).status, 200);
  assert.equal(users.get("admin").coins, 0);
  assert.equal(users.get("member").coins, 130);
  assert.equal((await send()).status, 400);
  assert.equal(users.get("member").coins, 130);
});

test("bot joins, starts conversation with cooldown, stays quiet in empty room and leaves", async (t) => {
  botRoster.clear();
  const { request, context, controller } = await fixture(t);
  const body = {
    room_id: "room",
    name: "Sohbetçi",
    enabled: true,
    joined: true,
    automatic: true,
  };
  assert.equal((await request("admin/ai", body, "admin")).status, 200);
  assert.equal(botRoster.get("room").name, "Sohbetçi");
  assert.equal(context.messages.get("room")[0].kind, "join");
  const original = Date.now,
    base = original();
  try {
    Date.now = () => base + 16000;
    await controller.tick();
    assert.equal(context.messages.get("room").at(-1).kind, "chat");
    const count = context.messages.get("room").length;
    await controller.tick();
    assert.equal(context.messages.get("room").length, count);
    context.presence.clear();
    Date.now = () => base + 400000;
    await controller.tick();
    assert.equal(context.messages.get("room").length, count);
  } finally {
    Date.now = original;
  }
  await request("admin/ai", { ...body, joined: false }, "admin");
  assert.equal(botRoster.has("room"), false);
  assert.equal(context.messages.get("room").at(-1).kind, "leave");
});

async function fixture(t, options = {}) {
  const app = express();
  app.use(express.json());
  app.use((q, r, next) => {
    q.user = {
      id: q.headers["x-user"] || "member",
      is_admin: q.headers["x-user"] === "admin",
    };
    next();
  });
  const context = {
    app,
    rooms: new Map([["room", { id: "room" }]]),
    presence: new Map([["member", { room: "room" }]]),
    messages: new Map(),
    state: { messageId: 0 },
    fail: (r, status, error) => r.status(status).json({ error }),
  };
  const controller = register(context, {
    apiKey: "test-only-key",
    scheduler: false,
    ...options,
  });
  registerChat({
    ...context,
    people: (id) => [...context.presence.values()].filter((p) => p.room === id),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const request = (path, body, user = "member") =>
    fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "x-user": user },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { context, request, controller };
}
test("AI bot requires admin configuration and explicit consent; only prompt leaves server", async (t) => {
  let calls = 0;
  const { request, context } = await fixture(t, {
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      assert.equal(body.input, "Merhaba");
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 250);
      assert.equal(Object.hasOwn(body, "previous_response_id"), false);
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              content: [
                { type: "output_text", text: "Merhaba, ben bir botum!" },
              ],
            },
          ],
        }),
      };
    },
  });
  const config = { room_id: "room", name: "Asistan", enabled: true };
  assert.equal((await request("admin/ai", config)).status, 403);
  assert.equal((await request("admin/ai", config, "admin")).status, 200);
  assert.equal((await request("bot/ask", { text: "Merhaba" })).status, 400);
  assert.equal(calls, 0);
  assert.equal(
    (await request("bot/ask", { text: "Merhaba", consent: true })).status,
    200,
  );
  assert.equal(context.messages.get("room")[0].name, "Asistan [BOT]");
  assert.equal(
    (await request("bot/ask", { text: "Merhaba", consent: true })).status,
    429,
  );
  assert.equal(calls, 1);
});
test("AI bot errors are sanitized and missing key fails closed", async (t) => {
  const { request } = await fixture(t, { apiKey: "" });
  assert.equal(
    (
      await request(
        "admin/ai",
        { room_id: "room", name: "Bot", enabled: true },
        "admin",
      )
    ).status,
    503,
  );
  const second = await fixture(t, {
    fetcher: async () => {
      throw Error("secret-provider-payload");
    },
  });
  await second.request(
    "admin/ai",
    { room_id: "room", name: "Bot", enabled: true },
    "admin",
  );
  const reply = await second.request("bot/ask", {
    text: "Merhaba",
    consent: true,
  });
  assert.equal(reply.status, 502);
  assert.equal((await reply.text()).includes("secret-provider"), false);
});
test("disabling bot while response is in flight prevents room publication", async (t) => {
  let started, finish;
  const ready = new Promise((resolve) => (started = resolve));
  const waiting = new Promise((resolve) => (finish = resolve));
  const { request, context } = await fixture(t, {
    fetcher: async () => {
      started();
      await waiting;
      return {
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: "output_text", text: "Yanıt" }] }],
        }),
      };
    },
  });
  await request(
    "admin/ai",
    { room_id: "room", name: "Bot", enabled: true },
    "admin",
  );
  const reply = request("bot/ask", { text: "Merhaba", consent: true });
  await ready;
  await request(
    "admin/ai",
    { room_id: "room", name: "Bot", enabled: false },
    "admin",
  );
  finish();
  assert.equal((await reply).status, 409);
  assert.equal(context.messages.size, 0);
});
