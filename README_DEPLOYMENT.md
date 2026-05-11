# Noch Apps v4.0 — Production Deployment Guide

**Status**: ✅ READY FOR DEPLOYMENT TO apps.noch.cloud
**Date**: May 11, 2026
**Version**: 4.0.0

---

## 🎯 WHAT'S NEW

### 1. PIN Authentication for POS ✅
Staff can now login to POS with a 4-6 digit PIN instead of email/password. Perfect for quick access on touch devices.

**How it works**:
- Login screen shows email/PIN toggle buttons
- PIN mode accepts 4-6 digits (numeric only)
- Server validates PIN with SHA256 hash + rate limiting
- 10 failed attempts → 15-minute lockout (brute-force protection)
- Creates authenticated session automatically

**Files**:
- `apps/pos/src/pages/Login.jsx` — Updated PIN input mode
- `apps/pos/src/contexts/AuthContext.jsx` — signInWithPIN enhanced
- `supabase/functions/sign-in-with-pin/index.ts` — Edge function

### 2. Staff Profile Management Page ✅
New `/staff/my-profile` page where staff can:
- Edit full name, phone number
- Change password (6+ characters)
- Set/change PIN code (4-6 digits)
- Upload profile photo → stored in Supabase
- Full Arabic/English bilingual support

**Access**: Click "My Profile" in sidebar (Settings icon)

**Files**:
- `apps/pos/src/pages/staff/MyProfile.jsx` — New profile page
- `apps/pos/src/lib/supabase.js` — Added setPIN() function

### 3. Enhanced Sidebar Navigation ✅
"My Profile" link added to main sidebar for quick access.

**Files**:
- `apps/pos/src/App.jsx` — Route `/staff/my-profile`
- `apps/pos/src/components/Layout.jsx` — Navigation link

### 4. Xprinter ESC/POS Library 🆕
Complete ESC/POS command builder for Xprinter XP-58IIHV:
- Bluetooth & USB auto-detection
- Receipt formatting (bold, underline, alignment, size)
- Table layouts for itemized receipts
- Cash drawer pulse command (12V 1A)
- Print queue management with retry logic
- Full offline queue support

**Features**:
- Detects device OS & available connections
- Sample receipt template for testing
- Rate limiting for Bluetooth connection requests
- Graceful error handling & recovery

**Files**:
- `apps/pos/src/lib/printer.js` — 350+ lines of ESC/POS utilities
- `apps/pos/src/components/PrinterSettings.jsx` — Connection UI

### 5. Cash Drawer Control 🆕
Integrated into printer library:
```javascript
receipt.openCashDrawer() // Sends ESC p 0 25 250 command
```

**How it works**:
- Command sent via printer connection (Bluetooth or USB)
- Pulses 12V for 100ms to trigger solenoid
- No additional hardware needed (uses existing printer connection)
- Available on PrinterSettings page for testing

---

## 🚀 QUICK START

### For Users
1. **Login with PIN**:
   - Open POS app
   - Click "PIN" button on login screen
   - Enter 4-6 digit PIN
   - Press Login

2. **Access Profile**:
   - Click "My Profile" in sidebar
   - Edit name, phone, PIN
   - Upload avatar
   - Change password
   - All changes auto-save

3. **Setup Printer** (Android tablet only):
   - Go to POS Settings → Printer
   - Select Bluetooth or USB
   - Click "Connect"
   - Click "Test Print" to verify
   - Click "Open Cash Drawer" to test

### For Developers

#### Deploy to Production
```bash
# 1. Build the app
cd apps/pos
npm run build

# 2. Deploy Supabase functions
supabase functions deploy sign-in-with-pin

# 3. Verify migrations applied
supabase migration list  # Should show 20260507020000_...

# 4. Upload dist/ folder to apps.noch.cloud
scp -r dist/* user@apps.noch.cloud:/var/www/apps/pos/
```

#### Test Locally First
```bash
npm run dev
# Then visit http://localhost:5173/login
```

---

## 📊 TECHNICAL DETAILS

### Database Schema
```sql
-- Existing (created May 7, 2026)
profiles.pin_code (TEXT) — SHA256 hash
profiles.pin_salt (TEXT) — Per-user salt
profiles.pin_updated_at (TIMESTAMPTZ)
pin_attempts (TABLE) — Rate limiting audit

-- RPC Functions
verify_pos_pin(pin, branch_id) — Validates PIN + rate limiting
set_pos_pin(user_id, new_pin) — Updates PIN securely
```

