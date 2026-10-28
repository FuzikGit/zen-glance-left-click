
(() => {
  "use strict";

  const BUILD = "0.1.9";
  const PREFIX = "FuzikGit:GlanceLeftClick";
  const OPEN_MESSAGE = PREFIX + ":OpenGlance";
  const DEBUG_MESSAGE = PREFIX + ":Debug";

  if (window.__glanceLeftClickBuild === BUILD) return;

  const frameScript = String.raw`
  (() => {
    "use strict";

    const PREFIX = "FuzikGit:GlanceLeftClick";
    const OPEN_MESSAGE = PREFIX + ":OpenGlance";
    const DEBUG_MESSAGE = PREFIX + ":Debug";
    const attachedDocuments = new WeakSet();

    function report(stage, details = {}) {
      try {
        const href = content && content.location
          ? content.location.href
          : "unknown";

        sendAsyncMessage(DEBUG_MESSAGE, {
          stage,
          href,
          ...details
        });
      } catch (_) {}
    }

    function handleClick(event) {
      const link = event.composedPath().find(node =>
        node &&
        node.nodeType === 1 &&
        (node.localName === "a" || node.localName === "area") &&
        (node.href || node.getAttribute("href"))
      );

      if (!link) return;

      report("click-captured", {
        url: link.href || link.getAttribute("href"),
        trusted: event.isTrusted,
        button: event.button,
        alt: event.altKey
      });

      if (
        !event.isTrusted ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented ||
        link.hasAttribute("download")
      ) {
        return;
      }

      if (
        link.target &&
        link.target.toLowerCase() !== "_self"
      ) {
        return;
      }

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

      const rect = link.getBoundingClientRect();

      event.preventDefault();
      event.stopPropagation();

      report("open-request-sent", { url });

      sendAsyncMessage(OPEN_MESSAGE, {
        url,
        clientX: rect.left,
        clientY: rect.top,
        width: rect.width,
        height: rect.height
      });
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

      attachedDocuments.add(doc);
      doc.addEventListener("click", handleClick, true);

      report("listener-attached", {
        documentURL: doc.location.href
      });
    }

    // Kluczowa poprawka: podpinasz handler do dokumentu,
    // który właśnie się załadował, nie tylko do about:blank.
    addEventListener("DOMContentLoaded", event => {
      const doc = event.originalTarget;

      if (doc && doc.nodeType === 9) {
        attachDocument(doc);
      }
    }, true);

    // Obsłuż też dokument istniejący podczas instalacji skryptu.
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

  const attachedBrowsers = new WeakSet();

  function attachBrowser(browser) {
    if (!browser || attachedBrowsers.has(browser)) return;

    const mm = browser.messageManager;

    if (
      !mm ||
      typeof mm.loadFrameScript !== "function" ||
      typeof mm.addMessageListener !== "function"
    ) {
      console.error("[Glance Left Click] Frame-script API unavailable");
      return;
    }

    const listener = {
      receiveMessage(message) {
        const data = message.data || {};

        if (message.name === DEBUG_MESSAGE) {
          console.info("[Glance Left Click DEBUG]", data);
          return;
        }

        if (message.name !== OPEN_MESSAGE) return;

        console.info(
          "[Glance Left Click DEBUG] Open request received",
          data
        );

        try {
          const win = browser.ownerGlobal || window;
          const manager = win.gZenGlanceManager;
          const ownerTab = win.gBrowser.getTabForBrowser(browser);

          if (
            !manager ||
            typeof manager.openGlance !== "function"
          ) {
            console.error(
              "[Glance Left Click] gZenGlanceManager.openGlance unavailable"
            );
            return;
          }

          if (!ownerTab) {
            console.error("[Glance Left Click] Owner tab not found");
            return;
          }

          // Przekazujemy dane linku do natywnego Glance Zen.
          const result = manager.openGlance({
            url: data.url,
            clientX: data.clientX,
            clientY: data.clientY,
            width: data.width,
            height: data.height
          }, ownerTab);

          Promise.resolve(result).then(() => {
            console.info(
              "[Glance Left Click DEBUG] openGlance completed"
            );
          }).catch(error => {
            console.error(
              "[Glance Left Click] openGlance rejected:",
              error
            );
          });
        } catch (error) {
          console.error("[Glance Left Click] Open failed:", error);
        }
      }
    };

    try {
      mm.addMessageListener(OPEN_MESSAGE, listener);
      mm.addMessageListener(DEBUG_MESSAGE, listener);
      mm.loadFrameScript(scriptURL, true);
      attachedBrowsers.add(browser);

      console.info(
        "[Glance Left Click] Build " + BUILD + " attached"
      );
    } catch (error) {
      mm.removeMessageListener(OPEN_MESSAGE, listener);
      mm.removeMessageListener(DEBUG_MESSAGE, listener);

      console.error("[Glance Left Click] Attachment failed:", error);
    }
  }

  function attachAll() {
    for (const browser of gBrowser.browsers) {
      attachBrowser(browser);
    }
  }

  attachAll();

  gBrowser.tabContainer.addEventListener("TabOpen", event => {
    window.setTimeout(() => {
      attachBrowser(event.target.linkedBrowser);
    }, 0);
  });

  window.__glanceLeftClickBuild = BUILD;

  console.info("[Glance Left Click] Build " + BUILD + " loaded");
})();
