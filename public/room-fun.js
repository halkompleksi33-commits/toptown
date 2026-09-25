(() => {
  const panel = document.createElement("section");
  panel.className = "room-fun";
  panel.innerHTML = `<div class="fun-heading"><strong>🎮 Birlikte eğlen</strong><button id="activityOpen" type="button">Oyun / anket başlat</button></div><div id="activityLive" aria-live="polite"></div>`;
  $("#chat").before(panel);
  const overlay = document.createElement("div");
  overlay.className = "gift-celebration";
  overlay.hidden = true;
  overlay.setAttribute("role", "status");
  document.body.append(overlay);
  const dialog = document.createElement("dialog");
  dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Kapat">×</button></form><h2>Oda etkinliği</h2><p>60 saniyelik bir tur başlat. Herkes bir kez katılabilir. Etkinlikler geçicidir; sunucu yeniden başlatıldığında sıfırlanır.</p><form id="activityForm"><label>Tür<select name="type"><option value="quiz">Bilgi yarışması</option><option value="word">Kelime oyunu</option><option value="poll">Anket</option></select></label><fieldset id="pollFields" hidden disabled><label>Soru<input name="title" maxlength="120" minlength="3" required></label><label>Seçenekler (her satıra bir seçenek)<textarea name="options" rows="4" required maxlength="243"></textarea></label></fieldset><button class="primary">Başlat</button><p class="fine" role="alert" id="activityError"></p></form>`;
  document.body.append(dialog);
  $("#activityOpen").onclick = () => dialog.showModal();
  $("#activityForm select").onchange = (e) => {
    $("#pollFields").hidden = $("#pollFields").disabled =
      e.target.value !== "poll";
  };
  $("#activityForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      button = form.querySelector("button"),
      data = new FormData(form);
    button.disabled = true;
    try {
      await api("activity", {
        action: "start",
        type: data.get("type"),
        title: data.get("title"),
        options: String(data.get("options") || "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      dialog.close();
      await refresh();
    } catch (error) {
      $("#activityError").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  let currentRoom, signature, giftTimer, context;
  const seen = new Set(),
    monitors = new Map();
  function render(activity, canManage) {
    const signatureNext = JSON.stringify([activity, canManage]);
    if (signature === signatureNext) return;
    signature = signatureNext;
    const area = $("#activityLive");
    area.replaceChildren();
    if (!activity) {
      area.textContent =
        "Bilgi yarışması, kelime oyunu veya oda anketiyle sohbete renk kat.";
      return;
    }
    const title = document.createElement("h3"),
      status = document.createElement("p");
    title.textContent = activity.title;
    status.textContent = `${activity.count} katılım · ${activity.ended ? "Tur tamamlandı" : "60 saniyelik tur"}`;
    area.append(title, status);
    const vote = async (body) => {
      await api("activity", { action: "vote", id: activity.id, ...body });
      await refresh();
    };
    activity.options.forEach((option, i) => {
      const button = document.createElement("button");
      button.textContent =
        option +
        (activity.ended || activity.type === "poll"
          ? ` · ${activity.results[i]} oy`
          : "");
      button.disabled = activity.ended || activity.voted;
      button.onclick = safe(() => vote({ choice: i }));
      area.append(button);
    });
    if (activity.type === "word" && !activity.ended && !activity.voted) {
      const form = document.createElement("form");
      form.innerHTML =
        '<label>Cevabın<input name="answer" required maxlength="40" autocomplete="off"></label><button>Tahmin et</button>';
      form.onsubmit = safe(async (e) => {
        e.preventDefault();
        await vote({ answer: new FormData(form).get("answer") });
      });
      area.append(form);
    }
    if (activity.voted && !activity.ended) {
      const p = document.createElement("p");
      p.textContent = "Katılımın kaydedildi. Sonuçlar tur bitince açılır.";
      area.append(p);
    }
    if (activity.ended && activity.type !== "poll") {
      const result = document.createElement("p");
      result.textContent = `Doğru cevap: ${activity.answer} · Doğru bilenler: ${activity.winners.join(", ") || "Henüz kimse yok"}`;
      area.append(result);
    }
    if (canManage && !activity.ended) {
      const close = document.createElement("button");
      close.textContent = "Turu bitir";
      close.onclick = safe(async () => {
        await api("activity", { action: "close", id: activity.id });
        await refresh();
      });
      area.append(close);
    }
  }
  function cleanupMonitor(id) {
    const m = monitors.get(id);
    try {
      m?.source.disconnect();
      m?.analyser.disconnect();
    } catch {}
    monitors.delete(id);
  }
  function soundMeters() {
    if (!room || !user) return;
    const media = new Map(remoteStreams);
    if (stream) media.set(user.id, stream);
    for (const [id, m] of monitors)
      if (
        media.get(id) !== m.stream ||
        !m.stream
          .getAudioTracks()
          .some((t) => t.readyState === "live" && t.enabled)
      )
        cleanupMonitor(id);
    for (const [id, value] of media) {
      if (
        monitors.has(id) ||
        !value
          .getAudioTracks()
          .some((t) => t.readyState === "live" && t.enabled)
      )
        continue;
      try {
        context ||= new AudioContext();
        const source = context.createMediaStreamSource(
            new MediaStream(value.getAudioTracks()),
          ),
          analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        monitors.set(id, {
          stream: value,
          source,
          analyser,
          data: new Float32Array(512),
          last: 0,
        });
      } catch {
        /* Media remains usable if sound analysis is unavailable. */
      }
    }
    for (const element of document.querySelectorAll("[data-speaker]")) {
      const m = monitors.get(element.dataset.speaker);
      if (m && context?.state === "running") {
        m.analyser.getFloatTimeDomainData(m.data);
        const volume = Math.sqrt(
          m.data.reduce((sum, x) => sum + x * x, 0) / m.data.length,
        );
        if (volume > 0.025) m.last = Date.now();
      }
      const active = !!m && Date.now() - m.last < 280;
      element.classList.toggle("is-speaking", active);
      element.title = active ? "Konuşuyor" : "";
    }
  }
  document.addEventListener("click", () => {
    if (!context && room) {
      try {
        context = new AudioContext();
      } catch {}
    }
    context?.resume().catch(() => {});
  });
  setInterval(soundMeters, 100);
  window.TopTownFun = {
    stop() {
      for (const id of monitors.keys()) cleanupMonitor(id);
      document
        .querySelectorAll(".is-speaking")
        .forEach((e) => e.classList.remove("is-speaking"));
      overlay.hidden = true;
      clearTimeout(giftTimer);
    },
    update(data) {
      if (currentRoom !== room) {
        currentRoom = room;
        seen.clear();
        signature = null;
      }
      const manage = !!data.canManageActivities;
      $("#activityOpen").hidden = !manage;
      render(data.fun?.activity, manage);
      const fresh = (data.fun?.gifts || []).filter((g) => !seen.has(g.id));
      for (const gift of fresh) seen.add(gift.id);
      if (seen.size > 200) {
        seen.clear();
        for (const g of data.fun?.gifts || []) seen.add(g.id);
      }
      const gift = fresh.at(-1);
      if (gift) {
        overlay.replaceChildren();
        const icon = document.createElement("span"),
          label = document.createElement("strong");
        icon.textContent =
          { rose: "🌹", cake: "🎂", rocket: "🚀", crown: "👑" }[gift.gift] ||
          "🎁";
        label.textContent = `${gift.sender} → ${gift.recipient}`;
        overlay.append(icon, label);
        overlay.hidden = false;
        clearTimeout(giftTimer);
        giftTimer = setTimeout(() => (overlay.hidden = true), 2800);
      }
    },
  };
})();
