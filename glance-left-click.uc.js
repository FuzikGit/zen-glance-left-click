(() => {
  "use strict";

  const BUILD = "0.3.0";
  const PREFIX = "FuzikGit:GlanceLeftClick";
  const DEBUG_MESSAGE = `${PREFIX}:Debug`;
  const SPLIT_MESSAGE = `${PREFIX}:AddToSplit`;

  if (window.__glanceLeftClickBuild === BUILD) {
    console.info(`[Glance Left Click] Build ${BUILD} already loaded.`);
    return;
  }

  const frameScript = String.raw`
  (() => {
    "use strict";

    const PREFIX = "FuzikGit:GlanceLeftClick";
    const DEBUG_MESSAGE = PREFIX + ":Debug";
    const SPLIT_MESSAGE = PREFIX + ":AddToSplit";
    const PREF_LEFT_CLICK_GLANCE = "glance-left-click.open_glance_on_left_click";
    const PREF_HOVER_MENU = "glance-left-click.show_hover_menu";
    const attachedDocuments = new WeakSet();

    const prefs = (() => {
      try {
        if (globalThis.Services?.prefs) return globalThis.Services.prefs;
      } catch (_) {}
      try {
        return ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services.prefs;
      } catch (_) {}
      try {
        return ChromeUtils.import("resource://gre/modules/Services.jsm").Services.prefs;
      } catch (_) {}
      return null;
    })();

    function prefBool(name, fallback = true) {
      try {
        return prefs ? prefs.getBoolPref(name, fallback) : fallback;
      } catch (_) {
        return fallback;
      }
    }

    function report(stage, details = {}) {
      try {
        sendAsyncMessage(DEBUG_MESSAGE, {
          stage,
          href: content?.location?.href || "unknown",
          ...details
        });
      } catch (_) {}
    }

    function getLinkFromEvent(event) {
      const path = typeof event.composedPath === "function"
        ? event.composedPath()
        : [];
      return path.find(node =>
        node &&
        node.nodeType === 1 &&
        (node.localName === "a" || node.localName === "area") &&
        (node.href || node.getAttribute("href"))
      ) || null;
    }

    function getSafeURL(link) {
      if (!link || link.hasAttribute("download")) return null;
      try {
        const raw = link.getAttribute("data-url") || link.href || link.getAttribute("href");
        const url = new URL(raw, link.ownerDocument.location.href);
        return /^https?:$/.test(url.protocol) ? url.href : null;
      } catch (_) {
        return null;
      }
    }

    function dispatchGlanceClick(link) {
      if (!link || !link.isConnected) return false;
      const win = link.ownerDocument.defaultView;
      if (!win) return false;

      try {
        // Zen's native Glance handler listens for Alt+left-click.
        // This synthetic click is the same mechanism used by the working mod.
        link.dispatchEvent(new win.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: win,
          button: 0,
          altKey: true
        }));
        report("glance-click-dispatched", { url: link.href || link.getAttribute("href") });
        return true;
      } catch (error) {
        report("glance-click-error", { error: String(error) });
        return false;
      }
    }

    async function copyURL(url, doc, win) {
      try {
        if (win.navigator.clipboard?.writeText) {
          await win.navigator.clipboard.writeText(url);
          return true;
        }
      } catch (_) {
        // Try the legacy clipboard fallback below.
      }

      let field;
      try {
        field = doc.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.setAttribute("aria-hidden", "true");
        field.style.cssText = "position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;";
        (doc.documentElement || doc.body).appendChild(field);
        field.select();
        field.setSelectionRange(0, field.value.length);
        return !!doc.execCommand("copy");
      } catch (_) {
        return false;
      } finally {
        field?.remove();
      }
    }

    function attachDocument(doc) {
      if (!doc || doc.nodeType !== 9 || !doc.defaultView || attachedDocuments.has(doc)) {
        return;
      }

      let href;
      try {
        href = doc.location.href;
      } catch (_) {
        return;
      }
      if (!/^https?:\/\//i.test(href)) return;

      attachedDocuments.add(doc);
      const win = doc.defaultView;
      let popupHost = null;
      let shadow = null;
      let urlLabel = null;
      let statusLabel = null;
      let activeLink = null;
      let showTimer = null;
      let hideTimer = null;

      const hoverPrefObserver = {
        observe(_subject, topic, changedPref) {
          if (topic === "nsPref:changed" && changedPref === PREF_HOVER_MENU && !prefBool(PREF_HOVER_MENU, true)) {
            hidePopup();
          }
        }
      };

      try {
        prefs?.addObserver(PREF_HOVER_MENU, hoverPrefObserver);
        win.addEventListener("unload", () => {
          try { prefs?.removeObserver(PREF_HOVER_MENU, hoverPrefObserver); } catch (_) {}
        }, { once: true });
      } catch (_) {}

      function clearShowTimer() {
        if (showTimer !== null) win.clearTimeout(showTimer);
        showTimer = null;
      }
      function clearHideTimer() {
        if (hideTimer !== null) win.clearTimeout(hideTimer);
        hideTimer = null;
      }

      function isPopupPath(event) {
        return !!popupHost && event.composedPath().includes(popupHost);
      }

      function isPopupNode(node) {
        if (!popupHost || !node) return false;
        if (node === popupHost || popupHost.contains(node)) return true;
        try {
          return !!shadow && shadow.contains(node);
        } catch (_) {
          return false;
        }
      }

      function ensurePopup() {
        if (popupHost && popupHost.isConnected) return;

        popupHost = doc.createElement("div");
        popupHost.setAttribute("data-glance-left-click-ui", "true");
        popupHost.style.cssText = "position:fixed!important;left:0;top:0;display:none;width:min(370px,calc(100vw - 16px));max-width:calc(100vw - 16px);z-index:2147483647!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;pointer-events:auto!important;";
        shadow = popupHost.attachShadow({ mode: "open" });
        const style = doc.createElement("style");
        style.textContent = [
          ':host { all: initial; color-scheme: dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
          '* { box-sizing: border-box; }',
          '.panel { width:100%; padding:10px; border:1px solid rgba(255,255,255,.18); border-radius:13px; color:#f8fafc; background:rgba(25,27,32,.97); box-shadow:0 10px 34px rgba(0,0,0,.38), 0 2px 8px rgba(0,0,0,.2); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); font-size:13px; line-height:1.35; }',
          '.heading { display:flex; align-items:center; gap:8px; margin:0 0 9px; min-width:0; }',
          '.mark { display:flex; align-items:center; justify-content:center; flex:0 0 28px; height:28px; border-radius:8px; background:#334b91; font-size:16px; }',
          '.meta { min-width:0; flex:1; }',
          '.title { display:block; color:#fff; font-weight:650; font-size:12px; margin-bottom:2px; }',
          '.url { display:block; color:#b9c0cc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; }',
          '.actions { display:flex; flex-wrap:wrap; gap:6px; }',
          'button { appearance:none; border:1px solid rgba(255,255,255,.15); border-radius:8px; padding:7px 9px; margin:0; font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif; color:#f4f6fb; background:rgba(255,255,255,.08); cursor:pointer; white-space:nowrap; }',
          'button:hover { background:rgba(255,255,255,.16); }',
          'button:focus-visible { outline:2px solid #91b4ff; outline-offset:2px; }',
          'button.primary { flex:1 1 100%; padding:9px 10px; border-color:#5c7cfa; color:#fff; background:#4263eb; }',
          'button.primary:hover { background:#5473f4; }',
          '.status { min-height:14px; margin:7px 2px 0; color:#aebbd0; font-size:11px; }'
        ].join("\n");
        shadow.appendChild(style);

        const panel = doc.createElement("section");
        panel.className = "panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Akcje linku");

        const heading = doc.createElement("div");
        heading.className = "heading";
        const mark = doc.createElement("div");
        mark.className = "mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "↗";
        const meta = doc.createElement("div");
        meta.className = "meta";
        const title = doc.createElement("span");
        title.className = "title";
        title.textContent = "Szybkie akcje linku";
        urlLabel = doc.createElement("span");
        urlLabel.className = "url";
        urlLabel.id = "url";
        meta.append(title, urlLabel);
        heading.append(mark, meta);

        const actions = doc.createElement("div");
        actions.className = "actions";
        const makeButton = (action, text, className = "") => {
          const button = doc.createElement("button");
          button.type = "button";
          button.dataset.action = action;
          if (className) button.className = className;
          button.textContent = text;
          return button;
        };
        actions.append(
          makeButton("glance", "↗  Otwórz w Glance", "primary"),
          makeButton("copy", "⧉  Kopiuj link"),
          makeButton("split", "◫  Add to Split")
        );

        statusLabel = doc.createElement("div");
        statusLabel.className = "status";
        statusLabel.id = "status";
        statusLabel.setAttribute("aria-live", "polite");
        panel.append(heading, actions, statusLabel);
        shadow.appendChild(panel);

        shadow.querySelectorAll("button[data-action]").forEach(button => {
          button.addEventListener("click", async event => {
            event.preventDefault();
            event.stopPropagation();
            const link = activeLink;
            const url = getSafeURL(link);
            if (!link || !url) return;

            const action = button.dataset.action;
            if (action === "glance") {
              dispatchGlanceClick(link);
              hidePopup();
              return;
            }

            if (action === "copy") {
              statusLabel.textContent = "Kopiuję link…";
              const ok = await copyURL(url, doc, win);
              statusLabel.textContent = ok ? "Link skopiowany ✓" : "Nie udało się skopiować linku";
              report("copy-url", { ok, url });
              return;
            }

            if (action === "split") {
              try {
                const sourceBrowsingContextId = content.browsingContext?.top?.id;
                sendAsyncMessage(SPLIT_MESSAGE, { url, sourceBrowsingContextId });
                statusLabel.textContent = "Wysłano do Split View…";
                report("split-request-sent", { url, sourceBrowsingContextId });
              } catch (error) {
                statusLabel.textContent = "Nie udało się uruchomić Split View";
                report("split-request-error", { error: String(error) });
              }
            }
          });
        });

        popupHost.addEventListener("pointerenter", clearHideTimer);
        popupHost.addEventListener("pointerleave", scheduleHide);
        popupHost.addEventListener("mouseover", clearHideTimer);
        popupHost.addEventListener("mouseout", event => {
          if (!isPopupNode(event.relatedTarget)) scheduleHide();
        });
        popupHost.addEventListener("click", event => {
          // Keep the injected UI's clicks from bubbling into page handlers.
          event.stopPropagation();
        });
        (doc.documentElement || doc.body).appendChild(popupHost);
      }

      function positionPopup(link) {
        if (!popupHost || !link?.isConnected) return;
        const rect = link.getBoundingClientRect();
        popupHost.style.display = "block";
        const popupRect = popupHost.getBoundingClientRect();
        const width = popupRect.width || Math.min(370, win.innerWidth - 16);
        const height = popupRect.height || 120;
        const left = Math.max(8, Math.min(rect.left, win.innerWidth - width - 8));
        let top = rect.bottom + 8;
        if (top + height > win.innerHeight - 8) top = rect.top - height - 8;
        top = Math.max(8, Math.min(top, win.innerHeight - height - 8));
        popupHost.style.left = left + "px";
        popupHost.style.top = top + "px";
      }

      function showPopup(link) {
        if (!link?.isConnected || !getSafeURL(link)) return;
        ensurePopup();
        activeLink = link;
        if (urlLabel) urlLabel.textContent = getSafeURL(link);
        if (statusLabel) statusLabel.textContent = "";
        positionPopup(link);
        report("hover-popup-shown", { url: getSafeURL(link) });
      }

      function hidePopup() {
        clearShowTimer();
        clearHideTimer();
        if (popupHost) popupHost.style.display = "none";
        activeLink = null;
      }

      function scheduleHide() {
        clearHideTimer();
        hideTimer = win.setTimeout(() => {
          hideTimer = null;
          hidePopup();
        }, 280);
      }

      function onMouseOver(event) {
        if (!prefBool(PREF_HOVER_MENU, true)) {
          clearShowTimer();
          if (popupHost && popupHost.style.display !== "none") hidePopup();
          return;
        }

        if (isPopupPath(event)) {
          clearHideTimer();
          return;
        }

        const link = getLinkFromEvent(event);
        if (!link || !getSafeURL(link)) {
          if (activeLink && !isPopupNode(event.relatedTarget)) scheduleHide();
          return;
        }

        if (link === activeLink) {
          clearHideTimer();
          return;
        }

        clearShowTimer();
        clearHideTimer();
        if (popupHost) popupHost.style.display = "none";
        activeLink = link;
        showTimer = win.setTimeout(() => {
          showTimer = null;
          showPopup(link);
        }, 380);
      }

      function onMouseOut(event) {
        if (!prefBool(PREF_HOVER_MENU, true)) {
          if (popupHost && popupHost.style.display !== "none") hidePopup();
          return;
        }

        if (isPopupPath(event)) {
          if (!isPopupNode(event.relatedTarget)) scheduleHide();
          return;
        }

        const link = getLinkFromEvent(event);
        if (!link || link !== activeLink) return;

        const next = event.relatedTarget;
        if (next && (link === next || link.contains(next) || isPopupNode(next))) {
          clearHideTimer();
          return;
        }
        clearShowTimer();
        scheduleHide();
      }

      function onScrollOrResize() {
        if (popupHost && popupHost.style.display !== "none" && activeLink?.isConnected) {
          positionPopup(activeLink);
        } else if (activeLink && !activeLink.isConnected) {
          hidePopup();
        }
      }

      function handleClick(event) {
        if (isPopupPath(event)) return;

        // Setting 1: let the website handle ordinary LPM when disabled.
        if (!prefBool(PREF_LEFT_CLICK_GLANCE, true)) return;

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

        const link = getLinkFromEvent(event);
        const url = getSafeURL(link);
        if (!link || !url) return;

        // Preserve the mod's existing behaviour: ordinary left-click opens Glance.
        event.preventDefault();
        event.stopPropagation();
        dispatchGlanceClick(link);
      }

      doc.addEventListener("mouseover", onMouseOver, true);
      doc.addEventListener("mouseout", onMouseOut, true);
      doc.addEventListener("click", handleClick, true);
      win.addEventListener("scroll", onScrollOrResize, true);
      win.addEventListener("resize", onScrollOrResize, true);
      doc.addEventListener("keydown", event => {
        if (event.key === "Escape" && popupHost?.style.display !== "none") hidePopup();
      }, true);

      report("listener-attached", { documentURL: href });
    }

    addEventListener("DOMContentLoaded", event => {
      const doc = event.originalTarget;
      if (doc && doc.nodeType === 9) attachDocument(doc);
    }, true);

    try {
      attachDocument(content.document);
    } catch (error) {
      report("initial-attach-error", { error: String(error) });
    }

    report("frame-script-loaded");
  })();
  `;

  const scriptURL =
    "data:application/javascript;charset=UTF-8," + encodeURIComponent(frameScript);
  const mm = Services.mm;

  if (!mm || typeof mm.loadFrameScript !== "function" || typeof mm.addMessageListener !== "function") {
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

  const splitListener = {
    receiveMessage(message) {
      if (message.name !== SPLIT_MESSAGE) return;
      const data = message.data || {};
      const contextId = Number(data.sourceBrowsingContextId);
      if (!data.url || !/^https?:\/\//i.test(data.url) || !Number.isFinite(contextId)) return;

      try {
        const browser = [...gBrowser.browsers].find(item => item.browsingContext?.id === contextId);
        if (!browser) {
          console.warn("[Glance Left Click] Split View: source browser not found.", contextId);
          return;
        }

        const sourceTab = gBrowser.getTabForBrowser(browser);
        const principal = browser.contentPrincipal;
        const splitter = typeof gZenViewSplitter !== "undefined" ? gZenViewSplitter : window.gZenViewSplitter;
        if (!sourceTab || !principal || !splitter || typeof splitter.openAndSwitchToTab !== "function" || typeof splitter.splitTabs !== "function") {
          console.warn("[Glance Left Click] Split View API unavailable.");
          return;
        }

        const currentTab = typeof gZenGlanceManager !== "undefined" && gZenGlanceManager.getTabOrGlanceParent
          ? gZenGlanceManager.getTabOrGlanceParent(sourceTab)
          : sourceTab;
        const newTab = splitter.openAndSwitchToTab(data.url, {
          skipRoute: true,
          inBackground: false,
          triggeringPrincipal: principal
        });
        if (!newTab) {
          console.warn("[Glance Left Click] Split View could not create the new tab.");
          return;
        }
        splitter.splitTabs([currentTab, newTab], undefined, 1);
        console.info("[Glance Left Click] Added link to Split View:", data.url);
      } catch (error) {
        console.error("[Glance Left Click] Split View failed:", error);
      }
    }
  };

  if (window.__glanceLeftClickDebugListener) {
    mm.removeMessageListener(DEBUG_MESSAGE, window.__glanceLeftClickDebugListener);
  }
  if (window.__glanceLeftClickSplitListener) {
    mm.removeMessageListener(SPLIT_MESSAGE, window.__glanceLeftClickSplitListener);
  }
  window.__glanceLeftClickDebugListener = debugListener;
  window.__glanceLeftClickSplitListener = splitListener;
  mm.addMessageListener(DEBUG_MESSAGE, debugListener);
  mm.addMessageListener(SPLIT_MESSAGE, splitListener);

  try {
    mm.loadFrameScript(scriptURL, true);
  } catch (error) {
    mm.removeMessageListener(DEBUG_MESSAGE, debugListener);
    mm.removeMessageListener(SPLIT_MESSAGE, splitListener);
    console.error("[Glance Left Click] Could not load frame script:", error);
    return;
  }

  window.__glanceLeftClickBuild = BUILD;
  console.info(`[Glance Left Click] Build ${BUILD} loaded.`);
})();
