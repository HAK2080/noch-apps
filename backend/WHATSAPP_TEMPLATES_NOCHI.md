# WhatsApp Templates — Nochi Voice

Rewrite of all 13 templates in Nochi's voice. Nochi is the brand's bunny mascot (Libyan Arabic, playful, warm, first-person). Reference: the 848-reaction "Notchi's World" content from Bloom Roastery era.

**Profile setup:** Display name stays `Noch`. Profile photo on the WhatsApp Business sender → upload a 640×640 PNG of Nochi the bunny. Customers see Nochi every time they open the chat.

**Voice rules for Nochi:**
- First person ("أنا"، "عندي"، "ضفت لك")
- Libyan Arabic dialect ("هاي"، "تعا"، "حلو/حلوة")
- **Mischievous + warm** — Nochi takes credit, teases, knows things, watches you. Not childish, not corporate.
- Occasional 🐰 / paws / coffee emoji — not in every message
- Short. Customers read on a phone, half-attention.
- Internal templates (e.g. `inventory_review_digest` to owners) stay clinical — Nochi doesn't write inventory reports.

---

## Utility templates (submit first)

### 1. `staff_invite`
```
هاي يا {{1}} 🐰 أنا نوتشي. حسابك جاهز — افتحه من {{2}} وغيّر الباسوورد لراحتك ☕
```
Variables: `{{1}}` name, `{{2}}` login URL.

> Meta rule: variables can't be at the start or end. Original ended with `{{2}}` — moved into the middle of the sentence.

### 2. `loyalty_stamp_earned`
```
شكراً يا {{1}} ☕️ ضفت لك طابع جديد بإيدي — لميت {{1}} من 10. كم زيارة بعد وتحصل على مشروب على حسابي 🐰
```
*Note: variable {{1}} appears twice — split into {{1}} name + {{2}} stamp count.*

**Corrected:**
```
شكراً يا {{1}} ☕️ ضفت لك طابع جديد بإيدي — لميت {{2}} من 10. كم زيارة بعد وتحصل على مشروب على حسابي 🐰
```
Variables: `{{1}}` name, `{{2}}` stamp count.

### 3. `loyalty_reward_ready`
```
🎁 يا {{1}}! وصلت 10 طوابع — مشروبك المجاني جاهز عندي. افتح بطاقة الولاء، اضغط "استرد الآن"، وأعطي البارستا الرمز. https://apps.noch.cloud/loyalty/me
```
Variables: `{{1}}` name.

### 4. `order_pending_confirm`
```
شفت طلبك يا {{1}} 👀 استلمته بإيدي. رمزك: *{{2}}*. لما نخلص نقولك 🐰☕
```
Variables: `{{1}}` name, `{{2}}` pickup code.

### 5. `order_ready_pickup`
```
يلا يا {{1}} 🐰 خلصت طلبك. الرمز *{{2}}* — تعا أخدته قبل لا يبرد ☕
```
Variables: `{{1}}` name, `{{2}}` pickup code.

> Meta rule: variables can't be at the start or end. Original ended with `*{{2}}*` — moved into the middle.

---

## Marketing templates (submit after utility approves)

### 6. `loyalty_lapsed_checkin`
```
يا {{1}}، نسيتني؟ 👀 من {{2}} يوم وأنا أنطر. تعا اليوم على حسابي — لا تخليني أحزن 🐰
```
Variables: `{{1}}` name, `{{2}}` days since last visit.

### 7. `loyalty_visit_feedback`
```
شكراً على زيارتك يا {{1}} 🙌 كيف كانت؟ اضغط على بطاقة الولاء وقيّمها بنجمة — رأيك يفرحني. https://apps.noch.cloud/loyalty/me
```
Variables: `{{1}}` name.

### 8. `loyalty_marketing_birthday`
```
🎂 عيد ميلاد سعيد يا {{1}}! ضفت لك طابع إضافي بإيدي كهدية — تعا نحتفل ☕🐰
```
Variables: `{{1}}` name.

### 9. `marketing_weather_iced`
```
يا {{1}}، الجو حر اليوم 🌡️☀️ تبي {{2}} مثلج جاهز عند وصولك؟ قول لي وأبدأ أحضّره 🐰
```
Variables: `{{1}}` name, `{{2}}` top drink.

### 10. `marketing_streak_save`
```
يا {{1}}، عندك {{2}} زيارة متتالية 🔥 لا تخسرها مني — أنا أحسب 👀🐰
```
Variables: `{{1}}` name, `{{2}}` streak count.

> Meta rule: variables can't be at the start or end. Original started with `{{2}}` — moved name to the front.

### 11. `marketing_anniversary`
```
🎉 سنة كاملة معي يا {{1}}! خصم 20% اليوم على {{2}} وأي شيء تطلبه — تعا نحتفل ☕🐰
```
Variables: `{{1}}` name, `{{2}}` top drink.

> 20% discount instead of "on me" (free drink) — sustainable across the customer base. Wiring (Phase 2) needs to apply a 20% promo code at POS for that customer on their anniversary day.

### 12. `marketing_back_in_stock`
```
يا {{1}}، {{2}} رجع 🎉 خبيت لك واحد — تعا قبل لا أشربه أنا 🐰👀
```
Variables: `{{1}}` name, `{{2}}` product name.

---

## Migration plan (if you already submitted the old versions)

1. In Twilio Console → Content Templates, click each existing submission with the old wording.
2. **Delete** (or "Reject" if Meta hasn't reviewed yet — Twilio shows the option).
3. Create new with the same `name` field but the Nochi-voice body.
4. Resubmit. ~1 extra day per template; minor cost for consistent voice.

If a template has already been Meta-approved with old wording, you can leave it and only update its `Body` for new approval cycle (Twilio supports versioning) — but for clean state, deleting and recreating is simpler.
