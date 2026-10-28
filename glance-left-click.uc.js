
(() => {
  "use strict";

  const BUILD = "0.1.4";
  const MESSAGE = "FuzikGit:GlanceLeftClick:OpenGlance";
  const FRAME_MESSAGE = MESSAGE + ":Frame";

  if (window.__glanceLeftClickBuild === BUILD) {
    return;
  }

  const frameScript = String.raw`(() => {
    "use strict";

    const MESSAGE = "FuzikGit:GlanceLeftClick:OpenGlance:Frame";

    if (globalThis.__fuzikGlanceLeftClickFrame) {
      return;
    }
    globalThis.__fuzikGlanceLeftClickFrame = true;

    addEventListener("click", event => {
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

      const link = event.composedPath().find(node =>
        node &&
        node.nodeType === 1 &&
        (node.localName === "a" || node.localName === "area") &&
        (node.href || node.getAttribute("href"))
      );

      if (!link || link.hasAttribute("download")) {
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
      } catch (_) {
        return;
      }

      if (!/^https?:\/\//i.test(url)) {
        return;
      }

      const rect = link.getBoundingClientRect();
      const zoom =
        globalThis.docShell?.browsingContext?.fullZoom || 1;

      // Blokujemy zwykłą nawigację w bieżącej karcie.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      sendAsyncMessage(MESSAGE, {
        url,
        clientX: rect.left * zoom,
        clientY: rect.top * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom
      });
    }, true);
  })();`;

  const frameScriptURL =
    "data:application/javascript;charset=UTF-8," +
    encodeURIComponent(frameScript);

  const attachedBrowsers = new WeakSet();

  function attachBrowser(browser) {
    if (!browser || attachedBrowsers.has(browser)) {
      return;
    }

    const mm = browser.messageManager;

    if (
      !mm ||
      typeof mm.loadFrameScript !== "function" ||
      typeof mm.addMessageListener !== "function"
    ) {
      console.error(
        "[Glance Left Click] Frame-script API niedostępne."
      );
      return;
    }

    const listener = {
      receiveMessage(message) {
        try {
          const data = message.data;

          if (
            !data ||
            typeof data.url !== "string" ||
            !/^https?:\/\//i.test(data.url)
          ) {
            return;
          }

          const win = browser.ownerGlobal || window;
          const manager = win.gZenGlanceManager;

          if (
            !manager ||
            typeof manager.openGlance !== "function"
          ) {
            console.error(
              "[Glance Left Click] Nie znaleziono gZenGlanceManager."
            );
            return;
          }

          const principal = browser.contentPrincipal;

          if (!principal) {
            console.error(
              "[Glance Left Click] Nie znaleziono principal strony."
            );
            return;
          }

          const tab =
            win.gBrowser.getTabForBrowser(browser) ||
            win.gBrowser.selectedTab;

          const result = manager.openGlance(
            {
              url: data.url,
              triggeringPrincipal: principal,
              clientX: data.clientX,
              clientY: data.clientY,
              width: data.width,
              height: data.height
            },
            null,
            tab
          );

          Promise.resolve(result).catch(error => {
            console.error(
              "[Glance Left Click] Błąd otwierania podglądu:",
              error
            );
          });
        } catch (error) {
          console.error("[Glance Left Click]", error);
        }
      }
    };

    try {
      mm.addMessageListener(FRAME_MESSAGE, listener);
      mm.loadFrameScript(frameScriptURL, true);
      attachedBrowsers.add(browser);

      console.info(
        "[Glance Left Click] Mod 0.1.4 uruchomiony."
      );
    } catch (error) {
      mm.removeMessageListener(FRAME_MESSAGE, listener);
      console.error(
        "[Glance Left Click] Nie udało się załadować skryptu:",
        error
      );
    }
  }

  // Zainstaluj obsługę we wszystkich istniejących kartach.
  for (const browser of gBrowser.browsers) {
    attachBrowser(browser);
  }

  // Obsłuż także karty tworzone później.
  gBrowser.tabContainer.addEventListener("TabOpen", event => {
    const browser = event.target.linkedBrowser;

    window.setTimeout(() => {
      attachBrowser(browser);
    }, 0);
  });

  window.__glanceLeftClickBuild = BUILD;
})();
