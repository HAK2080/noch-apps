(function () {
  "use strict";

  const seenOnPage = new Set();
  let settings = { keywords: "", areas: "", exclusions: "" };
  let scanTimer;
  const POST_LINK = /\/groups\/[^/]+\/(?:posts|permalink)\/[^/?#]+/i;

  function isGroupPage() {
    return /^\/groups\/[^/]+/.test(location.pathname);
  }

  function groupName() {
    const heading = document.querySelector('h1');
    return (heading?.innerText || document.title.split("|")[0] || "Facebook Group").trim();
  }

  function postLink(article) {
    for (const anchor of article.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") || "";
      if (!POST_LINK.test(href)) continue;
      try {
        const url = new URL(href, location.origin);
        return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
      } catch { /* Ignore malformed links. */ }
    }
    return "";
  }

  function textOf(article) {
    const message = article.querySelector('[data-ad-preview="message"]');
    return (message?.innerText || article.innerText || "").trim().slice(0, 4000);
  }

  function scan() {
    if (!isGroupPage()) return;
    const articles = document.querySelectorAll('[role="article"]');
    for (const article of articles) {
      if (article.parentElement?.closest('[role="article"]')) continue;
      const text = textOf(article);
      if (text.length < 25) continue;
      const url = postLink(article);
      const group = groupName();
      // Posts without a stable link can still be flagged locally, but the user
      // must open Facebook to locate them. The fingerprint avoids repeat alerts.
      const key = url || `${location.pathname}:${text.slice(0, 240)}`;
      if (seenOnPage.has(key)) continue;
      seenOnPage.add(key);

      const post = { url, text, groupName: group, groupUrl: location.href };
      const result = GroupListenerMatching.evaluate(post, settings);
      if (!result.matched) continue;
      chrome.runtime.sendMessage({
        type: "MATCH_FOUND",
        post: { ...post, keywords: result.keywords, areas: result.areas }
      }).catch(() => {});
    }
  }

  function queueScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 600);
  }

  chrome.storage.local.get("settings").then((value) => {
    settings = { ...settings, ...(value.settings || {}) };
    queueScan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = { ...settings, ...(changes.settings.newValue || {}) };
    seenOnPage.clear();
    queueScan();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCAN_NOW") {
      seenOnPage.clear();
      scan();
      sendResponse({ articleCount: document.querySelectorAll('[role="article"]').length });
    }
  });

  new MutationObserver(queueScan).observe(document.documentElement, {
    subtree: true,
    childList: true
  });
})();
