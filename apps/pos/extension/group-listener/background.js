"use strict";

let matchQueue = Promise.resolve();
const APP_PAGE = /^(?:https:\/\/apps\.noch\.cloud|http:\/\/(?:localhost|127\.0\.0\.1):\d+)\/content-studio\/groups(?:[/?#]|$)/;

async function syncPending() {
  const value = await chrome.storage.local.get("matches");
  const matches = Array.isArray(value.matches) ? value.matches : [];
  const tabs = (await chrome.tabs.query({})).filter(tab => APP_PAGE.test(tab.url || ""));
  if (!tabs.length) {
    const error = "Open Content Studio → Groups in NOCH Apps to receive matches.";
    await chrome.storage.local.set({ syncStatus: error });
    return { count: 0, error };
  }
  let sent = 0;
  let failure = "";
  for (const match of matches) {
    if (match.synced) continue;
    try {
      const reply = await chrome.tabs.sendMessage(tabs[0].id, { type: "SYNC_MATCH", match });
      if (!reply?.ok) throw new Error(reply?.error || "The Groups inbox did not confirm this match.");
      match.synced = true;
      sent++;
    } catch (error) {
      failure = `Not sent yet: ${error.message || "Open the Groups inbox and retry."}`;
      break;
    }
  }
  await chrome.storage.local.set({ matches, syncStatus: failure || (sent ? `${sent} match${sent === 1 ? "" : "es"} sent to NOCH Apps.` : "All saved matches are in NOCH Apps.") });
  return { count: sent, error: failure };
}

function idFor(post) {
  const basis = post.url || `${post.groupUrl}:${post.text.slice(0, 240)}`;
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `post-${(hash >>> 0).toString(16)}`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SYNC_PENDING") {
    matchQueue = matchQueue.then(syncPending);
    matchQueue.then((result) => sendResponse({ ok: !result.error, ...result }), (error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type !== "MATCH_FOUND") return;
  const post = message.post;
  if (!post?.text || !post?.groupUrl) return;
  const id = idFor(post);

  matchQueue = matchQueue.then(async () => {
    const value = await chrome.storage.local.get("matches");
    const matches = Array.isArray(value.matches) ? value.matches : [];
    if (matches.some(item => item.id === id)) return syncPending();
    matches.unshift({ ...post, id, foundAt: new Date().toISOString() });
    await chrome.storage.local.set({ matches: matches.slice(0, 200) });
    await chrome.action.setBadgeText({ text: String(Math.min(matches.length, 99)) });
    await chrome.action.setBadgeBackgroundColor({ color: "#1264a3" });
    await chrome.notifications.create(id, {
      type: "basic", iconUrl: "icon.png", title: `Match in ${post.groupName}`,
      message: post.text.slice(0, 160)
    }).catch(() => {});
    await syncPending();
  }).catch(error => console.error("Could not save group match", error));
});

chrome.notifications.onClicked.addListener(async id => {
  const value = await chrome.storage.local.get("matches");
  const found = (value.matches || []).find(item => item.id === id);
  if (found) chrome.tabs.create({ url: found.url || found.groupUrl });
});
