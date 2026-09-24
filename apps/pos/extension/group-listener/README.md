# Facebook Group Listener pilot

This browser extension checks posts already loaded in Facebook Groups you visit. It matches configured keywords, optional area names, and exclusions. It queues matches locally and sends them to **NOCH Apps → Content Studio → Groups** while that page is open in the same browser.

1. In Chrome or Edge, enable Developer mode on the Extensions page and choose **Load unpacked** for this folder.
2. Open the NOCH Apps Groups page and select your business in Content Studio.
3. In the extension popup, save at least one keyword and any optional areas or exclusions.
4. Visit a Facebook Group you have joined. Open the Groups page to receive saved matches; use **Retry pending** in the popup if needed.
5. Review the post, save useful matches to Inspiration, and write or approve a reply. The app only copies approved text; you post it yourself.

Area filtering checks the post text and group name. The extension does not receive reliable geographical tags. It does not refresh Facebook pages, collect from closed tabs, or guarantee complete coverage. Facebook may change its page structure, so detection should be checked against a live group page. This is a one-browser pilot: the Groups inbox and reply notes are stored locally in that browser; promoting a match to Inspiration saves it to the selected NOCH business.

Run `node --test *.test.js` in this folder to verify matching and handoff logic.
