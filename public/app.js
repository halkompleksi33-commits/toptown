const $ = (s) => document.querySelector(s);
let token = sessionStorage.getItem("toptown-session") || "",
  user,
  room,
  people = [],
  after = 0,
  polling = false,
  mode = "register",
  timer,
  homeTimer,
  stream,
  videoId,
  videoPanelHidden = false,
  peers = new Map(),
  remoteStreams = new Map();
const toast = (t) => {
  $("#toast").textContent = t;
  $("#toast").hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => ($("#toast").hidden = true), 4000);
};
async function api(p, b) {
  const r = await fetch("/api/" + p, {
      method: b ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: b ? JSON.stringify(b) : undefined,
    }),
    d = await r.json().catch(() => ({
      error: "Sunucudan geçersiz yanıt alındı. Lütfen tekrar deneyin.",
    }));
  if (!r.ok) {
    if (r.status === 401 && !["login", "register"].includes(p)) {
      stop();
      room = null;
      user = null;
      token = "";
      clearInterval(homeTimer);
      sessionStorage.removeItem("toptown-session");
      show("auth");
    }
    throw Object.assign(Error(d.error || "Bağlantı sorunu"), {
      status: r.status,
    });
  }
  return d;
}
function show(x) {
  ["auth", "home", "room"].forEach((i) => ($("#" + i).hidden = i !== x));
  $("#identity").textContent = user
    ? (user.emoji || "🙂") + " " + user.name
    : "";
  $("#logout").hidden = !user;
  $("#profileButton").hidden = !user;
}
const safe = (f) => async (e) => {
  try {
    await f(e);
  } catch (x) {
    toast(x.message);
  }
};
function tab(m) {
  $("#registerTab").classList.toggle("selected", m === "register");
  $("#loginTab").classList.toggle("selected", m === "login");
  mode = m;
  $("#registerFields").hidden = m === "login";
  $("#privacy").hidden = m === "login";
  for (const input of $("#registerFields").querySelectorAll("input,select"))
    input.required = m === "register";
  $("#authSubmit").textContent = m === "login" ? "Giriş yap" : "Hesap oluştur";
}
$("#registerTab").onclick = () => tab("register");
$("#loginTab").onclick = () => tab("login");
$("#authForm").onsubmit = safe(async (e) => {
  e.preventDefault();
  const d = await api(mode, Object.fromEntries(new FormData(e.target)));
  token = d.token;
  user = d.user;
  sessionStorage.setItem("toptown-session", token);
  await home();
});
async function loadRooms() {
  const rows = await api("rooms?fresh=" + Date.now());
  const badge = $("#onlineBadge");
  if (badge)
    badge.textContent =
      "● Çevrimiçi: " + rows.reduce((sum, row) => sum + row.online, 0);
  $("#rooms").replaceChildren(
    ...rows.map((r) => {
      const b = document.createElement("button");
      b.className = "roomcard";
      b.dataset.roomId = r.id;
      const title = document.createElement("strong"),
        owner = document.createElement("small"),
        meta = document.createElement("span");
      title.textContent = r.name;
      owner.className = "room-owner";
      owner.textContent = "Kurucu: " + r.ownerName;
      meta.className = "room-level";
      meta.textContent = r.online + " kişi · Seviye " + r.level + " · Katıl →";
      b.append(title, owner, meta);
      if (/^data:image\/(png|jpeg|webp);base64,/.test(r.image || "")) {
        b.classList.add("room-cover");
        b.style.backgroundImage =
          'linear-gradient(100deg,#211637ee,#24174577),url("' + r.image + '")';
      }
      const search =
        $("#safeRoomSearch")?.value.toLocaleLowerCase("tr-TR") || "";
      b.hidden = !b.textContent.toLocaleLowerCase("tr-TR").includes(search);
      b.onclick = safe(() => join(r.id, r.private_room));
      return b;
    }),
  );
}
async function home() {
  room = null;
  stop();
  show("home");
  $("#greeting").textContent = "Merhaba, " + user.name + ".";
  $("#adminButton").hidden = !(await api("me")).admin;
  await loadRooms();
  clearInterval(homeTimer);
  homeTimer = setInterval(() => {
    if (!room && user && !document.hidden) loadRooms().catch(() => {});
  }, 10000);
}
async function join(id, isPrivate = false) {
  const code = isPrivate ? prompt("Oda şifresi") : "";
  if (code === null) return;
  await api("join", { room: id, code });
  clearInterval(homeTimer);
  room = id;
  after = 0;
  $("#chat").replaceChildren();
  show("room");
  refresh();
}
$("#createRoom").onsubmit = safe(async (e) => {
  e.preventDefault();
  await join(
    (await api("rooms", { name: new FormData(e.target).get("name") })).id,
  );
});
$("#back").onclick = safe(async () => {
  await api("leave", {});
  home();
});
$("#logout").onclick = safe(async () => {
  await api("logout", {});
  token = "";
  user = null;
  clearInterval(homeTimer);
  sessionStorage.removeItem("toptown-session");
  stop();
  show("auth");
});
async function refresh() {
  if (!room || polling) return;
  polling = true;
  try {
    const d = await api("state?after=" + after);
    people = d.people;
    const imageButton = $("#roomImageButton");
    if (imageButton) imageButton.hidden = d.room.owner !== user.id;
    const self = people.find((p) => p.id === user.id);
    if (self?.muted || self?.seat === null) {
      if (stream) stop();
    }
    $("#roomTitle").textContent = d.room.name;
    $("#online").textContent = people.length + " kişi odada";
    $("#coins").textContent = "🪙 " + d.coins;
    if (stream) {
      for (const u of people)
        if (u.id !== user.id && !peers.has(u.id)) await offer(u.id);
    }
    for (const [id, p] of peers)
      if (!people.some((u) => u.id === id)) {
        p.close();
        peers.delete(id);
        remoteStreams.delete(id);
        $("#remoteVideos")
          .querySelector('[data-user="' + id + '"]')
          ?.remove();
      }
    draw();
    const chat = $("#chat"),
      followLatest =
        chat.scrollHeight - chat.scrollTop - chat.clientHeight < 90;
    for (const bot of d.bots || []) {
      const badge = document.createElement("span");
      badge.className = "person";
      badge.textContent = "🤖 " + bot.name;
      $("#people").append(badge);
    }
    for (const m of d.messages) {
      if (m.id > after) {
        const p = document.createElement("p");
        p.className = "message message--" + m.kind;
        p.textContent = m.name + (m.kind === "chat" ? ": " : " ") + m.text;
        $("#chat").append(p);
        after = Math.max(after, m.id);
      }
    }
    if (followLatest) $("#chat").scrollTop = $("#chat").scrollHeight;
    window.TopTownFun?.update(d);
    if (d.room.youtube !== videoId) {
      videoId = d.room.youtube;
      $("#youtube").replaceChildren();
      if (videoId) {
        const f = document.createElement("iframe");
        f.src = "https://www.youtube-nocookie.com/embed/" + videoId;
        f.allow = "autoplay;encrypted-media";
        $("#youtube").append(f);
      }
    }
    const toggle = $("#videoVisibilityButton");
    toggle.hidden = !videoId;
    $("#youtube").hidden = !videoId || videoPanelHidden;
    toggle.textContent = videoPanelHidden
      ? "🎥 Videoyu göster"
      : "🎥 Videoyu gizle";
    await signals();
  } catch (x) {
    $("#connection").textContent = x.message;
    if (x.status === 409 && user) {
      toast("Oda kapatıldı veya odadan ayrıldınız.");
      await home();
    }
  } finally {
    polling = false;
  }
}
function seatVideo(box, media, muted) {
  if (!media?.getVideoTracks().some((t) => t.readyState === "live")) return;
  const v = document.createElement("video");
  v.className = "seatvideo";
  v.autoplay = true;
  v.playsInline = true;
  v.muted = muted;
  v.srcObject = media;
  box.prepend(v);
  v.play().catch(() => {});
}
function draw() {
  if (!user) return;
  $("#seats").replaceChildren(
    ...Array.from({ length: 9 }, (_, i) => {
      const p = people.find((x) => x.seat === i),
        b = document.createElement("button");
      b.className =
        "seat" + (p ? " occupied" : "") + (p?.id === user.id ? " mine" : "");
      if (p) b.dataset.speaker = p.id;
      b.innerHTML = '<span class="avatar"></span><span></span>';
      b.firstChild.textContent = p ? p.emoji : "+";
      if (p?.avatar && /^data:image\/(png|jpeg|webp);base64,/.test(p.avatar)) {
        const image = document.createElement("img");
        image.src = p.avatar;
        image.alt = p.name;
        image.style.cssText =
          "width:100%;height:100%;object-fit:cover;border-radius:50%";
        b.firstChild.replaceChildren(image);
      }
      b.lastChild.textContent = p ? p.name : i + 1 + ". koltuk · Otur";
      if (p)
        seatVideo(b, p.id === user.id ? stream : remoteStreams.get(p.id), true);
      b.onclick = safe(async () => {
        if (p?.id === user.id) {
          await api("seat", { seat: null });
          stop();
        } else if (!p) await api("seat", { seat: i });
        else toast(p.name + " bu koltukta.");
        refresh();
      });
      return b;
    }),
  );
  $("#people").replaceChildren(
    ...people.map((p) => {
      const e = document.createElement("span");
      e.className = "person";
      e.dataset.speaker = p.id;
      e.textContent = p.emoji + " " + p.name;
      return e;
    }),
  );
  const me = people.some((p) => p.id === user.id && p.seat !== null);
  $("#stand").disabled = !me;
  $("#mic").disabled = !me;
  $("#camera").disabled = !me;
}
$("#stand").onclick = safe(async () => {
  await api("seat", { seat: null });
  stop();
  refresh();
});
$("#messageForm").onsubmit = safe(async (e) => {
  e.preventDefault();
  const i = e.target.elements.text;
  if (i.value.trim()) {
    await api("message", { text: i.value });
    i.value = "";
    refresh();
  }
});
function stop() {
  window.TopTownFun?.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  peers.forEach((p) => p.close());
  peers.clear();
  remoteStreams.clear();
  $("#remoteVideos").replaceChildren();
  $("#localVideo").srcObject = null;
  $("#localVideo").hidden = true;
  $("#mediaInfo").hidden = true;
  draw();
}
async function sig(to, payload) {
  return api("signal", { to, payload });
}
function pc(id) {
  if (peers.has(id)) return peers.get(id);
  const p = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  p.pendingCandidates = [];
  p.makingOffer = false;
  stream?.getTracks().forEach((t) => p.addTrack(t, stream));
  p.onicecandidate = (e) =>
    e.candidate &&
    sig(id, { type: "candidate", candidate: e.candidate.toJSON() }).catch(
      () => {},
    );
  p.ontrack = (e) => {
    let incoming = remoteStreams.get(id);
    if (!incoming) {
      incoming = new MediaStream();
      remoteStreams.set(id, incoming);
    }
    if (!incoming.getTracks().some((t) => t.id === e.track.id))
      incoming.addTrack(e.track);
    let audio = $("#remoteVideos").querySelector('[data-user="' + id + '"]');
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.user = id;
      $("#remoteVideos").append(audio);
    }
    audio.srcObject = incoming;
    audio.play().catch(() => {});
    draw();
  };
  p.onnegotiationneeded = () => offer(id).catch(() => {});
  p.onconnectionstatechange = () => {
    if (p.connectionState === "failed" || p.connectionState === "closed") {
      remoteStreams.delete(id);
      draw();
    }
  };
  peers.set(id, p);
  return p;
}
async function offer(id) {
  const p = pc(id);
  if (p.makingOffer || p.signalingState !== "stable") return;
  p.makingOffer = true;
  try {
    const o = await p.createOffer();
    await p.setLocalDescription(o);
    await sig(id, { type: "offer", sdp: p.localDescription });
  } finally {
    p.makingOffer = false;
  }
}
async function call() {
  for (const u of people) if (u.id !== user.id) await offer(u.id);
}
async function signals() {
  for (const s of await api("signal")) {
    const p = pc(s.from),
      d = s.payload;
    if (d.type === "offer") {
      const collision = p.makingOffer || p.signalingState !== "stable",
        polite = String(user.id) > String(s.from);
      if (collision && !polite) continue;
      if (collision) await p.setLocalDescription({ type: "rollback" });
      await p.setRemoteDescription(d.sdp);
      for (const c of p.pendingCandidates.splice(0)) await p.addIceCandidate(c);
      const a = await p.createAnswer();
      await p.setLocalDescription(a);
      await sig(s.from, { type: "answer", sdp: p.localDescription });
    } else if (d.type === "answer") {
      await p.setRemoteDescription(d.sdp);
      for (const c of p.pendingCandidates.splice(0)) await p.addIceCandidate(c);
    } else if (d.type === "candidate") {
      if (p.remoteDescription) await p.addIceCandidate(d.candidate);
      else p.pendingCandidates.push(d.candidate);
    }
  }
}
async function media(video) {
  const hasVideo = !!stream?.getVideoTracks().length;
  if (stream && hasVideo === video) {
    stop();
    return;
  }
  stop();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: video
        ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        : false,
    });
    $("#mediaInfo").hidden = false;
    $("#mediaInfo").textContent = video
      ? "Kamera ve ses odadaki kullanıcılara aktarılıyor."
      : "Mikrofon açık: ses odadaki kullanıcılara aktarılıyor.";
    draw();
    await call();
    setTimeout(() => call().catch(() => {}), 1500);
    setTimeout(() => call().catch(() => {}), 5000);
  } catch (error) {
    stream = null;
    toast(
      error.name === "NotAllowedError"
        ? "Mikrofon izni verilmedi. Tarayıcıdaki izin simgesinden izin verin."
        : video
          ? "Kamera/mikrofon açılamadı."
          : "Mikrofon açılamadı.",
    );
  }
}
$("#mic").onclick = () => media(false);
$("#camera").onclick = () => media(true);
$("#videoButton").onclick = () => $("#youtubeDialog").showModal();
$("#youtubeForm").onsubmit = safe(async (e) => {
  e.preventDefault();
  await api("youtube", { url: new FormData(e.target).get("url") });
  $("#youtubeDialog").close();
  refresh();
});
$("#stopVideo").onclick = safe(async () => {
  await api("youtube", { url: "" });
  $("#youtubeDialog").close();
  refresh();
});
$("#videoVisibilityButton").onclick = () => {
  videoPanelHidden = !videoPanelHidden;
  refresh();
};
document.querySelectorAll("[data-emoji]").forEach((button) => {
  button.onclick = () => {
    $("#emoji").value = button.dataset.emoji;
    document.querySelectorAll("[data-emoji]").forEach((item) => {
      item.classList.toggle("selected", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
  };
});
$("#profileButton").onclick = () => {
  $("#emoji").value = user.emoji || "🙂";
  $("#profileDialog").showModal();
};
$("#profileForm").onsubmit = safe(async (e) => {
  e.preventDefault();
  user = (await api("profile", { emoji: $("#emoji").value })).user;
  show(room ? "room" : "home");
  $("#profileDialog").close();
  toast("Profil güncellendi.");
});
$("#giftButton").onclick = () => {
  const s = $("#recipient");
  s.replaceChildren(new Option("Kullanıcı seç", ""));
  people
    .filter((p) => p.id !== user.id)
    .forEach((p) => s.add(new Option(p.emoji + " " + p.name, p.id)));
  $("#giftDialog").showModal();
};
$("#gifts").onclick = safe(async (e) => {
  const b = e.target.closest("[data-gift]");
  if (b) {
    await api("gift", {
      recipient: $("#recipient").value,
      gift: b.dataset.gift,
    });
    $("#giftDialog").close();
    refresh();
  }
});
$("#adminButton").onclick = safe(async () => {
  const d = await api("admin");
  $("#adminStats").innerHTML =
    `<div><b>${d.summary.users}</b><small>Kullanıcı</small></div><div><b>${d.summary.rooms}</b><small>Oda</small></div><div><b>${d.summary.online}</b><small>Çevrimiçi</small></div>`;
  $("#adminUsers").replaceChildren(
    ...d.users.map((u) => {
      const x = document.createElement("div");
      x.className = "adminrow";
      x.textContent =
        (u.emoji || "🙂") +
        " " +
        u.name +
        (u.is_admin ? " · Yönetici" : "") +
        " · " +
        u.city +
        " · 🪙 " +
        u.coins;
      return x;
    }),
  );
  $("#adminDialog").showModal();
});
setInterval(() => room && refresh(), 3000);
(async () => {
  if (token)
    try {
      user = (await api("me")).user;
      home();
    } catch {
      show("auth");
    }
  else show("auth");
})();
