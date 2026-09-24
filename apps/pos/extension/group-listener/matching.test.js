const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, terms } = require("./matching.js");

test("splits comma and newline terms", () => {
  assert.deepEqual(terms("roof repair, plumber\nwater leak"), ["roof repair", "plumber", "water leak"]);
});

test("matches keyword and area in post or group name", () => {
  const settings = { keywords: "plumber, roof repair", areas: "Kadıköy, Üsküdar", exclusions: "hiring" };
  assert.deepEqual(evaluate({ text: "Need a plumber today", groupName: "Kadıköy Neighbors" }, settings), {
    matched: true, keywords: ["plumber"], areas: ["kadıköy"]
  });
  assert.equal(evaluate({ text: "Need a plumber in Ankara", groupName: "Local advice" }, settings).matched, false);
  assert.equal(evaluate({ text: "Hiring a plumber in Kadıköy", groupName: "Local advice" }, settings).matched, false);
});

test("refuses to match before a keyword is configured", () => {
  assert.equal(evaluate({ text: "Need help", groupName: "Istanbul" }, { keywords: "" }).matched, false);
});
