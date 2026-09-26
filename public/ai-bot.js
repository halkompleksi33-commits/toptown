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
    const [info, roomData] = await Promise.all([
      api("admin/ai"),
      api("admin/rooms"),
    ]);
    const dialog = document.createElement("dialog");
    dialog.innerHTML =
      '<form method="dialog"><button class="close" aria-label="Kapat">×</button></form><h2>AI bot yönetimi</h2><p class="ai-status"></p><form class="ai-config"><label>Oda<select name="room_id" required></select></label><label>Bot adı<input name="name" minlength="2" maxlength="30" required></label><label><input name="enabled" type="checkbox"> Bu odada etkinleştir</label><p>Bot, kullanıcıların açıkça gönderdiği sorulara yanıt verir. API kullanımı ücretlidir. Site genelinde günlük en fazla 100 istek; kullanıcı başına 30 saniye bekleme uygulanır. Otomatik hediye gönderimi bu bağlantıya dahil değildir.</p><button class="primary">Kaydet</button><p class="ai-error" role="alert"></p></form>';
    dialog.querySelector(".ai-status").textContent =
      `${info.configured ? "API anahtarı sunucuda tanımlı (bağlantı henüz test edilmedi)" : "OPENAI_API_KEY eksik"} · Model: ${info.model}`;
    const form = dialog.querySelector(".ai-config"),
      select = form.elements.room_id;
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
    };
    select.onchange = load;
    load();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const b = form.querySelector("button");
      b.disabled = true;
      try {
        await api("admin/ai", {
          room_id: select.value,
          name: form.elements.name.value,
          enabled: form.elements.enabled.checked,
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
  };
})();
