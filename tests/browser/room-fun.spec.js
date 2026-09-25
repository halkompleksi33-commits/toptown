import { test, expect } from "@playwright/test";

test("shared activities, gift animation and audio-reactive profile ring", async ({
  page,
  request,
}) => {
  const create = async (suffix) =>
    await (
      await request.post("/api/register", {
        data: {
          name: `Fun${Date.now()}${suffix}`,
          city: "Mersin",
          age: 20,
          password: "test-password",
        },
      })
    ).json();
  const owner = await create("a"),
    guest = await create("b");
  const headers = { Authorization: "Bearer " + owner.token },
    guestHeaders = { Authorization: "Bearer " + guest.token };
  const post = (path, data, h = headers) =>
    request.post("/api/" + path, { headers: h, data });
  const room = await (await post("rooms", { name: "Etkinlik odası" })).json();
  await post("join", { room: room.id });
  await post("join", { room: room.id }, guestHeaders);
  expect(
    (
      await post("activity", { action: "start", type: "quiz" }, guestHeaders)
    ).status(),
  ).toBe(403);
  expect(
    (
      await post("activity", {
        action: "start",
        type: "poll",
        title: "Anket",
        options: ["Tek"],
      })
    ).status(),
  ).toBe(400);
  let result = await (
    await post("activity", {
      action: "start",
      type: "poll",
      title: "Hangi renk?",
      options: ["Mavi", "Yeşil"],
    })
  ).json();
  const poll = result.activity.id;
  expect(
    (
      await post(
        "activity",
        { action: "vote", id: poll, choice: 0 },
        guestHeaders,
      )
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await post(
        "activity",
        { action: "vote", id: poll, choice: 1 },
        guestHeaders,
      )
    ).status(),
  ).toBe(409);
  result = await (await post("activity", { action: "close", id: poll })).json();
  expect(result.activity.results).toEqual([1, 0]);
  result = await (
    await post("activity", { action: "start", type: "quiz" })
  ).json();
  expect(result.activity.answer).toBeUndefined();
  expect(
    (
      await post(
        "activity",
        { action: "vote", id: result.activity.id, choice: 9 },
        guestHeaders,
      )
    ).status(),
  ).toBe(400);
  await post("activity", { action: "close", id: result.activity.id });
  result = await (
    await post("activity", { action: "start", type: "word" })
  ).json();
  const answer = result.activity.title
    .split(": ")[1]
    .split(" · ")
    .reverse()
    .join("");
  await post(
    "activity",
    { action: "vote", id: result.activity.id, answer },
    guestHeaders,
  );
  result = await (
    await post("activity", { action: "close", id: result.activity.id })
  ).json();
  expect(result.activity.winners).toContain(guest.user.name);
  await page.addInitScript(
    (token) => sessionStorage.setItem("toptown-session", token),
    owner.token,
  );
  await page.goto("/");
  await page.locator(`[data-room-id="${room.id}"]`).click();
  await expect(page.locator("#activityLive")).toContainText(answer);
  await post("gift", { recipient: owner.user.id, gift: "rose" }, guestHeaders);
  await expect(page.locator(".gift-celebration")).toBeVisible();
  await expect(page.locator(".gift-celebration")).toContainText(
    guest.user.name,
  );
  await page.locator("#activityOpen").click();
  await page.locator("#activityForm select").selectOption("poll");
  await page.locator('#activityForm [name="title"]').fill("Müzik seçelim mi?");
  await page.locator('#activityForm [name="options"]').fill("Evet\nHayır");
  await page
    .locator("#activityForm")
    .getByRole("button", { name: "Başlat", exact: true })
    .click();
  await expect(page.locator("#activityLive")).toContainText(
    "Müzik seçelim mi?",
  );
  await post("seat", { seat: 0 });
  await page.evaluate(async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const osc = ctx.createOscillator(),
      dest = ctx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    window.testAudio = { ctx, osc };
    // Feed actual audio samples through the same stream path used by the microphone.
    stream = dest.stream;
    await refresh();
  });
  await expect(page.locator("#seats .is-speaking")).toHaveCount(1);
  await page.evaluate(() => {
    stop();
    window.testAudio.osc.stop();
    window.testAudio.ctx.close();
  });
  await expect(page.locator("#seats .is-speaking")).toHaveCount(0);
});
