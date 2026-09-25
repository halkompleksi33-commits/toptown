import { test, expect } from "@playwright/test";
test("admin edits and deletes users and rooms; normal users are denied", async ({
  page,
  request,
}) => {
  const suffix = Date.now(),
    name = "Managed" + suffix;
  const account = await (
    await request.post("/api/register", {
      data: { name, city: "Mersin", age: 18, password: "initial-password" },
    })
  ).json();
  const admin = await (
    await request.post("/api/login", {
      data: { name: "admin", password: "local-test-password" },
    })
  ).json();
  const headers = { Authorization: "Bearer " + account.token },
    adminHeaders = { Authorization: "Bearer " + admin.token };
  const room = await (
    await request.post("/api/rooms", {
      headers,
      data: { name: "Managed room " + suffix },
    })
  ).json();
  for (const path of [
    "users/" + account.user.id + "/update",
    "users/" + account.user.id + "/delete",
    "rooms/" + room.id + "/update",
    "rooms/" + room.id + "/delete",
  ]) {
    expect(
      (
        await request.post("/api/admin/" + path, {
          headers,
          data: { confirm: account.user.id },
        })
      ).status(),
    ).toBe(403);
  }
  await page.addInitScript(
    (token) => sessionStorage.setItem("toptown-session", token),
    admin.token,
  );
  await page.goto("/");
  await page.locator("#adminButton").click();
  await page.locator("#adminSearch").fill(name);
  await page
    .locator("#adminDialog")
    .getByRole("button", { name: "Düzenle", exact: true })
    .click();
  const editor = page
    .locator("dialog")
    .filter({
      has: page.getByRole("heading", { name: "Kullanıcıyı düzenle" }),
    });
  await editor.locator("[name=city]").fill("İzmir");
  await editor.locator("[name=age]").fill("25");
  await editor.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(editor).toHaveCount(0);
  const info = await (await request.get("/api/me", { headers })).json();
  expect(info.user.city).toBe("İzmir");
  expect(info.user.age).toBe(25);
  await page
    .locator("#adminDialog")
    .getByRole("button", { name: "Odalar", exact: true })
    .click();
  await page.locator("#adminSearch").fill("Managed room " + suffix);
  await page
    .locator("#adminDialog")
    .getByRole("button", { name: "Düzenle", exact: true })
    .click();
  const roomEditor = page
    .locator("dialog")
    .filter({ has: page.getByRole("heading", { name: "Odayı düzenle" }) });
  await roomEditor.locator("[name=name]").fill("Updated room " + suffix);
  await roomEditor.locator("[name=locked]").check();
  await roomEditor
    .getByRole("button", { name: "Değişiklikleri kaydet" })
    .click();
  await expect(roomEditor).toHaveCount(0);
  const list = await (
    await request.get("/api/admin/rooms", { headers: adminHeaders })
  ).json();
  expect(list.rooms.find((x) => x.id === room.id).locked).toBe(true);
  expect(
    (
      await request.post("/api/admin/users/" + admin.user.id + "/delete", {
        headers: adminHeaders,
        data: { confirm: admin.user.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/admin/users/" + account.user.id + "/delete", {
        headers: adminHeaders,
        data: {},
      })
    ).status(),
  ).toBe(400);
  await request.post("/api/admin/users/" + account.user.id + "/update", {
    headers: adminHeaders,
    data: { name, city: "İzmir", age: 25, password: "replacement-password" },
  });
  expect((await request.get("/api/me", { headers })).status()).toBe(401);
  const login = await request.post("/api/login", {
    data: { name, password: "replacement-password" },
  });
  expect(login.ok()).toBeTruthy();
  await request.post("/api/admin/users/" + account.user.id + "/delete", {
    headers: adminHeaders,
    data: { confirm: account.user.id },
  });
  const transferred = await (
    await request.get("/api/admin/rooms", { headers: adminHeaders })
  ).json();
  expect(transferred.rooms.find((x) => x.id === room.id).owner).toBe(
    admin.user.id,
  );
  await page.locator("#adminSearch").fill("Updated room " + suffix);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#adminDialog")
    .getByRole("button", { name: "Sil", exact: true })
    .click();
  await expect(page.locator("#adminDialog")).not.toContainText(
    "Updated room " + suffix,
  );
  const final = await (
    await request.get("/api/admin/rooms", { headers: adminHeaders })
  ).json();
  expect(final.rooms.some((x) => x.id === room.id)).toBe(false);
});
