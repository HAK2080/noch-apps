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

## 7. `loyalty_lapsed_checkin` (Marketing — "we miss you")

**Purpose:** Customer hasn't visited in N days; nudge them back with a free-stamp incentive.

**Body:**
```
يا {{1}}، اشتقنالك! آخر زيارة كانت قبل {{2}} يوم. تعال شرب قهوة على حسابنا — نسجل لك زيارة مجانية اليوم فقط. ☕
```

**Variables:**
- `{{1}}` — customer name
- `{{2}}` — days since last visit (e.g. "21")

---

## 8. `loyalty_visit_feedback` (Marketing — post-visit ask)

**Purpose:** Fire 30–60 min after a loyalty stamp is earned to ask for feedback.

**Body:**
```
شكراً لزيارتك يا {{1}}! 🙌 كيف كانت تجربتك؟ قيّم زيارتك بضغطة من بطاقة الولاء — رأيك يهمنا. https://apps.noch.cloud/loyalty/me
```

**Variables:**
- `{{1}}` — customer name

---

## 9. `loyalty_marketing_birthday` (Marketing — separate review)

**Purpose:** Birthday wish + bonus stamp.

**Body:**
```
🎂 عيد ميلاد سعيد يا {{1}}! أضفنا طابعاً إضافياً لبطاقتك كهدية. نراك قريباً.
```

**Variables:**
- `{{1}}` — customer name

> ⚠️ Marketing templates have stricter approval. Submit this one **after** the utility templates are approved so a marketing rejection doesn't slow them down.

---

## 10. `marketing_weather_iced` (Marketing — personalized)

**Purpose:** Fire on hot days only (>32°C in Tripoli) with the customer's most-ordered drink. Cron checks weather API + customer's top-product view.

**Body:**
```
يا {{1}}، الجو حر اليوم في طرابلس ☀️ تبي {{2}} مثلج جاهز عند وصولك؟
```

**Variables:**
- `{{1}}` — customer name
- `{{2}}` — top drink last 60 days (fallback: `loyalty_customers.drink_choice`, then "مشروبك المفضل")

---

## 11. `marketing_streak_save` (Marketing — loss aversion)

**Purpose:** Customer is on an active visit streak; ping at day 5 since last visit before the streak resets.

**Body:**
```
يا {{1}}، عندك سلسلة {{2}} زيارة متتالية 🔥 لا تكسرها — نشوفك هالأسبوع؟
```

**Variables:**
- `{{1}}` — customer name
- `{{2}}` — current_streak count

---

## 12. `marketing_anniversary` (Marketing — yearly surprise)

**Purpose:** Fire on the anniversary of customer's first visit. Personalized with their top drink.

**Body:**
```
🎉 سنة كاملة من النوش يا {{1}}! اليوم {{2}} على حسابنا — احتفل معنا.
```

**Variables:**
- `{{1}}` — customer name
- `{{2}}` — top drink last 60 days (or fallback as in #10)

---

## 13. `marketing_back_in_stock` (Marketing — relevance)

**Purpose:** A product the customer ordered before came back from out-of-stock. Fire only to customers who ordered it in last 90 days.

**Body:**
```
يا {{1}}، {{2}} اللي تحبه رجع متوفر! نشوفك اليوم؟ 🎉
```

**Variables:**
- `{{1}}` — customer name
- `{{2}}` — product name (e.g. "شاي بارودي الأخضر")

---

## Personalization SQL helpers (Phase 2 wiring)

When we build the cron + edge functions that fire these, we need:

```sql
-- Top drink per loyalty customer over last 60 days
create or replace view v_loyalty_top_drink as
select
  lc.id as customer_id,
  lc.full_name,
  lc.phone,
  (
    select p.name
    from pos_orders o
    join pos_order_items oi on oi.order_id = o.id
    join pos_products p on p.id = oi.product_id
    where o.customer_phone = lc.phone
      and o.created_at >= now() - interval '60 days'
      and coalesce(o.status, 'completed') in ('completed', 'paid', 'closed')
    group by p.id, p.name
    order by sum(oi.quantity) desc
    limit 1
  ) as top_drink,
  lc.drink_choice as fallback_drink
from loyalty_customers lc;
```

Then the edge function reads `top_drink ?? fallback_drink ?? 'مشروبك المفضل'` for the `{{2}}` variable.

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
