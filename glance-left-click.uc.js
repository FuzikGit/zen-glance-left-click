
(() => {
  "use strict";

  const services =
    globalThis.Services ||
    ChromeUtils.importESModule(
      "resource://gre/modules/Services.sys.mjs"
    ).Services;

  // Handler działa w procesie zawartości strony.
  const frameScript = String.raw`
(() => {
  "use strict";

  const BUILD = "0.1.3";

  addEventListener("click", event => {
    // Przechwytujemy tylko rzeczywiste kliknięcia myszą.
    if (
      !event.isTrusted ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.defaultPrevented
    ) {
      return;
    }

    const anchor = event.composedPath().find(node =>
      node &&
      node.nodeType === 1 &&
      String(node.localName).toLowerCase() === "a" &&
      node.href
    );

    if (!anchor || anchor.hasAttribute("download")) return;
    if (!/^https?:/i.test(anchor.href)) return;

    const win = anchor.ownerDocument.defaultView;
    if (!win) return;

    // Blokujemy zwykłe przejście do linku.
    event.preventDefault();
    event.stopImmediatePropagation();

    // Zabezpieczenie przed nawigacją, gdyby Glance
    // nie przechwycił syntetycznego kliknięcia.
    const fallback = e => e.preventDefault();
    anchor.addEventListener("click", fallback, true);

    try {
      // Przekazujemy kliknięcie do natywnej obsługi Zen.
      anchor.dispatchEvent(
        new win.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: win,
          button: 0,
          altKey: true
        })
      );
    } catch (error) {
      console.error(
        "[Glance Left Click] Błąd otwierania Glance",
        error
      );
    } finally {
      anchor.removeEventListener("click", fallback, true);
    }
  }, true);
})();
`;

  const frameScriptURL =
    "data:application/javascript;charset=UTF-8," +
    encodeURIComponent(frameScript);

  if (
    !services.mm ||
    typeof services.mm.loadFrameScript !== "function"
  ) {
    console.error(
      "[Glance Left Click] Brak obsługi frame scripts"
    );
    return;
  }

  services.mm.loadFrameScript(frameScriptURL, true);

  console.info(
    "[Glance Left Click] Zainstalowano handler 0.1.3"
  );
})();
