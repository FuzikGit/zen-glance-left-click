(() => {
  "use strict";

  const installedWindows = new WeakSet();

  function attachToBrowser(browser) {
    let win;

    try {
      win = browser.contentWindow;
      if (!win || installedWindows.has(win)) return;
      installedWindows.add(win);

      win.addEventListener("click", (event) => {
        // Alt+click pozostaje natywnym sposobem otwierania Glance.
        // BUILD: 2026-10-28-02
        if (
          event.button !== 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.defaultPrevented
        ) {
          return;
        }

        const path = event.composedPath();
        const link = path.find(
          node => node instanceof win.Element &&
            node.localName === "a" &&
            node.href
        );

        if (!link || link.hasAttribute("download")) return;

        const url = link.href;
        if (!/^https?:/i.test(url)) return;

        // Nie przechwytuj kliknięć w linki otwierane
        // jawnie w nowym kontekście.
        if (
          link.target &&
          link.target.toLowerCase() !== "_self"
        ) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        // Przekaż kliknięcie z modyfikatorem Alt.
        // Zen powinien obsłużyć je swoim natywnym Glance.
        link.dispatchEvent(
          new win.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: win,
            button: 0,
            altKey: true
          })
        );
      }, true);
    } catch (error) {
      console.warn("[Glance Left Click]", error);
    }
  }

  function attachAll() {
    for (const browser of gBrowser.browsers) {
      attachToBrowser(browser);
    }
  }

  gBrowser.addEventListener("load", attachAll, true);
  gBrowser.tabContainer.addEventListener("TabOpen", () => {
    attachAll();
  });

  attachAll();
})();
