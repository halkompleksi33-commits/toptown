(() => {
  const tools = document.querySelector(".tools");
  if (!tools) return;
  const button = document.createElement("button");
  button.id = "roomImageButton";
  button.textContent = "🖼️ Oda kapağı";
  button.hidden = true;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.hidden = true;
  tools.append(button, input);
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      return toast("Görsel en fazla 10 MB olabilir.");
    button.disabled = true;
    try {
      const state = await api("state?after=0");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const scale = Math.max(640 / bitmap.width, 360 / bitmap.height);
      canvas
        .getContext("2d")
        .drawImage(
          bitmap,
          (640 - bitmap.width * scale) / 2,
          (360 - bitmap.height * scale) / 2,
          bitmap.width * scale,
          bitmap.height * scale,
        );
      bitmap.close();
      let image = canvas.toDataURL("image/jpeg", 0.75);
      if (image.length > 190000) image = canvas.toDataURL("image/jpeg", 0.45);
      await api("room/image", { room: state.room.id, image });
      toast("Oda kapağın güncellendi.");
    } catch (error) {
      toast(error.message || "Görsel yüklenemedi.");
    } finally {
      button.disabled = false;
      input.value = "";
    }
  };
})();
