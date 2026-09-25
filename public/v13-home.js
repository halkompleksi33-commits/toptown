// Feature scripts are loaded in order; styling is owned by design.css.
for (const src of [
  "/v13-controls.js",
  "/room-image.js",
  "/room-mini.js",
  "/admin-command.js",
  "/bottom-nav.js",
  "/version-v14.js",
  "/registration-selects.js",
  "/room-levels.js",
]) {
  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  document.head.append(script);
}
document.addEventListener("DOMContentLoaded", () => {
  const home = document.querySelector("#home .welcome");
  if (!home) return;
  const features = [
    ["💬", "Canlı sohbet", "Mesajlar ve giriş/çıkış kayıtları"],
    ["🪑", "9 koltuklu odalar", "Koltuğa otur, kalk ve katılımcıları gör"],
    ["🎙️", "Canlı ses", "Mikrofonla odadakilere ses aktar"],
    ["📹", "Kamera paylaşımı", "Görüntün koltuk alanında görünür"],
    ["🎁", "Hediye ve jeton", "Alıcı seçerek hediye gönder"],
    ["⭐", "Seviye sistemi", "Hediyelerle XP ve seviye kazan"],
    ["▶️", "YouTube birlikte izle", "Odaya video başlat"],
    ["👤", "Profil", "Emoji ve profil görseli seç"],
    ["🔎", "Oda keşfi", "Oda ara, oluştur ve anlık listele"],
    ["👥", "Sosyal özellikler", "Arkadaş, özel mesaj ve bildirim altyapısı"],
    ["🛡️", "Oda yönetimi", "Koltuk kilitleme, susturma ve atma"],
    ["🚩", "Güvenlik", "Raporlama ve yönetici incelemesi"],
    ["📊", "Admin dashboard", "Kullanıcı, oda ve çevrimiçi takibi"],
    ["🌗", "Tema seçimi", "Karanlık veya açık görünüm"],
    ["📱", "PWA desteği", "Telefonuna uygulama gibi ekle"],
    ["🗄️", "Kalıcı kayıtlar", "PostgreSQL ile kullanıcı ve oda verileri"],
  ];
  const box = document.createElement("section");
  box.className = "feature-flow";
  box.innerHTML =
    '<h2>TopTown’da neler var?</h2><p>Aşağıdan yukarı kayan yenilikler · üzerine gelince durur</p><div class="feature-window" tabindex="0"><div class="feature-track"></div></div>';
  const track = box.querySelector(".feature-track");
  for (const [icon, title, detail] of [...features, ...features]) {
    const row = document.createElement("div");
    row.className = "feature-item";
    row.innerHTML = "<i></i><span><b></b> · </span>";
    row.querySelector("i").textContent = icon;
    row.querySelector("b").textContent = title;
    row.querySelector("span").append(detail);
    track.append(row);
  }
  home.after(box);
});
