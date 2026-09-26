import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { register } from "../src/routes/ai-bot.js";
import { botRoster } from "../src/bot-presence.js";

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
