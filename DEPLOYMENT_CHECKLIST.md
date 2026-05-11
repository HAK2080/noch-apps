# Deployment Checklist — Noch Apps v4.0 — May 11, 2026

## 🎯 COMPLETION STATUS

✅ **IMPLEMENTED** (3/5 requirements):
1. ✅ PIN Authentication (4-6 digits)
2. ✅ Staff Profile Management Page
3. ✅ Sidebar Navigation Enhancement

🚀 **IN PROGRESS** (2/5 requirements):
4. 🚀 Xprinter XP-58IIHV Integration (Library & Component Created)
5. 🔄 Cash Drawer Control (Ready via printer.js)

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Phase 1: Code Verification ✅

#### Backend (Supabase)
- [ ] **Migrations Applied**: Verify all migrations in `/supabase/migrations/` have run
  - [ ] `20260507020000_pos_batch1_settings_pin_cash.sql` (PIN system)
  - Run: `supabase migration up`
  
- [ ] **Database Schema**: Verify columns exist
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'profiles' 
  AND column_name IN ('pin_code', 'pin_salt', 'pin_updated_at');
  ```

- [ ] **RPC Functions**: Verify functions created
  ```sql
  SELECT routine_name FROM information_schema.routines 
  WHERE routine_name IN ('verify_pos_pin', 'set_pos_pin');
  ```

- [ ] **Tables**: Verify `pin_attempts` table exists
  ```sql
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pin_attempts');
  ```

#### Frontend (React App)
- [ ] **New Files Exist**:
  - [ ] `/apps/pos/src/pages/staff/MyProfile.jsx`
  - [ ] `/apps/pos/src/lib/printer.js`
  - [ ] `/apps/pos/src/components/PrinterSettings.jsx`

- [ ] **Modified Files Checked**:
  - [ ] `App.jsx` — Route `/staff/my-profile` added
  - [ ] `Layout.jsx` — "My Profile" link in nav
  - [ ] `Login.jsx` — PIN mode toggle (4-6 digits)
  - [ ] `AuthContext.jsx` — signInWithPIN enhanced
  - [ ] `supabase.js` — setPIN function added

### Phase 2: Build & Test Locally ✅

#### Build
```bash
cd apps/pos
npm run build
```

- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] Bundle size reasonable (check dist/)

#### Local Testing (Development)
```bash
npm run dev
```

- [ ] **Login Page**:
  - [ ] Email/password toggle works
  - [ ] PIN toggle works
  - [ ] PIN input limited to 6 characters, numeric-only
  - [ ] Forgotten password link works
  - [ ] Request access link works

- [ ] **PIN Login**:
  - [ ] Can login with valid 4-digit PIN (if test PIN exists)
  - [ ] Can login with valid 6-digit PIN
  - [ ] Invalid PIN shows error
  - [ ] Multiple failures trigger rate-limit message
  - [ ] Session persists after login

- [ ] **Staff Profile Page** (`/staff/my-profile`):
  - [ ] Page loads correctly
  - [ ] Avatar upload works → file saved to storage
  - [ ] Profile info updates → name, phone saved
  - [ ] PIN update works → uses set_pos_pin RPC
  - [ ] Password change works → 6+ char validation
  - [ ] Arabic/English toggle works (RTL)
  - [ ] Bilingual labels display correctly
  - [ ] All toast notifications appear

- [ ] **Navigation**:
  - [ ] "My Profile" link visible in sidebar
  - [ ] Clicking link navigates to `/staff/my-profile`
  - [ ] Link appears for both owner and staff roles
  - [ ] Mobile bottom nav includes link (if applicable)

- [ ] **Printer Settings** (if integrated into POS):
  - [ ] PrinterSettings component mounts
  - [ ] Device capabilities detected
  - [ ] Bluetooth button shows if available
  - [ ] USB button shows if available
  - [ ] Can connect to test printer (if available)
  - [ ] Test print button sends ESC/POS commands
  - [ ] Cash drawer button triggers proper command

### Phase 3: Environment Configuration 🔐

#### Production Environment Variables
- [ ] `.env.production` exists in `apps/pos/`
- [ ] Contains:
  ```
  VITE_SUPABASE_URL=https://xxxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyxxxx...
  ```
- [ ] Keys are for correct Supabase project (apps.noch.cloud)

#### Supabase Functions
- [ ] **Deploy Functions**:
  ```bash
  supabase functions deploy sign-in-with-pin
  ```
- [ ] Verify function exists in Supabase dashboard
- [ ] Check function logs for errors after test

#### CORS & Security
- [ ] Supabase CORS allows `*.apps.noch.cloud` or specific domain
- [ ] Storage buckets have correct permissions:
  - [ ] `avatars` — public read, authenticated write
  - [ ] `attachments` — public read, authenticated write
  - [ ] `sales` — public read, authenticated write

### Phase 4: Database Verification 🗄️

#### PIN System
```bash
# From psql or Supabase SQL editor:

-- Check profiles table columns
\d profiles;
-- Should have: pin_code (text), pin_salt (text), pin_updated_at (timestamptz)

-- Check pin_attempts table
\d pin_attempts;
-- Should have: id, identifier, branch_id, succeeded, attempted_at

