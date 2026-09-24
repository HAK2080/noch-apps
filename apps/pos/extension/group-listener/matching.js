(function (root) {
  "use strict";

  function terms(value) {
    return String(value || "")
      .split(/[\n,]+/)
      .map((part) => part.trim().toLocaleLowerCase())
      .filter(Boolean);
  }

  function evaluate(post, settings) {
    const keywordList = terms(settings.keywords);
    const areaList = terms(settings.areas);
    const excludedList = terms(settings.exclusions);
    const body = String(post.text || "").toLocaleLowerCase();
    const place = `${post.groupName || ""} ${post.text || ""}`.toLocaleLowerCase();

    if (keywordList.length === 0) {
      return { matched: false, reason: "Add at least one keyword." };
    }
    if (excludedList.some((term) => body.includes(term))) {
      return { matched: false, reason: "Excluded phrase." };
    }

    const matchedKeywords = keywordList.filter((term) => body.includes(term));
    if (matchedKeywords.length === 0) {
      return { matched: false, reason: "No keyword match." };
    }

    const matchedAreas = areaList.filter((term) => place.includes(term));
    if (areaList.length > 0 && matchedAreas.length === 0) {
      return { matched: false, reason: "No area match." };
    }

    return { matched: true, keywords: matchedKeywords, areas: matchedAreas };
  }

  const api = { terms, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GroupListenerMatching = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
