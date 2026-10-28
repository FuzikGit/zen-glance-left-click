
(() => {
  "use strict";

  const installedDocuments = new WeakSet();

  function attachToBrowser(browser) {
    try {
      const win = browser.contentWindow;
      const doc = win?.document;

      if (!doc || installedDocuments.has(doc)) return;
      installedDocuments.add(doc);

      doc.addEventListener("click", (event) => {
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

        const anchor = event.composedPath().find(
          node => node?.nodeType === 1 &&
            node.localName === "a" &&
            node.href
        );

        if (!anchor || anchor.hasAttribute("download")) return;

        if (
          anchor.target &&
          anchor.target.toLowerCase() !== "_self"
        ) {
          return;
        }

        if (!/^https?:/i.test(anchor.href)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

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