-- Check RPC functions
\df verify_pos_pin;
\df set_pos_pin;
```

#### Sample Data
- [ ] Create test staff profile with PIN (if not exists)
  ```sql
  UPDATE profiles 
  SET pin_code = SHA256('1234noch_salt_2026'), 
      pin_salt = 'legacy_static'
  WHERE id = 'test-staff-id';
  ```
  *(Or use set_pos_pin function via UI)*

### Phase 5: Staging Deployment 🚀

#### Deploy to Staging (if applicable)
- [ ] Run build for production mode
- [ ] Deploy to staging environment (e.g., `staging-apps.noch.cloud`)
- [ ] Run same test suite as Phase 2
- [ ] Verify no browser errors (check console)
- [ ] Check Network tab for failed requests
- [ ] Monitor Supabase logs for errors

#### Smoke Tests on Staging
- [ ] Create a test staff account
- [ ] Set a test PIN via MyProfile page
- [ ] Logout and login with that PIN
- [ ] Upload an avatar
- [ ] Change password
- [ ] Verify profile page loads for all staff members

### Phase 6: Production Deployment 🌍

#### Pre-Production Announcement
- [ ] Notify staff: "New staff profile page + PIN login coming"
- [ ] Document the new features in staff handbook
- [ ] Create tutorial GIF/video (optional)

#### Deploy to Production
- [ ] Tag release in git: `git tag -a v4.0.1 -m "PIN auth + Staff profile"`
- [ ] Push to main branch
- [ ] Deploy to `apps.noch.cloud`:
  ```bash
  # Option 1: Manual deployment (if using manual upload)
  npm run build
  # Copy dist/ to production server

  # Option 2: CI/CD (if configured)
  git push origin main  # Triggers auto-deploy
  ```

#### Post-Deployment Verification
- [ ] Site loads at `apps.noch.cloud`
- [ ] No console errors (open DevTools)
- [ ] Login page shows email + PIN mode toggle
- [ ] PIN login works with test credentials
- [ ] MyProfile page accessible
- [ ] Sidebar shows "My Profile" link
- [ ] All staff can access their profile
- [ ] Avatar uploads work
- [ ] PIN changes persist

#### Supabase Function Status
- [ ] Edge function `sign-in-with-pin` deployed
- [ ] Function logs show no errors
- [ ] Rate limiting working (test with invalid PINs)

### Phase 7: Monitoring & Support 📊

#### Week 1
- [ ] Monitor Supabase logs for errors
- [ ] Monitor browser console errors (Sentry/LogRocket if available)
- [ ] Gather user feedback
- [ ] Fix any bugs reported

#### Common Issues & Fixes
| Issue | Solution |
|-------|----------|
| "Invalid PIN" on valid PIN | Check pin_code column for NULL values or legacy hashing |
| Avatar upload fails | Verify 'avatars' bucket exists + RLS permissions correct |
| MyProfile page 404 | Check route added to App.jsx + component imports |
| PIN authentication locked | Check pin_attempts table for lingering failed attempts |
| Printer not connecting | Verify Web Bluetooth/Serial API available on device |

---

## 📦 DEPLOYMENT PACKAGES

### Production Build Artifacts
```
apps/pos/dist/
├── index.html
├── assets/
│   ├── *.js       (app code)
│   ├── *.css      (styles)
│   └── *.svg      (icons)
└── manifest.json  (if PWA enabled)
```

### Supabase Functions
```
supabase/functions/
└── sign-in-with-pin/
    └── index.ts   (must be deployed)
```

---

## 🔄 NEXT STEPS (Post-Deployment)

### Immediate (Week 1)
1. Monitor for errors and user feedback
2. Fix any critical bugs
3. Gather staff feedback on new features

### Short-term (Week 2-3)
1. **Xprinter Integration**:
   - Test on Hoor X9A Android tablet
   - Implement printer detection in POS terminal
   - Add "Print Receipt" button to transaction completion
   - Test Bluetooth connectivity + ESC/POS commands

2. **Cash Drawer**:
   - Wire up cash drawer control button
   - Test on physical hardware
   - Add to shift end-of-day workflow

### Medium-term (Week 4+)
1. Optimize receipt templates
2. Add printer queue monitoring dashboard
3. Implement offline print queue (if needed)
4. Add print job history/audit logging

---

## 📞 SUPPORT & ROLLBACK

### If Critical Issue Found
1. **Immediate Rollback**:
   ```bash
   # Revert to previous production build (saved in git)
   git revert HEAD
   npm run build
   # Re-deploy previous version
   ```

2. **Contact Points**:
   - Supabase Support: `support@supabase.com`
   - Xprinter Support: Check device manual for Bluetooth pairing issues
   - Android Issues: Check Chrome DevTools remote debugging

### Troubleshooting Commands
```bash
# Check Supabase function logs
supabase functions list
supabase functions get sign-in-with-pin

# Test edge function locally
curl -i --location --request POST 'http://localhost:54321/functions/v1/sign-in-with-pin' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"pin":"1234"}'

# Check migrations
supabase migration list
supabase migration status
```

---

## ✨ SUCCESS CRITERIA

Deployment is successful when:
- ✅ All users can access PIN login
- ✅ MyProfile page fully functional
- ✅ Avatar uploads work (visible in sidebar)
- ✅ PIN changes persist after logout/login
- ✅ No errors in browser console
- ✅ No errors in Supabase logs
- ✅ Staff can change passwords
- ✅ Rate limiting triggers correctly on invalid PINs
- ✅ Sidebar navigation updated for all users

---

**Document Last Updated**: May 11, 2026
**Status**: READY FOR DEPLOYMENT
**Approved By**: [TO BE SIGNED OFF]