### API Endpoints
**Edge Function**: `sign-in-with-pin`
```
POST /functions/v1/sign-in-with-pin
Headers: { "Content-Type": "application/json" }
Body: { "pin": "1234" }

Response (Success):
{ "user": {...}, "session": {...}, "message": "..." }

Response (Rate Limited):
{ "error": "...", "locked": true, "retry_in_seconds": 897 }
```

### File Structure
```
apps/pos/src/
├── pages/
│   ├── Login.jsx              (Updated)
│   └── staff/
│       └── MyProfile.jsx      (New)
├── contexts/
│   └── AuthContext.jsx        (Updated)
├── components/
│   ├── Layout.jsx             (Updated)
│   └── PrinterSettings.jsx    (New)
├── lib/
│   ├── supabase.js            (Updated)
│   └── printer.js             (New)
└── App.jsx                    (Updated)
```

---

## ✅ VERIFICATION CHECKLIST

Before deploying, verify:

- [ ] All 5 files listed above exist in codebase
- [ ] `npm run build` completes without errors
- [ ] `supabase migration list` shows `20260507020000_...`
- [ ] Supabase RPC functions `verify_pos_pin` and `set_pos_pin` exist
- [ ] `.env.production` has SUPABASE_URL and SUPABASE_ANON_KEY
- [ ] Test PIN login works locally (`npm run dev`)
- [ ] MyProfile page loads and avatar uploads work

**For Production**:
- [ ] Deploy edge function: `supabase functions deploy sign-in-with-pin`
- [ ] Run migrations: `supabase migration up`
- [ ] Upload build to server: `npm run build && scp dist/...`
- [ ] Clear browser cache (Ctrl+F5)
- [ ] Test login with staff PIN
- [ ] Test profile page load and updates

---

## 🆘 SUPPORT

### Common Issues

**"PIN must be 4 digits"** → Updated to 4-6 digits. Clear cache.

**Avatar upload fails** → Check Supabase storage 'avatars' bucket permissions

**MyProfile page 404** → Verify route added to App.jsx

**PIN login shows "Invalid PIN"** → Check database for correct pin_code hash format

**Printer not connecting** → Only works on Android (needs Bluetooth API). Uses fallback on desktop.

### Rollback Plan
If critical issue:
```bash
git revert <commit-hash>
npm run build
# Re-deploy previous version
```

---

## 📋 DOCUMENTATION REFERENCE

- **`IMPLEMENTATION_SUMMARY_MAY_11.md`** — Detailed feature breakdown
- **`DEPLOYMENT_CHECKLIST.md`** — Phase-by-phase deployment guide
- **`ENHANCEMENTS_MAY_2026.md`** — Original requirements & architecture

---

## 🎓 LEARNING RESOURCES

### For understanding PIN system:
- See: `supabase/migrations/20260507020000_pos_batch1_settings_pin_cash.sql`
- Learn: SHA256 hashing with per-user salt
- Study: Rate-limiting via `pin_attempts` table

### For printer integration:
- See: `apps/pos/src/lib/printer.js` (350+ lines documented)
- Reference: [ESC/POS Specification](https://www.escpos.net/)
- Device: Xprinter XP-58IIHV manual (58mm thermal, 90mm/s)

### For React components:
- Profile page: `apps/pos/src/pages/staff/MyProfile.jsx`
- Printer settings: `apps/pos/src/components/PrinterSettings.jsx`
- Login integration: `apps/pos/src/pages/Login.jsx`

---

## 🔐 SECURITY NOTES

- ✅ PINs stored as SHA256 hashes (never plaintext)
- ✅ Each user has unique salt (no rainbow table attacks)
- ✅ Rate limiting: 10 failures → 15-minute lockout
- ✅ Session tokens managed by Supabase Auth
- ✅ Avatar uploads to signed URLs (not public)
- ✅ RLS policies enforce data ownership

---

## 📱 DEVICE SUPPORT

| Feature | Desktop | Mobile | Android |
|---------|---------|--------|---------|
| Email/PIN login | ✅ | ✅ | ✅ |
| Staff Profile | ✅ | ✅ | ✅ |
| Avatar upload | ✅ | ✅ | ✅ |
| Printer connect | ❌ | ❌ | ✅ |
| Bluetooth detect | ❌ | ✅ | ✅ |

---

**Ready to deploy?** Follow `DEPLOYMENT_CHECKLIST.md`

**Questions?** Check `IMPLEMENTATION_SUMMARY_MAY_11.md`

**Deployed successfully!** Announce to staff: "New PIN login + profile features live!"
