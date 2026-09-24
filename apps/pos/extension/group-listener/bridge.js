"use strict";

{
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SYNC_MATCH" || !location.pathname.startsWith("/content-studio/groups")) return;
    const id = message.match?.id;
    if (!id) { sendResponse({ ok: false, error: "Match has no ID" }); return; }
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onAck);
      sendResponse({ ok: false, error: "NOCH Apps did not confirm the match" });
    }, 5000);
    function onAck(event) {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.source !== "NOCH_GROUP_LISTENER_APP" || event.data?.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onAck);
      sendResponse({ ok: Boolean(event.data.ok), error: event.data.error });
    }
    window.addEventListener("message", onAck);
    window.postMessage({ source: "NOCH_GROUP_LISTENER_EXTENSION", type: "MATCH", match: message.match }, location.origin);
    return true;
  });

  window.addEventListener("message", event => {
    if (event.source === window && event.origin === location.origin && event.data?.source === "NOCH_GROUP_LISTENER_APP" && event.data?.type === "READY") {
      chrome.runtime.sendMessage({ type: "SYNC_PENDING" }).catch(() => {});
    }
  });
}
