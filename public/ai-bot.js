(() => {
  const modal = document.createElement("dialog");
  modal.innerHTML =
    '<form method="dialog"><button class="close" aria-label="Kapat">×</button></form><h2>🤖 AI bota sor</h2><p>Yalnızca bu alana yazdığın soru OpenAI’ye gönderilir. Botun yanıtı odadaki herkese görünür. Kişisel bilgi veya şifre yazma.</p><p id="aiBotStatus" role="status"></p><form id="aiAskForm"><label>Sorun<textarea name="text" maxlength="600" required rows="3"></textarea></label><label><input name="consent" type="checkbox" required> Sorumu OpenAI’ye göndermeyi ve yanıtın odada paylaşılmasını kabul ediyorum.</label><button class="primary">Bota gönder</button></form>';
  document.body.append(modal);
  const launch = document.createElement("button");
  launch.type = "button";
  launch.textContent = "🤖 AI bota sor";
  $("#messageForm").after(launch);
  launch.onclick = safe(async () => {
    const info = await api("bot");
    $("#aiBotStatus").textContent = info.enabled
      ? info.name + " [BOT] hazır"
      : "Bu odada AI bot kapalı. Admin panelinden açılabilir.";
    $("#aiAskForm").hidden = !info.enabled;
    modal.showModal();
  });
  $("#aiAskForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      button = form.querySelector("button");
    button.disabled = true;
    $("#aiBotStatus").textContent = "Bot düşünüyor…";
    try {
      await api("bot/ask", {
        text: new FormData(form).get("text"),
        consent: form.elements.consent.checked,
      });
      form.reset();
      modal.close();
      await refresh();
    } catch (error) {
      $("#aiBotStatus").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  window.openAiBotAdmin = async () => {
    const [info, roomData, userData] = await Promise.all([
      api("admin/ai"),
      api("admin/rooms"),
      api("admin"),
    ]);
    const dialog = document.createElement("dialog");
    dialog.innerHTML =
      '<form method="dialog"><button class="close" aria-label="Kapat">×</button></form><h2>AI bot yönetimi</h2><p class="ai-status"></p><form class="ai-config"><label>Oda<select name="room_id" required></select></label><label>Bot adı<input name="name" minlength="2" maxlength="30" required></label><label><input name="enabled" type="checkbox"> Bu odada etkinleştir</label><p>Bot, kullanıcıların açıkça gönderdiği sorulara yanıt verir. API kullanımı ücretlidir. Site genelinde günlük en fazla 100 istek; kullanıcı başına 30 saniye bekleme uygulanır. Otomatik hediye gönderimi bu bağlantıya dahil değildir.</p><button class="primary">Kaydet</button><p class="ai-error" role="alert"></p></form>';
    dialog.querySelector(".ai-status").textContent =
      `${info.configured ? "API anahtarı sunucuda tanımlı (bağlantı henüz test edilmedi)" : "OPENAI_API_KEY eksik"} · Model: ${info.model}`;
    const form = dialog.querySelector(".ai-config"),
      select = form.elements.room_id;
    form.querySelector("p").textContent =
      "Bot sorulara AI yanıtı verir. Günlük 100 API isteği sınırı korunur. Aşağıdaki koltuk ve hediye işlemleri yönetici tarafından gerçekleştirilir.";
    for (const [name, text] of [
      ["joined", "Bot odada bulunsun (kapatınca odadan çıkar)"],
      [
        "automatic",
        "Kendiliğinden sohbet başlatsın (5 dakikada en fazla bir hazır mesaj)",
      ],
    ]) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.name = name;
      label.append(input, document.createTextNode(" " + text));
      form.querySelector("button").before(label);
    }
    for (const room of roomData.rooms) {
      const option = document.createElement("option");
      option.value = room.id;
      option.textContent = room.name;
      select.append(option);
    }
    const load = () => {
      const bot = info.bots.find((b) => b.room_id === select.value);
      form.elements.name.value = bot?.name || "TopTown Asistan";
      form.elements.enabled.checked = !!bot?.enabled;
      form.elements.joined.checked = !!bot?.joined;
      form.elements.automatic.checked = !!bot?.automatic;
    };
    select.onchange = load;
    load();
    const actions = document.createElement("section");
    actions.innerHTML =
      '<h3>Koltuk ve hediyeler</h3><p>Önce botu odaya alıp ayarları kaydedin. Koltuklar sunucu yeniden başlatılırsa boşalır.</p><label>Bot koltuğu<select class="bot-seat"><option value="">Ayakta</option></select></label><button type="button" class="bot-sit">Koltuğu uygula</button><label>Hediye alıcısı<select class="bot-recipient"></select></label><label>Hediye<select class="bot-gift"><option value="rose">🌹 Gül · 30 jeton</option><option value="cake">🎂 Pasta · 120 jeton</option><option value="rocket">🚀 Roket · 300 jeton</option><option value="crown">👑 Taç · 800 jeton</option></select></label><p>Hediye bot adına gönderilir; bedeli sizin yönetici bakiyenizden düşer. İşlem hediye geçmişinde sponsor yöneticiye kaydedilir.</p><button type="button" class="bot-send">Bot adına hediye gönder</button><p class="bot-action-status" role="status"></p>';
    const seatSelect = actions.querySelector(".bot-seat"),
      recipientSelect = actions.querySelector(".bot-recipient"),
      actionStatus = actions.querySelector(".bot-action-status");
    for (let i = 0; i < 9; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i + 1 + ". koltuk";
      seatSelect.append(option);
    }
    const refreshActions = async () => {
      const id = select.value;
      recipientSelect.replaceChildren();
      if (!id) return;
      const details = await api("admin/bot/room/" + encodeURIComponent(id));
      if (select.value !== id || !dialog.isConnected) return;
      seatSelect.value = details.seat === null ? "" : String(details.seat);
      for (const user of userData.users.filter((u) =>
        details.members.includes(u.id),
      )) {
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = user.name;
        recipientSelect.append(option);
      }
    };
    select.onchange = () => {
      load();
      refreshActions().catch((e) => (actionStatus.textContent = e.message));
    };
    const execute = async (button, path, body) => {
      button.disabled = true;
      actionStatus.textContent = "";
      try {
        await api(path, body);
        actionStatus.textContent = "İşlem tamamlandı.";
        await refreshActions();
      } catch (error) {
        actionStatus.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    actions.querySelector(".bot-sit").onclick = (e) =>
      execute(e.target, "admin/bot/seat", {
        room_id: select.value,
        seat: seatSelect.value === "" ? null : Number(seatSelect.value),
      });
    actions.querySelector(".bot-send").onclick = (e) => {
      if (!recipientSelect.value) {
        actionStatus.textContent = "Önce odadan bir alıcı seçin.";
        return;
      }
      if (
        !confirm(
          "Seçili hediyenin bedeli yönetici bakiyenizden düşecek. Gönderilsin mi?",
        )
      )
        return;
      execute(e.target, "admin/bot/gift", {
        room_id: select.value,
        recipient: recipientSelect.value,
        gift: actions.querySelector(".bot-gift").value,
      });
    };
    dialog.append(actions);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const b = form.querySelector("button");
      b.disabled = true;
      try {
        await api("admin/ai", {
          room_id: select.value,
          name: form.elements.name.value,
          enabled: form.elements.enabled.checked,
          joined: form.elements.joined.checked,
          automatic: form.elements.automatic.checked,
        });
        dialog.close();
        toast("Bot ayarları kaydedildi.");
      } catch (error) {
        dialog.querySelector(".ai-error").textContent = error.message;
      } finally {
        b.disabled = false;
      }
    };
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
    refreshActions().catch((e) => (actionStatus.textContent = e.message));
  };
})();
