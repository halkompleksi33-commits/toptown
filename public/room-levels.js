// A gift transfers coins and awards room XP in the same server transaction.
(() => {
  const box = document.querySelector("#gifts");
  if (!box) return;
  let busy = false;
  box.onclick = async (event) => {
    const button = event.target.closest("[data-gift]");
    if (!button || busy) return;
    const recipient = document.querySelector("#recipient").value;
    if (!recipient) return toast("Önce alıcı seçin.");
    busy = true;
    box.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const result = await api("gift", {
        recipient,
        gift: button.dataset.gift,
      });
      document.querySelector("#giftDialog").close();
      document.querySelector("#coins").textContent = "🪙 " + result.coins;
      toast("Hediye gönderildi ✨ Oda +" + result.gain + " XP");
      await refresh();
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
      box.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  };
})();
