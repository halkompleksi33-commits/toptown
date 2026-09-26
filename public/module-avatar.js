document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#profileForm");
  if (!form) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif";
  input.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "🖼️ Fotoğraf seç";
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type))
      return toast("PNG, JPEG, WebP veya GIF seçin.");
    if (file.size > (file.type === "image/gif" ? 1 : 10) * 1024 * 1024)
      return toast(
        file.type === "image/gif"
          ? "Animasyonlu GIF 1 MB’den küçük olmalı."
          : "Görsel 10 MB’den küçük olmalı.",
      );
    button.disabled = true;
    button.textContent =
      file.type === "image/gif" ? "GIF yükleniyor…" : "Fotoğraf hazırlanıyor…";
    try {
      if (file.type === "image/gif") {
        const reader = new FileReader();
        const avatar = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await api("profile", {
          emoji: document.querySelector("#emoji").value,
          avatar,
        });
        user = result.user;
        toast("Animasyonlu profil GIF’in güncellendi.");
        return;
      }
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d");
      const side = Math.min(bitmap.width, bitmap.height);
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      bitmap.close();
      const avatar = canvas.toDataURL("image/jpeg", 0.82);
      const result = await api("profile", {
        emoji: document.querySelector("#emoji").value,
        avatar,
      });
      user = result.user;
      toast("Profil fotoğrafın güncellendi.");
    } catch {
      toast("Görsel yüklenemedi. Başka bir dosya deneyin.");
    } finally {
      button.disabled = false;
      button.textContent = "🖼️ Fotoğraf seç";
    }
  };
  form.append(input, button);
});
