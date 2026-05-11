# Noch Apps Enhancement Plan — May 2026

## Critical Issues to Address

### 1. **PIN Authentication for POS (Staff Login)**
**Status**: Not Yet Implemented
**Current**: Email + password login only
**Required**: 4-digit PIN for quick staff access to POS

#### Changes:
- Add `pin_code` field to `profiles` table (CHAR(4), unique)
- Update `Login.jsx` to detect POS mode → show PIN input instead
- Create PIN validation logic in `AuthContext`
- Update `updateProfile()` in `supabase.js` to hash PINs

**Files to Modify**:
- `src/pages/Login.jsx` — Add PIN input branch
- `src/contexts/AuthContext.jsx` — Add PIN auth method
- `src/lib/supabase.js` — Add PIN validation function
- Supabase: Add migration for `profiles.pin_code` field

---

### 2. **Staff Profile Management Page**
**Status**: Missing
**Required**: Employees need ability to:
- View & edit their profile (name, email, phone)
- Change password
- Change PIN code
- Upload profile photo

#### New File:
- `src/pages/staff/MyProfile.jsx` — Self-service profile editor

#### Changes:
- Add `/staff/my-profile` route to `App.jsx`
- Add to staff sidebar navigation in `Layout.jsx`
- Link from user avatar in sidebar footer

---

### 3. **Staff Navigation Sidebar**
**Status**: Exists but limited
**Current**: Staff sidebar shows 9 items (dashboard, POS, tasks, inventory, products, recipes, vestaboard, loyalty)
**Missing**: 
- Quick access to Profile
- No logout option (currently must go to mobile menu)
- No visual user info in sidebar

#### Changes:
- Add "My Profile" link to staff sidebar
- Show staff member's name/avatar at bottom of sidebar
- Ensure logout button accessible from main sidebar

---

### 4. **Xprinter Integration (XP-58IIHV)**
**Status**: Not Yet Implemented
**Device**: 58mm thermal printer, Bluetooth/USB, ESC/POS
**Speed**: 90mm/s
**Paper Width**: 58mm
**Cash Drawer**: 12V 1A

#### New File:
- `src/lib/printer.js` — ESC/POS command builder
- `src/components/PrinterSettings.jsx` — Bluetooth/USB config
- `src/modules/pos/PrinterQueue.jsx` — Queue management

#### Changes:
- Add Bluetooth & USB permission detection for Android
- Build ESC/POS receipt formatter
- Queue prints until printer ready
- Test on Hoor X9A tablet

---

### 5. **Cash Drawer Control**
**Status**: Not Yet Implemented
**Connection**: Via Xprinter ESC/POS (DLE 0x14 command)

#### In `printer.js`:
```javascript
export function getCashDrawerCommand() {
  return new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]) // ESC p 0 25 250
}
```

---

## File Structure Summary

### Priorities:
1. **PIN Auth** — Unblock kiosk-mode POS logins (TODAY)
2. **Staff Profile** — Let staff change PIN/password/photo (TODAY)
3. **Navigation** — Ensure sidebar accessible on mobile & desktop (TODAY)
4. **Printer Integration** — Queue ESC/POS commands, test Bluetooth (NEXT)
5. **Cash Drawer** — Trigger via printer commands (NEXT)

---

## Deployment Targets
- **Backend**: apps.noch.cloud (`/var/www/apps` on 72.60.203.107)
- **Testing Device**: Hoor X9A Android tablet (Bluetooth & USB capable)
- **Printer**: Xprinter XP-58IIHV (58mm, ESC/POS compliant)

---

## Next Steps
1. Create PIN auth system
2. Build staff profile page
3. Integrate printer via Bluetooth/USB
4. Test on-tablet printing
5. Deploy to apps.noch.cloud
