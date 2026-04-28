# WhatsApp Business Templates — Submission List

Submit these in Twilio Console → **Messaging → Content Templates** while the sender review is pending. Each takes 1–3 days for Meta approval.

For each, choose:
- **Category:** Utility (transactional) for everything below, except `loyalty_marketing` which is Marketing.
- **Language:** Arabic (`ar`) — for Libyan customers. Add an English variant later if needed.
- **Header:** Text only (no media headers — they review slower and add cost).

Variables use `{{1}}`, `{{2}}`, etc. Meta requires example values for each.

---

## 1. `staff_invite`

**Purpose:** Inviting a new staff member to install the app.

**Body:**
```
مرحباً {{1}}! تم إنشاء حسابك في تطبيق نوتش. سجّل دخولك من الرابط التالي ثم غيّر كلمة المرور: {{2}}
```

**Variables:**
- `{{1}}` — staff full name (e.g. "أحمد")
- `{{2}}` — login URL (e.g. "https://apps.noch.cloud")

---

## 2. `loyalty_stamp_earned`

**Purpose:** Confirms a loyalty stamp after a visit.

**Body:**
```
🎉 طابع جديد مضاف لبطاقتك! لديك الآن {{1}} من 10 طوابع. زيارة قادمة وتحصل على مشروب مجاني. شكراً لاختيارك نوتش.
```

**Variables:**
- `{{1}}` — current stamp count (e.g. "7")

---

## 3. `loyalty_reward_ready`

**Purpose:** Customer reached 10 stamps; reward is ready.

**Body:**
```
🎁 وصلت 10 طوابع! مشروبك المجاني جاهز. افتح بطاقة الولاء واضغط "استرد الآن" لإنشاء رمز من 4 حروف، ثم أعطه للبارستا. https://apps.noch.cloud/loyalty/me
```

**Variables:** none.

---

## 4. `order_pending_confirm`

**Purpose:** Customer placed an online order; staff has been notified.

**Body:**
```
☕ استلمنا طلبك! رمز الاستلام: *{{1}}*. سنخبرك عند تجهيزه. شكراً لطلبك من نوتش.
```

**Variables:**
- `{{1}}` — pickup code (e.g. "A4F7")

---

## 5. `order_ready_pickup`

**Purpose:** Staff tapped Confirm at POS; order is ready.

**Body:**
```
✅ طلبك جاهز للاستلام يا {{1}}! تعال إلى الكاشير مع رمز الاستلام: *{{2}}*.
```

**Variables:**
- `{{1}}` — customer name
- `{{2}}` — pickup code

---

## 6. `inventory_review_digest` (internal — owner/supervisor only)

**Purpose:** Twice-weekly proactive stock review (Sun + Wed).

**Body:**
```
📦 مراجعة المخزون - {{1}}: {{2}} عنصر حرج، {{3}} يحتاج إعادة طلب الآن، {{4}} قريباً. التفاصيل في التطبيق.
```

**Variables:**
- `{{1}}` — date (e.g. "الأحد 28 أبريل")
- `{{2}}` — critical count
- `{{3}}` — reorder_now count
- `{{4}}` — reorder_soon count

---

## 7. `loyalty_marketing_birthday` (Marketing — separate review)

**Purpose:** Birthday wish + bonus stamp.

**Body:**
```
🎂 عيد ميلاد سعيد يا {{1}}! أضفنا طابعاً إضافياً لبطاقتك كهدية. نراك قريباً.
```

**Variables:**
- `{{1}}` — customer name

> ⚠️ Marketing templates have stricter approval. Submit this one **after** the utility templates are approved so a marketing rejection doesn't slow them down.

---

## After approval

Each approved template gets a `content_sid` like `HX...`. Save these in the `whatsapp_templates` lookup (TBD migration — not built yet) so the edge function can resolve template name → content_sid at send time. Without that lookup, hardcode them in `supabase/functions/send-whatsapp/index.ts` as a temporary map.
