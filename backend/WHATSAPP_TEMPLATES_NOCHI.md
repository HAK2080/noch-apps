# WhatsApp Templates — Nochi Voice

Rewrite of all 13 templates in Nochi's voice. Nochi is the brand's bunny mascot (Libyan Arabic, playful, warm, first-person). Reference: the 848-reaction "Notchi's World" content from Bloom Roastery era.

**Profile setup:** Display name stays `Noch`. Profile photo on the WhatsApp Business sender → upload a 640×640 PNG of Nochi the bunny. Customers see Nochi every time they open the chat.

**Voice rules for Nochi:**
- First person ("أنا"، "عندي"، "ضفت لك")
- Libyan Arabic dialect ("هاي"، "تعا"، "حلو/حلوة")
- Warm + slightly playful, not childish
- Occasional 🐰 / paws / coffee emoji — not in every message
- Short. Customers read on a phone, half-attention.

---

## Utility templates (submit first)

### 1. `staff_invite`
```
هاي يا {{1}} 🐰 أنا نوتشي. سويت لك حساب جديد عندنا — افتحه من هنا وغير الباسوورد لراحتك: {{2}}
```
Variables: `{{1}}` name, `{{2}}` login URL.

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
تسلم يا {{1}} ☕ استلمت طلبك — رمز الاستلام: *{{2}}*. نخبرك أول ما يكون جاهز 🐰
```
Variables: `{{1}}` name (NEW), `{{2}}` pickup code.

### 5. `order_ready_pickup`
```
يا {{1}}، طلبك جاهز ✅ تعا للكاشير ومعك الرمز: *{{2}}*. ناطرك 🐰
```
Variables: `{{1}}` name, `{{2}}` pickup code.

### 6. `inventory_review_digest`
```
📦 مراجعة المخزون — {{1}}. عندنا {{2}} حرج، {{3}} لازم نطلبه اليوم، {{4}} قريب. التفاصيل في التطبيق 🐰
```
Variables: `{{1}}` date, `{{2}}` critical, `{{3}}` reorder_now, `{{4}}` reorder_soon.

---

## Marketing templates (submit after utility approves)

### 7. `loyalty_lapsed_checkin`
```
يا {{1}}، اشتقتلك! 🐰 آخر زيارة كانت قبل {{2}} يوم — تعا اليوم على حسابي وأسجل لك زيارة مجانية ☕
```
Variables: `{{1}}` name, `{{2}}` days since last visit.

### 8. `loyalty_visit_feedback`
```
شكراً على زيارتك يا {{1}} 🙌 كيف كانت؟ اضغط على بطاقة الولاء وقيّمها بنجمة — رأيك يفرحني. https://apps.noch.cloud/loyalty/me
```
Variables: `{{1}}` name.

### 9. `loyalty_marketing_birthday`
```
🎂 عيد ميلاد سعيد يا {{1}}! ضفت لك طابع إضافي بإيدي كهدية — تعا نحتفل ☕🐰
```
Variables: `{{1}}` name.

### 10. `marketing_weather_iced`
```
يا {{1}}، الجو حر اليوم 🌡️☀️ تبي {{2}} مثلج جاهز عند وصولك؟ قول لي وأبدأ أحضّره 🐰
```
Variables: `{{1}}` name, `{{2}}` top drink.

### 11. `marketing_streak_save`
```
يا {{1}}، عندك {{2}} زيارة متتالية 🔥 ما تكسر السلسلة! نشوفك هالأسبوع؟ 🐰
```
Variables: `{{1}}` name, `{{2}}` streak count.

### 12. `marketing_anniversary`
```
🎉 سنة كاملة معي يا {{1}}! اليوم {{2}} على حسابي — تعا نحتفل ☕🐰
```
Variables: `{{1}}` name, `{{2}}` top drink.

### 13. `marketing_back_in_stock`
```
يا {{1}}، {{2}} اللي تحبه رجع! 🎉 أحضّر لك واحد اليوم؟ 🐰
```
Variables: `{{1}}` name, `{{2}}` product name.

---

## Migration plan (if you already submitted the old versions)

1. In Twilio Console → Content Templates, click each existing submission with the old wording.
2. **Delete** (or "Reject" if Meta hasn't reviewed yet — Twilio shows the option).
3. Create new with the same `name` field but the Nochi-voice body.
4. Resubmit. ~1 extra day per template; minor cost for consistent voice.

If a template has already been Meta-approved with old wording, you can leave it and only update its `Body` for new approval cycle (Twilio supports versioning) — but for clean state, deleting and recreating is simpler.
