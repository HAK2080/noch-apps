# Noch Task Manager — V2 Release Notes
## Snapshot: 2026-04-11

---

## V1 — Core Task Manager
- Dashboard with task stats, top performers, overdue tracking
- Task CRUD with priorities, assignments, due dates, attachments, comments
- Staff management with Telegram integration (auto-detect chat ID)
- Recipe library (bilingual AR/EN, ingredients, layers, steps, glass type)
- Weekly reports with WhatsApp export
- Role-based access: Owner (full) vs Staff (my tasks + recipes)
- Bilingual UI (Arabic + English) with language toggle
- Dark theme (bg-noch-dark / text-noch-green)

## V2 — Content Engine
### Voice Intelligence
- 10-dimension voice fingerprint (formality, humor, sarcasm, warmth, aggression, code_switching, dialect_density, meme_native, cta_directness, religious_refs)
- Voice Auto-Verifier: paste any text → score it against brand voice
- Negative examples system ("this is NOT our voice")
- Dialect corpus builder (Tripoli Arabic expressions library)
- Export Brand Guide (.txt)

### Content Generation
- AI content generator (Claude Opus) with 3-5 batch variations
- Configurable sliders: chaos, humor, local dialect density
- Swipe file inspiration (voice-similar posts injected into prompt)
- Generation memory + config sweet spot optimizer
- Research hub with auto-research + web scouting

### Scraping & Scouting
- Facebook page scraper (m.facebook.com mobile parsing)
- Auto-discover Tripoli cafe/food pages via DuckDuckGo
- Scout Sources management (add/scrape/monitor competitor pages)
- Voice similarity scoring on scraped posts

### Self-Evolving Loop
- Golden post auto-promotion (score >= 8.5 → training material)
- Post performance logging (reach, likes, comments, shares, saves)
- Performance-based auto-promotion (2x avg reach → training)
- Human feedback with source_weight=3 (highest)
- Content gap analysis (your category mix vs competitors)
- Karpathy loop: generate → score → approve/reject → extract lesson → improve

### Database (22 tables)
profiles, tasks, task_attachments, task_comments, task_reminders, report_logs,
recipes, ingredients, stock, stock_logs, recipe_ingredients, categories,
brands, brand_materials, content_research, content_posts, content_experiments,
content_calendar, swipe_file, voice_fingerprint, dialect_corpus, scout_sources,
generation_log, post_performance, negative_examples, content_categories

### Edge Functions (7)
generate-content, analyze-brand, auto-research, social-scraper,
send-telegram, send-whatsapp, get-telegram-ids

### Tech Stack
- React + Vite + Tailwind CSS (dark theme)
- Supabase (PostgreSQL + Storage + RLS + Edge Functions in Deno)
- Anthropic Claude API (claude-opus-4-5)
- Google CSE + DuckDuckGo fallback for web scouting
