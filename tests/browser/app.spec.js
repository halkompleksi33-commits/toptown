import { test, expect } from "@playwright/test";
test("mobile registration, room, compact chat and logout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator("select[name=city]").waitFor();
  await page
    .locator("[name=name]")
    .first()
    .fill("Test" + Date.now());
  await page.locator("[name=password]").fill("test-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#createRoom input").fill("Yeni arkadaşlar");
  await page.locator("#createRoom button").click();
  await expect(page.locator("#room")).toBeVisible();
  await expect(page.locator(".seat")).toHaveCount(9);
  await page.locator("#messageForm input").fill("Merhaba!");
  await page.locator("#messageForm button").click();
  await expect(page.locator(".message--chat")).toContainText("Merhaba!");
  const height = await page
    .locator(".message--chat")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(100);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "test-results/mobile-room.png",
    fullPage: true,
  });
  await page.locator("#back").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  await page.locator("#logout").click();
  await expect(page.locator("#auth")).toBeVisible();
  expect(errors).toEqual([]);
});
test("logout revokes sessions; join logs and locked seats are enforced", async ({
  request,
}) => {
  const account = async (name) => {
    const r = await request.post("/api/register", {
      data: { name, city: "Mersin", age: 18, password: "test-password" },
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const a = await account("Owner" + Date.now()),
    b = await account("Guest" + Date.now());
  const post = (token, path, data) =>
    request.post("/api/" + path, {
      headers: { Authorization: "Bearer " + token },
      data,
    });
  const room = await (
    await post(a.token, "rooms", { name: "Private test" })
  ).json();
  await post(a.token, "join", { room: room.id });
  await post(a.token, "room/moderate", { action: "lock" });
  expect((await post(b.token, "join", { room: room.id })).ok()).toBeTruthy();
  expect((await post(b.token, "seat", { seat: 1 })).status()).toBe(403);
  const state = await (
    await request.get("/api/state", {
      headers: { Authorization: "Bearer " + b.token },
    })
  ).json();
  expect(state.messages.some((m) => m.kind === "join")).toBeTruthy();
  await post(b.token, "logout", {});
  expect(
    (
      await request.get("/api/me", {
        headers: { Authorization: "Bearer " + b.token },
      })
    ).status(),
  ).toBe(401);
});
test("desktop admin, light theme and profile emoji", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.locator("#loginTab").click();
  await page.locator("[name=name]").first().fill("admin");
  await page.locator("[name=password]").fill("local-test-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#profileButton").click();
  await page.locator('[data-emoji="🦊"]').click();
  await page.locator("#profileForm .primary").click();
  await expect(page.locator("#identity")).toContainText("🦊");
  await page.getByRole("button", { name: "◐ Tema", exact: true }).click();
  await expect(page.locator("body")).toHaveClass("light");
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
  });
  await page.locator("#adminButton").click();
  await expect(page.locator("#adminSearch")).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-admin.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("gifts preserve coin totals and daily rewards cannot be claimed twice", async ({
  request,
}) => {
  async function account(name) {
    return (
      await request.post("/api/register", {
        data: { name, city: "Mersin", age: 18, password: "test-password" },
      })
    ).json();
  }
  const a = await account("GiftA" + Date.now()),
    b = await account("GiftB" + Date.now());
  const post = (token, path, data) =>
    request.post("/api/" + path, {
      headers: { Authorization: "Bearer " + token },
      data,
    });
  const room = await (
    await post(a.token, "rooms", { name: "Hediye odası" })
  ).json();
  await post(a.token, "join", { room: room.id });
  await post(b.token, "join", { room: room.id });
  const gift = await (
    await post(a.token, "gift", { recipient: b.user.id, gift: "rose" })
  ).json();
  expect(gift.coins).toBe(970);
  expect(gift.xp).toBe(30);
  const recipient = await (
    await request.get("/api/me", {
      headers: { Authorization: "Bearer " + b.token },
    })
  ).json();
  expect(recipient.user.coins).toBe(1030);
  const repeatedXp = await (
    await post(a.token, "room/xp", { gift: "rose" })
  ).json();
  expect(repeatedXp.xp).toBe(30);
  const claims = await Promise.all([
    post(a.token, "reward", {}),
    post(a.token, "reward", {}),
  ]);
  expect(claims.map((r) => r.status()).sort()).toEqual([200, 409]);
});
