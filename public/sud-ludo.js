(() => {
  const button = document.querySelector("#sudLudoButton"), dialog = document.querySelector("#sudLudoDialog"), root = document.querySelector("#sudLudoGame"), status = document.querySelector("#sudLudoStatus");
  let instance;
  const setStatus = (text) => (status.textContent = text);
  const failGame = (message) => { setStatus(message); root.replaceChildren(); };
  const getSdk = () => window.SudMGP?.SudMGP || window.SudMGP;
  const getWrapper = () => window.SudMGPWrapper || {};
  const closeGame = () => { try { instance?.decorator?.notifyAPPCommon?.("app_common_self_exit_game", "{}", {}); instance?.sdk && instance?.app && instance.sdk.destroyMG(instance.app); } catch {} instance = null; root.replaceChildren(); };
  dialog.addEventListener("close", closeGame);
  async function launch() {
    if (!room || !user) return toast("Ludo için önce bir odaya katılmalısın.");
    dialog.showModal(); setStatus("Ludo güvenli oturumu hazırlanıyor…"); root.replaceChildren();
    try {
      const [config, auth] = await Promise.all([api("sud/config"), api("sud/code", { roomId: room })]);
      if (!config.enabled) throw Error("SUD uygulama anahtarları Railway ortam değişkenlerinde eksik.");
      const sdk = getSdk(), { SudFSTAPPDecorator, SudFSMMGDecorator } = getWrapper();
      if (!sdk || !SudFSTAPPDecorator || !SudFSMMGDecorator) throw Error("Ludo SDK yüklenemedi. Sayfayı yenileyip tekrar dene.");
      const decorator = new SudFSTAPPDecorator(), listener = new SudFSMMGDecorator();
      listener.setSudFSMMGListener({
        onGameStarted() { setStatus("Ludo hazır. Oda arkadaşlarınla oyuna katılabilirsin."); },
        onGameDestroyed() { setStatus("Ludo oturumu kapatıldı."); },
        onGetGameViewInfo(handle, raw) { const ratio = JSON.parse(raw || "{}").ratio || 1; handle.success(JSON.stringify({ ret_code: 0, ret_msg: "success", view_size: { width: root.clientWidth * ratio, height: root.clientHeight * ratio }, view_game_rect: { left: 0, top: 0, right: 0, bottom: 0 } })); },
        onGameMGCommonGameBackLobby(handle) { handle.success(JSON.stringify({ ret_code: 0, ret_msg: "success" })); dialog.close(); },
      });
      sdk.initSDK(config.appId, config.appKey, location.hostname, false, {
        onSuccess() { try { const app = sdk.loadMG(String(user.id), String(room), auth.code, String(config.ludoId), "tr-TR", listener, root); decorator.setISudFSTAPP(app); instance = { sdk, app, decorator }; setStatus("Ludo yükleniyor…"); } catch (error) { failGame("Ludo başlatılamadı: " + (error.message || "bilinmeyen hata")); } },
        onFailure(code, message) { failGame("Ludo SDK başlatılamadı (" + code + "): " + message); },
      });
    } catch (error) { failGame(error.message || "Ludo başlatılamadı."); }
  }
  button?.addEventListener("click", launch);
})();
