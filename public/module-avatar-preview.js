document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector("#profileForm input[type=file]");
  if (!input) return;
  const preview = document.createElement("img");
  preview.alt = "Profil görseli önizleme";
  preview.className = "avatar-preview";
  let url = "";
  input.before(preview);
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    preview.src = url;
  });
});
