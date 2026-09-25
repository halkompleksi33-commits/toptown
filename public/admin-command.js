(() => {
  const panel = document.querySelector("#adminDialog");
  let pane = "users",
    data,
    busy = false;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action) => {
    const b = el("button", text);
    b.type = "button";
    b.onclick = action;
    return b;
  };
  async function request(path, body) {
    const response = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + sessionStorage.getItem("toptown-session"),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "İşlem yapılamadı.");
    return result;
  }
  const run = (action) => async () => {
    if (busy) return;
    busy = true;
    try {
      await action();
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
    }
  };
  async function open() {
    data = await request("admin");
    const [rooms, reports, bans] = await Promise.all([
      request("admin/rooms"),
      request("admin/reports"),
      request("admin/bans"),
    ]);
    data.rooms = rooms.rooms;
    data.reports = reports.reports;
    data.bans = bans.bans;
    render();
    if (!panel.open) panel.showModal();
  }
  function render() {
    panel.classList.add("admin-command");
    panel.replaceChildren();
    panel.append(
      button("×", () => panel.close()),
      el("h2", "Yönetici paneli"),
    );
    panel.firstChild.className = "close";
    panel.firstChild.setAttribute("aria-label", "Kapat");
    const stats = el("div", undefined, "command-stats");
    for (const [label, value] of [
      ["Kullanıcı", data.summary.users],
      ["Oda", data.summary.rooms],
      ["Çevrimiçi", data.summary.online],
    ]) {
      const card = el("article");
      card.append(el("b", value), el("span", label));
      stats.append(card);
    }
    const tabs = el("div", undefined, "command-tabs");
    for (const [key, label] of [
      ["users", "Kullanıcılar"],
      ["rooms", "Odalar"],
      ["reports", "Raporlar"],
      ["bans", "Ban geçmişi"],
    ]) {
      const b = button(label, () => {
        pane = key;
        render();
      });
      b.classList.toggle("active", pane === key);
      tabs.append(b);
    }
    panel.append(stats, tabs);
    if (pane === "users" || pane === "rooms") {
      const search = el("input");
      search.id = "adminSearch";
      search.placeholder =
        pane === "users" ? "Kullanıcı veya şehir ara…" : "Oda veya kurucu ara…";
      search.setAttribute("aria-label", search.placeholder);
      const list = el("div", undefined, "command-list");
      panel.append(search, list);
      const draw = () => {
        list.replaceChildren();
        const query = search.value.toLocaleLowerCase("tr-TR");
        const items = (pane === "users" ? data.users : data.rooms).filter(
          (item) =>
            (item.name + " " + (item.city || item.ownerName || ""))
              .toLocaleLowerCase("tr-TR")
              .includes(query),
        );
        if (!items.length) list.append(el("p", "Sonuç bulunamadı."));
        for (const item of items) {
          const row = el("article"),
            info = el("span"),
            actions = el("div", undefined, "admin-actions");
          info.append(
            el("b", item.name),
            el(
              "small",
              pane === "users"
                ? item.city +
                    " · " +
                    item.age +
                    " yaş · " +
                    item.coins +
                    " jeton"
                : item.ownerName +
                    " · " +
                    item.online +
                    " kişi" +
                    (item.locked ? " · Koltuklar kilitli" : ""),
            ),
          );
          actions.append(button("Düzenle", () => edit(item, pane)));
          if (pane === "rooms" || !item.is_admin) {
            const remove = button(
              "Sil",
              run(async () => {
                const kind = pane === "users" ? "kullanıcı" : "oda";
                const detail =
                  pane === "users"
                    ? "Hesap, özel mesajları ve ilgili kayıtları silinir. Sahip olduğu odalar size devredilir."
                    : "Oda, sohbet geçmişi ve oda ayarları silinir. Katılımcılar ana sayfaya döner.";
                if (
                  !confirm(
                    "“" +
                      item.name +
                      "” adlı " +
                      kind +
                      " silinsin mi?\n\n" +
                      detail +
                      "\nBu işlem geri alınamaz.",
                  )
                )
                  return;
                await request(
                  "admin/" +
                    pane +
                    "/" +
                    encodeURIComponent(item.id) +
                    "/delete",
                  { confirm: item.id },
                );
                toast("Silindi.");
                await open();
              }),
            );
            remove.className = "danger";
            actions.append(remove);
          } else info.append(el("em", "Yönetici · silinemez"));
          row.append(info, actions);
          list.append(row);
        }
      };
      search.oninput = draw;
      draw();
    } else {
      const list = el("div", undefined, "command-list"),
        items = data[pane];
      for (const item of items) {
        const row = el("article");
        row.append(
          el("span", item.reason),
          el("small", new Date(+item.created).toLocaleString("tr-TR")),
        );
        list.append(row);
      }
      if (!items.length) list.append(el("p", "Kayıt yok."));
      panel.append(list);
    }
  }
  function edit(item, kind) {
    const modal = el("dialog"),
      form = el("form"),
      error = el("p", "", "error");
    const close = button("×", () => modal.close());
    close.className = "close";
    close.setAttribute("aria-label", "Düzenlemeyi kapat");
    form.append(
      close,
      el("h2", kind === "users" ? "Kullanıcıyı düzenle" : "Odayı düzenle"),
    );
    function field(label, name, value, type = "text") {
      const wrapper = el("label", label),
        input = el("input");
      input.name = name;
      input.type = type;
      input.value = value;
      wrapper.append(input);
      form.append(wrapper);
      return input;
    }
    const name = field("İsim", "name", item.name);
    name.required = true;
    name.minLength = 2;
    name.maxLength = kind === "users" ? 30 : 50;
    if (kind === "users") {
      if (item.is_admin) name.readOnly = true;
      const city = field("Şehir", "city", item.city);
      city.required = true;
      city.minLength = 2;
      city.maxLength = 50;
      const age = field("Yaş", "age", item.age, "number");
      age.required = true;
      age.min = 18;
      age.max = 120;
      const password = field(
        "Yeni şifre (değiştirmemek için boş bırak)",
        "password",
        "",
        "password",
      );
      password.minLength = 4;
      password.maxLength = 128;
      password.autocomplete = "new-password";
      form.append(
        el(
          "p",
          "Şifre değişirse kullanıcının açık oturumları kapatılır.",
          "fine",
        ),
      );
    } else {
      const label = el("label", "Oda sahibi"),
        owner = el("select");
      owner.name = "owner";
      for (const user of data.users)
        owner.add(
          new Option(user.name, user.id, false, user.id === item.owner),
        );
      label.append(owner);
      form.append(label);
      const locked = field("Koltukları kilitle", "locked", "", "checkbox");
      locked.checked = item.locked;
    }
    const save = el("button", "Değişiklikleri kaydet", "primary");
    save.type = "submit";
    error.setAttribute("role", "alert");
    form.append(error, save);
    modal.append(form);
    document.body.append(modal);
    modal.onclose = () => modal.remove();
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      error.textContent = "";
      const values = Object.fromEntries(new FormData(form));
      if (kind === "rooms") values.locked = form.elements.locked.checked;
      try {
        const result = await request(
          "admin/" + kind + "/" + encodeURIComponent(item.id) + "/update",
          values,
        );
        modal.close();
        if (result.reauthenticate) {
          sessionStorage.removeItem("toptown-session");
          location.reload();
          return;
        }
        toast("Değişiklikler kaydedildi.");
        await open();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        save.disabled = false;
      }
    };
    modal.showModal();
  }
  document.querySelector("#adminButton").onclick = run(open);
})();
