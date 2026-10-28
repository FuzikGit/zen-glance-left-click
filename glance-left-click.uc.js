
(() => {
  "use strict";

  const BUILD = "0.1.7";

  if (window.__glanceLeftClickBuild === BUILD) {
    return;
  }

  const attachedDocuments = new WeakSet();

  function attachDocument(doc) {
    if (
      !doc ||
      doc.nodeType !== 9 ||
      !doc.defaultView ||
      attachedDocuments.has(doc)
    ) {
      return;
    }

    const win = doc.defaultView;
    attachedDocuments.add(doc);

    win.addEventListener("click", event => {
      if (
        !event.isTrusted ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const link = event.composedPath().find(node =>
        node &&
        node.nodeType === 1 &&
        node.localName === "a" &&
        node.href
      );

      if (
        !link ||
        link.hasAttribute("download") ||
        !/^https?:/i.test(link.href)
      ) {
        return;
      }

      if (event.defaultPrevented) {
        console.info(
          "[Glance Left Click 0.1.7] Kliknięcie zostało wcześniej anulowane."
        );
        return;
      }

      try {
        // Próbujemy zmienić właściwość prawdziwego zdarzenia,
        // zanim dotrze ono do natywnego handlera Glance.
        const realEvent = Cu.waiveXrays(event);

        Object.defineProperty(realEvent, "altKey", {
          configurable: true,
          get: () => true
        });

        if (realEvent.altKey !== true) {
          throw new Error("Nie udało się ustawić altKey.");
        }

        console.info(
          "[Glance Left Click 0.1.7] Zmieniono altKey dla:",
          link.href
        );
      } catch (error) {
        console.error(
          "[Glance Left Click 0.1.7] Nie udało się zmienić altKey:",
          error
        );
      }
    }, true);

    console.info(
      "[Glance Left Click 0.1.7] Podpięto dokument:",
      doc.location.href
    );
  }

  function attachAll() {
    for (const browser of gBrowser.browsers) {
      try {
        attachDocument(browser.contentDocument);
      } catch (error) {
        console.error("[Glance Left Click 0.1.7]", error);
      }
    }
  }

  function onDocumentReady(event) {
    const target = event.originalTarget || event.target;
    const doc =
      target?.nodeType === 9 ? target : target?.ownerDocument;

    if (doc) {
      attachDocument(doc);
    }
  }

  gBrowser.addEventListener(
    "DOMContentLoaded",
    onDocumentReady,
    true
  );

  gBrowser.addEventListener("load", onDocumentReady, true);

  gBrowser.tabContainer.addEventListener("TabOpen", () => {
    window.setTimeout(attachAll, 0);
  });

  attachAll();

  window.__glanceLeftClickBuild = BUILD;

  console.info("[Glance Left Click] Mod 0.1.7 załadowany.");
})();
