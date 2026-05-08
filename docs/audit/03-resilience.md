# Pass 3 — Resilience and offline

Severity: **🔴 critical**, **🟠 high**, **🟡 medium**, **🟢 minor**.

## A. Network drop scenarios

### A1. 🔴 Mid-order network drop is silently swallowed
[`POSTerminal.handlePaymentComplete:279`](src/modules/pos/pages/POSTerminal.jsx:279) gates on `isOnline()` (the `navigator.onLine` flag) at the moment of charge. `navigator.onLine` is **notoriously unreliable** — it reports the radio link, not whether the Supabase host is reachable. In Tripoli, "the wifi shows connected but DNS times out" is the common case. The sale will go to the online path, hit a 30 s fetch timeout, throw, and surface as `toast.error('Failed to complete sale')` — with no offline fallback.

The user retries → if the first call did make it through, **C1 in Pass 2** kicks in: duplicate sale.

### A2. 🟠 Mid-payment drop: customer paid, terminal lost the order
Web Serial print is async. If `createPOSOrder` succeeds but the response packet is dropped, terminal throws, customer's card was charged on Verifone, and the order isn't on the ReceiptModal. There is no "search recent orders" UI in the POS. Operator has no way to look up by phone, customer name, or pickup-code; only EOD report.

### A3. 🟠 Mid-print drop
Print failures only show a toast; the order is already persisted. The user can hit Print again — `escpos.printReceipt` is idempotent at the byte level (always sends a fresh buffer), but if the printer kept the partial first job in its buffer the customer will get two stapled receipts of mixed content.

### A4. 🟢 The `online` event handler in [`pos-sync.js:31`](src/modules/pos/lib/pos-sync.js:31) is fine for the simple case but doesn't handle "online again, then offline again mid-sync" — partial drain leaves orders queued and no retry timer.

## B. Local persistence

| Store | Where | Written when | Cleared when | Survives reload? |
|---|---|---|---|---|
| `noch-pos.products` (IDB) | `pos-offline.js` | After successful product fetch ([`POSTerminal.jsx:129`](src/modules/pos/pages/POSTerminal.jsx:129)) | Each cache write deletes existing for that branch | ✓ |
| `noch-pos.categories` (IDB) | same | same | same | ✓ |
| `noch-pos.offline_orders` (IDB) | same | When `isOnline()` is false at charge | After successful sync ([`pos-sync.js:21`](src/modules/pos/lib/pos-sync.js:21)) | ✓ |
| `noch-pos.branch_config` (IDB) | exported, **never called** | — | — | dead code |
| `localStorage.noch_printer_connected` | `escpos.js:41` | On `connectPrinter` success | On `disconnectPrinter` | flag survives, port does not — see C1 |
| `localStorage` (auth) | Supabase SDK default | Sign-in | Sign-out / token expiry | ✓ |
| Cache Storage `noch-shell-v1` | `sw.js` | SW install | Activation prunes other versions | ✓ |

🟠 **B1.** Cart state is **not persisted** anywhere. A page refresh in the middle of a 12-item order loses the entire cart. Browsers can refresh from memory pressure on cheap Android tills.

🟠 **B2.** `cacheProducts` is only triggered when products are loaded online ([`POSTerminal.jsx:121-130`](src/modules/pos/pages/POSTerminal.jsx:121)). If a product price is changed mid-shift in `POSProducts.jsx`, the terminal's IDB still has the old price until reload. A barista on a cached terminal will charge the old price.

🟡 **B3.** Offline order rows in IDB carry `synced: isOnline()` but no `client_id` or `client_timestamp`. After sync the server timestamp wins; you cannot distinguish "ordered at 14:00, synced at 18:00" in the EOD report.

## C. Reconciliation after reconnect

🔴 **C1.** Sync re-enters `createPOSOrder`, which generates a **new server-side `order_number`** ([`pos-supabase.js:319`](src/modules/pos/lib/pos-supabase.js:319)). The receipt printed during the offline sale shows `OFFLINE-N`. The DB row gets `NHA-20260506-0042`. There is no link between the two. A customer returning with their `OFFLINE-12` receipt cannot be looked up.

🔴 **C2.** **No idempotency** on sync. `pos-sync.syncOfflineOrders` iterates the queue; if `createPOSOrder` succeeds but `clearOfflineOrder` fails (or page reloads mid-loop), the next sync run re-creates the same order. There is no client-generated UUID for dedupe.

🔴 **C3.** Two devices cannot share an offline queue. If terminal A and terminal B both ring up at the same branch while offline, on reconnect they both flush — server stamps both with branch-day `count+1` order numbers in arrival order, with no awareness of when the sale actually happened. Cash drawer and receipts don't tally.

🟠 **C4.** Stock decrement during offline sync is computed against **current** stock, not the stock-at-time-of-sale. If you sold a matcha tin offline and someone else sold the same tin online before you reconnect, sync decrements past zero with no error.

