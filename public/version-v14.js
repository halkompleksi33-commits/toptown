// Single release label and welcome identity.
const applyRelease = () => {
  document.title = "TopTown v020 — Birlikte daha güzel";
  document
    .querySelectorAll(".brand small")
    .forEach((el) => (el.textContent = "v020"));
  document
    .querySelectorAll(".eyebrow")
    .forEach((el) => (el.textContent = el.textContent.replace(/v\d+/g, "v020")));
  document
    .querySelectorAll(".feature-flow h2")
    .forEach((el) => (el.textContent = "TopTown’da neler var?"));
  const welcome = document.querySelector("#home .welcome");
  if (welcome && !welcome.querySelector(".welcome-logo")) {
    const copy = document.createElement("div");
    copy.className = "welcome-copy";
    while (welcome.firstChild) copy.append(welcome.firstChild);
    const logo = document.createElement("img");
    logo.className = "welcome-logo";
    logo.src = "/toptown-logo.png";
    logo.alt = "";
    logo.width = 64;
    logo.height = 64;
    welcome.append(copy, logo);
  }
};
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", applyRelease);
else applyRelease();
