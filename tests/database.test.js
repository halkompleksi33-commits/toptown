import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/database.js";
import express from "express";
import { register as registerEconomy } from "../src/routes/economy.js";

test("PostgreSQL migration preserves existing users and is repeatable", async () => {
  const engine = new PGlite();
  const client = {
    async query(sql, params) {
      if (sql.includes("pg_advisory_xact_lock"))
        return { rows: [], rowCount: 1 };
      if (!params && sql.includes(";")) {
        const results = await engine.exec(sql);
        const last = results.at(-1);
        return { rows: last?.rows || [], rowCount: last?.affectedRows || 0 };
      }
      const result = await engine.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rows.length || result.affectedRows || 0,
      };
    },
    release() {},
  };
  const pool = { connect: async () => client };
  try {
    await migrate(pool);
    await client.query(
      "INSERT INTO users(id,name,login,city,age,password,coins,emoji) VALUES('original','Original','original','Mersin',18,'legacy',1000,'🙂')",
    );
    await migrate(pool);
    assert.equal(
      (await client.query("SELECT count(*) FROM schema_migrations")).rows[0]
        .count,
      1,
    );
    assert.equal(
      (await client.query("SELECT coins FROM users WHERE id='original'"))
        .rows[0].coins,
      1000,
    );
    await client.query("BEGIN");
    await client.query("UPDATE users SET coins=500 WHERE id='original'");
    await client.query("ROLLBACK");
    assert.equal(
      (await client.query("SELECT coins FROM users WHERE id='original'"))
        .rows[0].coins,
      1000,
    );
    await client.query(
      "INSERT INTO users(id,name,login,city,age,password,coins,emoji) VALUES('recipient','Recipient','recipient','Mersin',18,'legacy',1000,'🙂')",
    );
    const users = new Map(
      (await client.query("SELECT * FROM users")).rows.map((u) => [u.id, u]),
    );
    const rooms = new Map([["test-room", { id: "test-room", xp: 0 }]]);
    const presence = new Map([
      ["original", { room: "test-room" }],
      ["recipient", { room: "test-room" }],
    ]);
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = users.get("original");
      next();
    });
    registerEconomy({
      app,
      db: { ...pool, query: client.query.bind(client) },
      users,
      rooms,
      presence,
      fail: (r, s, e) => r.status(s).json({ error: e }),
      now: Date.now,
      notice: async () => {},
    });
    app.use((error, req, res, next) =>
      res.status(500).json({ error: error.message }),
    );
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const post = async (path, data) =>
      fetch("http://127.0.0.1:" + server.address().port + "/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    try {
      const gift = await post("gift", { gift: "rose", recipient: "recipient" });
      assert.equal(gift.status, 200);
      assert.equal((await gift.json()).coins, 970);
      assert.equal(
        (await client.query("SELECT coins FROM users WHERE id='recipient'"))
          .rows[0].coins,
        1030,
      );
      assert.equal(
        (
          await client.query(
            "SELECT xp FROM room_levels WHERE room_id='test-room'",
          )
        ).rows[0].xp,
        30,
      );
      const claims = await Promise.all([
        post("reward", {}),
        post("reward", {}),
      ]);
      assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await engine.close();
  }
});
