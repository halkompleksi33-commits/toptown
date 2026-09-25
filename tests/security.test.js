import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "../src/security.js";
test("passwords are salted and verified without plaintext storage", async () => {
  const first = await hashPassword("test-password");
  assert.notEqual(first, await hashPassword("test-password"));
  assert.equal(await verifyPassword("test-password", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(
    await verifyPassword("test-password", "scrypt:invalid:invalid"),
    false,
  );
});
test("existing SHA256 accounts can migrate on login", async () => {
  const old = createHash("sha256").update("existing-password").digest("hex");
  assert.equal(await verifyPassword("existing-password", old), true);
  assert.equal(await verifyPassword("wrong", old), false);
});
