import { test, expect } from "@playwright/test";

test("room keeps gift animation and has no games panel", async ({ page, request }) => {
  const create = async (suffix) =>
    (await request.post("/api/register", { data: { name: `Room${Date.now()}${suffix}`, city: "Mersin", age: 20, password: "test-password" } })).json();
  const owner = await create("a"), guest = await create("b");
  const post = (path, data, token = owner.token) =>
    request.post("/api/" + path, { headers: { Authorization: "Bearer " + token }, data });
  const created = await (await post("rooms", { name: "Sessiz oda" })).json();
  await post("join", { room: created.id });
  await post("join", { room: created.id }, guest.token);
  await page.addInitScript((token) => sessionStorage.setItem("toptown-session", token), owner.token);
  await page.goto("/");
  await page.locator(`[data-room-id="${created.id}"]`).click();
  await expect(page.locator("#activityOpen")).toHaveCount(0);
  await expect(page.locator("#propertyGame")).toHaveCount(0);
  await post("gift", { recipient: owner.user.id, gift: "rose" }, guest.token);
  await expect(page.locator(".gift-celebration")).toBeVisible();
  await expect((await post("activity", { action: "start", type: "quiz" })).status()).toBe(410);
});
