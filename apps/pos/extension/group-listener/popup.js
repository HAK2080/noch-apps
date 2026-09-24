"use strict";

const byId = (id) => document.getElementById(id);
const fields = ["keywords", "areas", "exclusions"];

function setFeedback(message) {
  byId("feedback").textContent = message;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateStatus() {
  const tab = await currentTab();
  const onGroup = /^https:\/\/(?:www|web)\.facebook\.com\/groups\/[^/]+/.test(tab?.url || "");
  const status = byId("status");
  status.classList.toggle("inactive", !onGroup);
  status.textContent = onGroup
    ? "Watching posts Facebook loads in this group tab. Open more group tabs to watch them too."
    : "Open a Facebook Group in this browser to start checking posts.";
  byId("scan").disabled = !onGroup;
}

function renderMatches(matches) {
  byId("count").textContent = String(matches.length);
  const target = byId("matches");
  target.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No matches yet. Add filters, then visit a Facebook Group to check posts as they load.";
    target.append(empty);
    return;
  }

  for (const match of matches.slice(0, 30)) {
    const card = document.createElement("a");
    card.className = "match";
    card.href = match.url || match.groupUrl;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    const top = document.createElement("div");
    top.className = "match-top";
    const group = document.createElement("strong");
    group.textContent = match.groupName || "Facebook Group";
    const date = document.createElement("time");
    date.dateTime = match.foundAt;
    date.textContent = new Date(match.foundAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    top.append(group, date);
    const excerpt = document.createElement("p");
    excerpt.textContent = match.text;
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const word of [...(match.keywords || []), ...(match.areas || [])]) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = word;
      chips.append(chip);
    }
    if (match.synced) {
      const chip = document.createElement("span");
      chip.className = "chip synced";
      chip.textContent = "In NOCH Apps";
      chips.append(chip);
    }
    card.append(top, excerpt, chips);
    target.append(card);
  }
}

async function load() {
  const value = await chrome.storage.local.get(["settings", "matches", "syncStatus"]);
  for (const field of fields) byId(field).value = value.settings?.[field] || "";
  byId("sync-status").textContent = value.syncStatus || "";
  renderMatches(value.matches || []);
  updateStatus();
}

byId("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = Object.fromEntries(fields.map((field) => [field, byId(field).value.trim()]));
  if (!settings.keywords) {
    setFeedback("Add at least one keyword first.");
    return;
  }
  await chrome.storage.local.set({ settings });
  setFeedback("Filters saved. Open a group tab to check posts.");
});

byId("sync").addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "SYNC_PENDING" });
  byId("sync-status").textContent = result?.ok ? `Checked pending matches; sent ${result.count}.` : (result?.error || "Could not sync right now.");
});

byId("scan").addEventListener("click", async () => {
  const tab = await currentTab();
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_NOW" });
    setFeedback(`Checked ${result.articleCount} visible post${result.articleCount === 1 ? "" : "s"}.`);
  } catch {
    setFeedback("Reload the group page, then try again.");
  }
});

byId("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ matches: [] });
  await chrome.action.setBadgeText({ text: "" });
  renderMatches([]);
  setFeedback("Matches cleared.");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.matches) renderMatches(changes.matches.newValue || []);
  if (area === "local" && changes.syncStatus) byId("sync-status").textContent = changes.syncStatus.newValue || "";
});

load();
