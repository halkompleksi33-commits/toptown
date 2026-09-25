document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#profileForm");
  if (!form) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "🖼️ Fotoğraf seç";
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      return toast("Görsel 10 MB’den küçük olmalı.");
    button.disabled = true;
    button.textContent = "Fotoğraf hazırlanıyor…";
    try {
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
      toast("Fotoğraf yüklenemedi. Başka bir görsel deneyin.");
    } finally {
      button.disabled = false;
      button.textContent = "🖼️ Fotoğraf seç";
    }
  };
  form.append(input, button);
});
