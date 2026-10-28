(() => {
  "use strict";

  const BUILD = "0.1.8";
  const PREFIX = "FuzikGit:GlanceLeftClick";
  const OPEN_MESSAGE = `${PREFIX}:OpenGlance`;
  const DEBUG_MESSAGE = `${PREFIX}:Debug`;

  if (window.__glanceLeftClickBuild === BUILD) {
    console.info(`[Glance Left Click] Build ${BUILD} is already loaded.`);
    return;
  }

  const frameScript = String.raw`
    (() => {
      "use strict";

      const PREFIX = "FuzikGit:GlanceLeftClick";
      const OPEN_MESSAGE = PREFIX + ":OpenGlance";
      const DEBUG_MESSAGE = PREFIX + ":Debug";

      function report(stage, details = {}) {
        try {
          sendAsyncMessage(DEBUG_MESSAGE, {
            stage,
            href: content?.location?.href || "unknown",
            ...details
          });
        } catch (_) {}
      }

      try {
        const pageWindow = content;
        const pageDocument = pageWindow.document;

        if (!pageDocument) {
          report("no-document");
          return;
        }

        function onPageClick(event) {
          const path = event.composedPath ? event.composedPath() : [];
          const link = path.find(node =>
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
            alt: event.altKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            meta: event.metaKey,
            defaultPrevented: event.defaultPrevented
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

          let url;
          try {
            url = new URL(
              link.getAttribute("data-url") ||
              link.href ||
              link.getAttribute("href"),
              pageDocument.location.href
            ).href;
          } catch (error) {
            report("invalid-url", { error: String(error) });
            return;
          }

          if (!/^https?:\/\//i.test(url)) return;

          const rect = link.getBoundingClientRect();
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          report("open-request-sent", { url });
          sendAsyncMessage(OPEN_MESSAGE, {
            url,
            clientX: rect.left,
            clientY: rect.top,
            width: rect.width,
            height: rect.height
          });
        }

        pageDocument.addEventListener("click", onPageClick, true);
        report("listener-attached");
      } catch (error) {
        report("frame-script-error", { error: String(error) });
      }
    })();
  `;

  const frameScriptURL =
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
      console.error("[Glance Left Click] Frame-script API unavailable.");
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

        console.info("[Glance Left Click DEBUG] Open request received", data);

        try {
          const win = browser.ownerGlobal || window;
          const manager = win.gZenGlanceManager;
          const ownerTab = win.gBrowser.getTabForBrowser(browser);
          const principal = browser.contentPrincipal;

          if (!manager || typeof manager.openGlance !== "function") {
            console.error("[Glance Left Click] gZenGlanceManager.openGlance unavailable.");
            return;
          }
          if (!ownerTab || !principal) {
            console.error("[Glance Left Click] Missing owner tab or content principal.");
            return;
          }

          const glanceData = {
            url: data.url,
            triggeringPrincipal: principal,
            clientX: data.clientX,
            clientY: data.clientY,
            width: data.width,
            height: data.height
          };

          Promise.resolve(manager.openGlance(glanceData, null, ownerTab)).then(result => {
            console.info(
              "[Glance Left Click DEBUG] openGlance finished:",
              result ? "opened/returned a tab" : "returned null"
            );
          }).catch(error => {
            console.error("[Glance Left Click] openGlance rejected:", error);
          });
        } catch (error) {
          console.error("[Glance Left Click] Opening Glance failed:", error);
        }
      }
    };

    try {
      mm.addMessageListener(OPEN_MESSAGE, listener);
      mm.addMessageListener(DEBUG_MESSAGE, listener);
      mm.loadFrameScript(frameScriptURL, true);
      attachedBrowsers.add(browser);
      console.info("[Glance Left Click] Build " + BUILD + " attached to browser.");
    } catch (error) {
      mm.removeMessageListener(OPEN_MESSAGE, listener);
      mm.removeMessageListener(DEBUG_MESSAGE, listener);
      console.error("[Glance Left Click] Could not attach frame script:", error);
    }
  }

  function attachAll() {
    for (const browser of gBrowser.browsers) attachBrowser(browser);
  }

  attachAll();
  gBrowser.tabContainer.addEventListener("TabOpen", event => {
    window.setTimeout(() => attachBrowser(event.target.linkedBrowser), 0);
  });

  window.__glanceLeftClickBuild = BUILD;
  console.info("[Glance Left Click] Build " + BUILD + " loaded.");
})();
