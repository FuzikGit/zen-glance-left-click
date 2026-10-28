(() => {
  "use strict";

  const BUILD = "0.1.6";
  const PREFIX = "FuzikGit:GlanceLeftClick";
  const OPEN_MESSAGE = `${PREFIX}:OpenGlance:Frame`;
  const DEBUG_MESSAGE = `${PREFIX}:Debug`;

  if (window.__glanceLeftClickBuild === BUILD) return;

  const frameScript = String.raw`
  (() => {
    "use strict";

    const PREFIX = "FuzikGit:GlanceLeftClick";
    const OPEN_MESSAGE = PREFIX + ":OpenGlance:Frame";
    const DEBUG_MESSAGE = PREFIX + ":Debug";

    function report(data) {
      try {
        sendAsyncMessage(DEBUG_MESSAGE, {
          ...data,
          page: location.href
        });
      } catch (_) {}
    }

    report({ stage: "frame-script-loaded" });

    addEventListener("click", event => {
      const path = event.composedPath();

      const link = path.find(node =>
        node &&
        node.nodeType === 1 &&
        (node.localName === "a" || node.localName === "area") &&
        (node.href || node.getAttribute("href"))
      );

      report({
        stage: "click-captured",
        trusted: event.isTrusted,
        button: event.button,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        prevented: event.defaultPrevented,
        link: link?.href || null
      });

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

      if (!link || link.hasAttribute("download")) return;

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
          location.href
        ).href;
      } catch (_) {
        report({ stage: "invalid-url" });
        return;
      }

      if (!/^https?:\/\//i.test(url)) return;

      const rect = link.getBoundingClientRect();
      const zoom =
        globalThis.docShell?.browsingContext?.fullZoom || 1;

      event.preventDefault();
      event.stopImmediatePropagation();

      report({ stage: "sending-open-request", url });

      sendAsyncMessage(OPEN_MESSAGE, {
        url,
        clientX: rect.left * zoom,
        clientY: rect.top * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom
      });
    }, true);
  })();
  `;

  const scriptURL =
    "data:application/javascript;charset=UTF-8," +
    encodeURIComponent(frameScript);

  const attached = new WeakSet();

  function attachBrowser(browser) {
    if (!browser || attached.has(browser)) return;

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

        console.info("[Glance Left Click DEBUG] Open request received", data);

        try {
          const win = browser.ownerGlobal || window;
          const manager = win.gZenGlanceManager;
          const principal = browser.contentPrincipal;

          if (!manager || typeof manager.openGlance !== "function") {
            console.error(
              "[Glance Left Click DEBUG] gZenGlanceManager.openGlance unavailable"
            );
            return;
          }

          if (!principal) {
            console.error(
              "[Glance Left Click DEBUG] No content principal"
            );
            return;
          }

          const result = manager.openGlance({
            url: data.url,
            triggeringPrincipal: principal,
            clientX: data.clientX,
            clientY: data.clientY,
            width: data.width,
            height: data.height
          });

          Promise.resolve(result).then(value => {
            console.info(
              "[Glance Left Click DEBUG] openGlance result:",
              value ? "returned a value" : "returned null"
            );
          }).catch(error => {
            console.error(
              "[Glance Left Click DEBUG] openGlance rejected:",
              error
            );
          });
        } catch (error) {
          console.error("[Glance Left Click DEBUG] Open failed:", error);
        }
      }
    };

    try {
      mm.addMessageListener(DEBUG_MESSAGE, listener);
      mm.addMessageListener(OPEN_MESSAGE, listener);
      mm.loadFrameScript(scriptURL, true);
      attached.add(browser);

      console.info("[Glance Left Click] Mod 0.1.6 attached");
    } catch (error) {
      mm.removeMessageListener(DEBUG_MESSAGE, listener);
      mm.removeMessageListener(OPEN_MESSAGE, listener);
      console.error("[Glance Left Click] Attachment failed:", error);
    }
  }

  function attachAll() {
    for (const browser of gBrowser.browsers) {
      attachBrowser(browser);
    }
  }

  gBrowser.addEventListener("load", attachAll, true);

  gBrowser.tabContainer.addEventListener("TabOpen", event => {
    const browser = event.target.linkedBrowser;
    window.setTimeout(() => attachBrowser(browser), 0);
  });

  attachAll();
  window.__glanceLeftClickBuild = BUILD;
})();
