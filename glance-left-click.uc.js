
(() => {
  "use strict";

  const BUILD = "0.1.11";
  const PREFIX = "FuzikGit:GlanceLeftClick";
  const DEBUG_MESSAGE = PREFIX + ":Debug";

  if (window.__glanceLeftClickBuild === BUILD) {
    console.info("[Glance Left Click] Build 0.1.11 already loaded.");
    return;
  }

  const frameScript = String.raw`
  (() => {
    "use strict";

    const DEBUG_MESSAGE = "FuzikGit:GlanceLeftClick:Debug";
    const attachedDocuments = new WeakSet();

    function report(stage, details = {}) {
      try {
        sendAsyncMessage(DEBUG_MESSAGE, {
          stage,
          href: content?.location?.href || "unknown",
          ...details
        });
      } catch (_) {}
    }

    function handleClick(event) {
      if (event.button !== 0) return;

      report("any-click", {
        trusted: event.isTrusted,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        defaultPrevented: event.defaultPrevented
      });

      // Zachowujemy natywne Alt+LPM oraz inne skróty.
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented
      ) {
        return;
      }

      if (!event.isTrusted) return;

      const link = event.composedPath().find(node =>
        node &&
        node.nodeType === 1 &&
        (node.localName === "a" || node.localName === "area") &&
        (node.href || node.getAttribute("href"))
      );

      if (!link || link.hasAttribute("download")) return;

      let url;

      try {
        url = new URL(
          link.getAttribute("data-url") ||
          link.href ||
          link.getAttribute("href"),
          link.ownerDocument.location.href
        ).href;
      } catch (error) {
        report("invalid-url", { error: String(error) });
        return;
      }

      if (!/^https?:\/\//i.test(url)) return;

      const doc = link.ownerDocument;
      const win = doc.defaultView;

      if (!win) return;

      report("click-captured", { url });

      // Blokujemy zwykłe otwarcie linku w bieżącej karcie.
      event.preventDefault();
      event.stopPropagation();

      // Tworzymy kliknięcie z Alt, które obsługuje
      // natywny aktor Glance w Zen Browser.
      const syntheticClick = new win.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: win,
        button: 0,
        altKey: true
      });

      // Zabezpieczenie przed zwykłą nawigacją,
      // jeśli natywny handler Glance nie przejmie zdarzenia.
      const preventFallbackNavigation = e => {
        e.preventDefault();
      };

      link.addEventListener(
        "click",
        preventFallbackNavigation,
        { capture: true, once: true }
      );

      try {
        link.dispatchEvent(syntheticClick);
        report("synthetic-alt-click-dispatched", {
          url,
          altKey: syntheticClick.altKey
        });
      } catch (error) {
        report("dispatch-error", { error: String(error) });
      } finally {
        link.removeEventListener(
          "click",
          preventFallbackNavigation,
          true
        );
      }
    }

    function attachDocument(doc) {
      if (
        !doc ||
        doc.nodeType !== 9 ||
        !doc.defaultView ||
        attachedDocuments.has(doc)
      ) {
        return;
      }

      let href;

      try {
        href = doc.location.href;
      } catch (_) {
        return;
      }

      // Czekamy na rzeczywistą stronę, pomijamy pustą kartę.
      if (!/^https?:\/\//i.test(href)) {
        return;
      }

      attachedDocuments.add(doc);
      doc.addEventListener("click", handleClick, true);

      report("listener-attached", {
        documentURL: href
      });
    }

    // Obsługa dokumentów ładowanych po utworzeniu ramki.
    addEventListener("DOMContentLoaded", event => {
      const doc = event.originalTarget;

      if (doc && doc.nodeType === 9) {
        attachDocument(doc);
      }
    }, true);

    // Obsługa strony, która była już otwarta przy instalacji.
    try {
      attachDocument(content.document);
    } catch (error) {
      report("initial-attach-error", {
        error: String(error)
      });
    }

    report("frame-script-loaded");
  })();
  `;

  const scriptURL =
    "data:application/javascript;charset=UTF-8," +
    encodeURIComponent(frameScript);

  // Używamy globalnego menedżera, aby skrypt obejmował
  // również dokumenty tworzone po nawigacji między witrynami.
  const mm = Services.mm;

  if (
    !mm ||
    typeof mm.loadFrameScript !== "function" ||
    typeof mm.addMessageListener !== "function"
  ) {
    console.error("[Glance Left Click] Global message manager unavailable.");
    return;
  }

  const debugListener = {
    receiveMessage(message) {
      if (message.name === DEBUG_MESSAGE) {
        console.info("[Glance Left Click DEBUG]", message.data);
      }
    }
  };

  if (window.__glanceLeftClickDebugListener) {
    mm.removeMessageListener(
      DEBUG_MESSAGE,
      window.__glanceLeftClickDebugListener
    );
  }

  window.__glanceLeftClickDebugListener = debugListener;
  mm.addMessageListener(DEBUG_MESSAGE, debugListener);

  try {
    mm.loadFrameScript(scriptURL, true);
  } catch (error) {
    mm.removeMessageListener(DEBUG_MESSAGE, debugListener);
    console.error("[Glance Left Click] Frame script failed:", error);
    return;
  }

  window.__glanceLeftClickBuild = BUILD;
  console.info("[Glance Left Click] Build 0.1.11 loaded.");
})();