🟠 **C5.** Online orders ([`POSTerminal.fetchOnlineOrders`](src/modules/pos/pages/POSTerminal.jsx:165)) poll every 30 s with no exponential backoff. While offline, this just no-ops — fine. But there's no real-time channel (Supabase realtime), so a 0–30 s lag is structural.

## D. Auth and session

🟠 **D1.** Supabase session storage (`localStorage` by default) is shared across all browser tabs of the same origin. Two terminals open in tabs share auth state. Only one user can be logged in to the app per device.

🟠 **D2.** Token refresh is handled by supabase-js automatically, but if the device sleeps for >2 h and wakes mid-shift, the first call after wake may fail with a 401 before the SDK refreshes. There is no global retry/refresh wrapper around POS calls.

🟠 **D3.** PIN gate ([`POSPinLogin`](src/modules/pos/pages/POSPinLogin.jsx)) is never re-verified. Once the terminal is loaded, no idle timeout, no re-prompt for high-value actions like void or end-of-day. A tablet left at the counter is wide open.

🟢 **D4.** Sign-out doesn't close the open shift, doesn't release the printer, doesn't drain the offline queue. Best to call out as documented behaviour.

## E. Service worker / PWA

`public/sw.js`:

🟢 **E1.** SW only caches the app shell (`/`, `/index.html`, `/favicon.svg`, `/manifest.webmanifest`). No JS/CSS bundle pre-cache. **First reload after deploy works** because Vite's hashed bundles are network-fetched. Acceptable choice for a frequently-deployed app — but it means **the POS does not actually work offline after a reload**. The app shell loads from cache; the JS bundle hits the network and fails.

🔴 **E2.** Network-first navigation handler with no offline fallback for assets is a partial PWA. The "Will sync when online" message shown to the cashier is misleading — if they reload the page while still offline, the app won't even open.

🟠 **E3.** "Bad SW deploy bricks all counters" risk: SW cache name is hardcoded `'noch-shell-v1'`. A bug that caches a broken `/index.html` would persist until version is bumped. There is no `?clear-sw` debug route. Recovery on a counter device with no devtools = uninstall the PWA.

🟢 **E4.** No `update found` notification — users can run a stale build for as long as the SW serves the cached shell.

## F. Print / drawer failure modes

[`escpos.js`](src/modules/pos/lib/escpos.js):

🔴 **F1.** `_writer.write` has no timeout. If the printer's USB cable is yanked, the promise hangs forever. The `Print` button stays disabled with `Printing...` and the user can't dismiss the receipt modal until the page is reloaded.

🔴 **F2.** No "paper out" detection. ESC/POS supports a status query (`GS r n` / `DLE EOT n`) but `escpos.js` never reads from the port. A cashier can hit Print, see "Receipt printed", and have nothing emerge from the printer.

🟠 **F3.** Cash drawer kick command (`ESC p 0 25 250`) is sent without verifying the printer is online. If the kick fails the user gets `Failed to open drawer`, but there is no retry, and the order has already completed. Cash sale with no drawer pop = real-world fraud vector.

🟠 **F4.** Web Serial port is held by a single tab. If the user opens a second tab to check Settings, that tab's `isPrinterConnected()` returns `false`. Confusing UX, but more importantly: the **first tab dies** (closed, crashed) → port is locked to a dead process, and recovery requires unplug/replug or browser restart. No watchdog.

🟠 **F5.** Port permission is per-origin in Chrome. A site update that triggers a re-grant prompt at the browser level will silently revoke. There's no test in app to detect this (`navigator.serial.getPorts()` returns previously authorised ports — never called).

🟡 **F6.** USB unplugged mid-print: `_writer.write` rejects, error toast shown, but `_port` and `_writer` remain non-null in module state. `isPrinterConnected()` returns `true` but next print fails. No auto-disconnect on error.

🟢 **F7.** `printTestPage` and `printReceipt` both have `INIT` first — fine, but no `BUFFER_CLEAR` (`ESC @` is used as INIT which does clear). Verified.

## G. Top resilience risks

1. **F1 + F2** — silent print failures = customer leaves without receipt and operator believes it printed. Fix size **S** (timeout wrapper + status query before print).
2. **C1 + C2 + C3** — offline → online sync corrupts the ledger. Fix size **L** (introduce client UUIDs, server-side dedupe, preserve client-time and original offline order_number).
3. **A1** — `navigator.onLine` is not a sufficient gate. Fix size **S** (treat any timeout/network-error from Supabase calls as offline; fall back to queue).
4. **E2** — PWA reload while offline = bricked counter. Fix size **M** (precache the JS bundle + CSS, accept the bandwidth cost).
5. **D3** — no re-auth / idle timeout on the terminal = anyone at the counter has barista privileges.
6. **B1** — cart not persisted = refresh loses sales-in-progress.
7. **F4** — printer port owned by single tab with no watchdog.
