// ============================================================
// CLAUDE CLIENT — Noch Content Engine
// Powers Notchi's voice. Not a marketing tool.
// Model: claude-sonnet-4-6
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { getBrand, getGenerationLogs, updateBrand } from './supabase'

// ── API key — localStorage overrides .env ──────────────────────
export const STORAGE_KEY = 'noch_anthropic_api_key'
export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_ANTHROPIC_API_KEY || ''
}
export function setApiKey(key) {
  if (key) localStorage.setItem(STORAGE_KEY, key.trim())
  else localStorage.removeItem(STORAGE_KEY)
}

// ============================================================
// THE DUAL VOICE SYSTEM
// From the brand guide. Not interchangeable.
// ============================================================

export const NOCH_VOICE = `
NOCH THE BRAND — used only for craft/quality/serious product moments.
Language: Formal Arabic. Tone: Serious, professional, confident.
Sounds like a master who knows — and does not need to explain it.
Show it. Never explain it.
`

export const NOTCHI_VOICE = `
NOTCHI THE ADMIN — used for 99% of all content.
Language: Libyan Tripoli dialect. Tone: Playful, cheeky, slightly unhinged.

Notchi's Rules:
— Sounds like a person, never a brand
— Punches sideways at café culture — not at customers (except playfully)
— Never names competitors. Punches at the category.
— Confident-chaotic, not vulnerable-chaotic. Swagger, not sympathy.
— CTAs are punchlines. "Visit us today" energy is forbidden.
`

// ============================================================
// LIBYAN TRIPOLI DIALECT — Natural, not performed
// ============================================================
export const LIBYAN_DIALECT_GUIDE = `
## Libyan Tripoli Dialect — Key Rules

Negation: ما + verb + ش (ما كملش = didn't finish, ما عندوش = he doesn't have)
Now/urgency: هسّا (the most Libyan word)
Good/nice: زين / مزيان / كويس بزاف
A lot: بزاف
Come: تعالوا / إجيوا / جيوا
We: أحنا
What: شو / إيش
Why: ليش
Done/enough: خلاص

NEVER use Egyptian: مش، عايز، عايزة، إزيك
NEVER use Gulf formal Arabic
NEVER use MSA in casual content

Gen Z Libyan natural speech: صح، تمام، أوكي
Islamic casual (not preachy): والله، إن شاء الله when natural

Proven examples from Bloom Roastery (Noch's predecessor) that got 500-848 reactions:
— "مصمم الجرافيكس واخذ إجازة" (self-aware chaos energy)
— "قصة بلوم الحزينة" (turning the brand into the character)
— "الإلهام. باريت تجو تجربوا ماتشانا متعنا" (making the audience complicit)
`

// ============================================================
// CONTENT PILLARS — The only 5 things Noch posts
// ============================================================
export const CONTENT_PILLARS_GUIDE = `
## The 5 Content Pillars

01 · THE CRAFT (Noch voice — rare, serious)
Roasting, brewing, matcha prep. No tutorial. The process looking obsessively good.
Show it. Never explain it. Never say "crafted with care."

02 · THE DROP (Notchi voice)
New items, seasonal launches. Casual energy. Never a formal announcement.
"Announce nothing. Drop everything." Example: one sentence, one photo, done.

03 · NOTCHI'S WORLD (Notchi voice — the engine, most of the feed)
Pure personality. Memes, reactions, café culture jokes, fourth-wall breaks.
Notchi as creator, not brand account. This is what people follow for.

04 · THE CUP (Visual — no voice needed)
Pure product. No people, no context. Just the drink looking unreasonably good.
The drink is enough. Caption is minimal or none.

05 · REAL MOMENTS (Notchi voice)
In-café candid — hands, drinks, atmosphere. Lo-fi, unpolished on purpose.
Imperfection is the aesthetic. Not a brand shoot. Feels like a friend's post.
`

// ============================================================
// INTENT → PILLAR MAP
// The 6 generation modes in the studio UI
// ============================================================
export const INTENTS = [
  {
    id: 'notchis_world',
    emoji: '🐰',
    label: "Notchi's World",
    labelAr: 'عالم نوتشي',
    desc: 'Personality, memes, fourth-wall breaks',
    descAr: 'شخصية، ميمز، كسر الجدار الرابع',
    voice: 'notchi',
    strategy: `Generate a Notchi personality post. This is the engine of the feed.
Options: meme format, self-aware joke about being a café, fourth-wall break, café culture observation.
The benchmark: Duolingo's owl. Wendy's Twitter. Surreal Cereal.
NOT: a product description. NOT: "come visit us." NOT: any sentence that starts with "We are..."
The post should feel like it was written by a slightly unhinged person who makes excellent coffee and knows it.
Test: would someone screenshot this and send it to a friend? If not, start over.`,
  },
  {
    id: 'the_drop',
    emoji: '🪂',
    label: 'The Drop',
    labelAr: 'الإطلاق',
    desc: 'New item, seasonal — drop it, never announce it',
    descAr: 'منتج جديد، موسمي — ارميه، ما تعلنش',
    voice: 'notchi',
    strategy: `New item or seasonal drop. Casual energy. Maximum 2-3 lines.
"Announce nothing. Drop everything." — this is the rule.
No: "We're excited to introduce..." No: "Available now!" No: "Limited time only!"
Yes: State it like it's obvious. Like the drink has been here forever and you just noticed.
Yes: One sentence that makes them curious. Let the image do the work.
The Ryanair lesson: own it without apology. The Surreal lesson: confidence without budget.`,
  },
  {
    id: 'craft_moment',
    emoji: '⚗️',
    label: 'The Craft',
    labelAr: 'الحرفة',
    desc: 'Process, roasting, matcha prep — show it, never explain it',
    descAr: 'العملية، التحميص، تحضير الماتشا — أريه، ما تشرحش',
    voice: 'noch',
    strategy: `This is the NOCH voice (not Notchi). Formal Arabic. Rare. Serious.
Show the craft — roasting, extraction, matcha preparation.
Tone: master craftsman who doesn't need to prove anything.
NEVER: "our coffee is crafted with love and care" — this is the exact line to avoid.
NEVER: over-explain the process, lecture about origin or SCA scores (that's the elitism we reject).
The content: makes the process look obsessively good without saying a word about it.
1-2 lines max. The visual carries the weight.`,
  },
  {
    id: 'real_moment',
    emoji: '📸',
    label: 'Real Moments',
    labelAr: 'لحظات حقيقية',
    desc: 'Lo-fi, in-café candid — imperfection is the aesthetic',
    descAr: 'لو-فاي، داخل المحل — النقص هو الجماليات',
    voice: 'notchi',
    strategy: `Candid in-café moment. Hands, drinks, atmosphere, chaos.
Caption should feel like a friend posted it, not a brand account.
Lo-fi is intentional. Unpolished is on-brand. PerfectTed's iPhone approach.
The Bloom proof: "مصمم الجرافيكس واخذ إجازة" — chaos energy about real moments = 848 reactions.
Make the person feel like they're already there. Not aspirational. Relatable.`,
  },
  {
    id: 'reactive',
    emoji: '⚡',
    label: 'Reactive',
    labelAr: 'ردة فعل',
    desc: 'Trend-jack, local Tripoli moment, speed is the point',
    descAr: 'اختطاف ترند، لحظة طرابلسية، السرعة هي النقطة',
    voice: 'notchi',
    strategy: `Reactive content. Local Tripoli moment, trending topic, or meme format hijack.
The Five-Minute Rule: if it takes more than 5 minutes to craft, it's too engineered and loses authenticity.
Speed is the value. Speed is the strategy.
Trend-jack principle: Notchi as the "uninvited guest" in whatever conversation is happening.
The Ryanair lesson: turn the trending moment into Notchi's moment without being forced.
Never wait for the "perfect" reactive post. Good and fast beats perfect and slow.`,
  },
  {
    id: 'joyful_nihilism',
    emoji: '🌀',
    label: 'Joyful Nihilism',
    labelAr: 'العدمية المبهجة',
    desc: 'Life is meaningless, might as well drink good coffee',
    descAr: 'الحياة بلا معنى، بس الماتشا أحسن',
    voice: 'notchi',
    strategy: `The Dark Arts / Cards Against Humanity mode.
Philosophy: life is meaningless, so we might as well drink good coffee and laugh about it.
This validates the audience's actual mood. "Coffee costs less than therapy."
Not nihilism as sadness — JOYFUL nihilism. Warm, absurdist, relatable.
Examples of the energy: "im not convinced anyone actually likes matcha" / "c'mon, fix my life"
Noch's version: "drink the chaos" isn't a tagline. It's a worldview.
The post should feel like it speaks directly to someone having a weird day.`,
  },
]

// ============================================================
// PLATFORM + FORMAT OPTIONS
// ============================================================
export const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { id: 'twitter', label: 'X / Twitter', emoji: '🐦' },
  { id: 'whatsapp', label: 'WhatsApp Status', emoji: '💬' },
]

export const FORMATS = [
  { id: 'caption', label: 'Caption', emoji: '✍️' },
  { id: 'reel_script', label: 'Reel Script', emoji: '🎬' },
  { id: 'carousel', label: 'Carousel Slides', emoji: '🎠' },
  { id: 'story', label: 'Story Text', emoji: '⭕' },
]

// ============================================================
// SYSTEM PROMPT — This is Notchi's brief, not a marketing tool
// ============================================================
export function buildSystemPrompt(brand, brandProgramOverride = '') {
  const brandProgram = brandProgramOverride || brand?.brand_program || ''
  const brandName = brand?.name || 'Noch'

  return `You are writing content for **${brandName}** — a specialty coffee roaster and matcha café in Tripoli, Libya.

Tagline: **Drink the Chaos!**
Voice archetype: **Confident-Chaotic**

You are not a marketing tool. You are writing as NOTCHI — a slightly unhinged person who is obsessively good at making coffee and matcha, and ridiculous about everything else.

---

## THE DUAL VOICE SYSTEM

${NOCH_VOICE}

${NOTCHI_VOICE}

---

## WHO NOCH IS (from the brand guide)

What we are: Approachable craftsmen. Obsessed with quality, not looking premium. Gen Z built, matcha-forward, specialty-coffee-serious.
What we are not: A vibe cafe. Pretentious. Elitist. Wellness-speak. "Elevate your morning" garbage.

The audience picks the café by vibe before the menu. They screenshot good captions. They post stories. They care whether it's worth a story.

---

## DIALECT & LANGUAGE
${LIBYAN_DIALECT_GUIDE}

---

## THE CONTENT PILLARS
${CONTENT_PILLARS_GUIDE}

---

${brandProgram ? `## BRAND PROGRAM (evolved from real performance data)
${brandProgram}

---` : ''}

## THE RED LINES — NOTCHI NEVER DOES THESE

01 Never sounds like a brand. No "we're excited to announce." No corporate language.
02 Never names competitors. Punch at the category, never specific names.
03 Never punches down. Customers are never the joke — unless clearly affectionate.
04 Never posts polished grand opening energy. No ribbon cutting. No formal fanfare.
05 Never apologizes publicly.
06 Never goes political or religious. Hard line. No exceptions.
07 Never over-explains the craft. Show it. Don't lecture about it.
08 Never fakes urgency. No "limited time only" desperation energy.
09 Never uses: amazing / incredible / premium / authentic / elevate / passionate / journey

---

## THE QUALITY TEST

Before outputting, check the post against:

1. **Stop-the-scroll test**: Does the first line earn 0.5 seconds of attention? If not, rewrite the hook.
2. **Shareability test**: Would someone screenshot this and send to a friend? If not, it's not sharp enough.
3. **Brand/product ratio**: Attention first → Brand second → Product third. The drink is never the hero. Notchi is.
4. **Sound test**: Read it aloud. Does it sound like a person or a brand account? Person = good. Brand = rewrite.
5. **The 5-minute rule**: Does it feel engineered? Real Notchi content is instinctive, not labored.

---

## FEW-SHOT EXAMPLES — What "right" looks like

**[Notchi's World — Libyan Arabic, 848 reactions at Bloom Roastery]**
مصمم الجرافيكس واخذ إجازة
(The designer took a day off — self-aware, no explanation needed, chaos as content)

**[Joyful Nihilism — English reference]**
"This cup of matcha saw you cry last night."
(Addresses the audience's actual mood, not aspirational)

**[The Drop — no announcement energy]**
"im not convinced anyone actually likes matcha. anyway, new seasonal is here."
(Confidence through self-aware humor. The product is almost an afterthought.)

**[Reactive — speed and instinct]**
"coffee costs less than therapy."
(Two words into the cultural conversation. No setup needed.)

**[Notchi's World — Libyan Arabic, earned CTA]**
هسّا بكل طرابلس عارفين — الماتشا بتاعنا ما تكملش.
مش لأنها مشهورة. لأنها فعلاً كويسة بزاف.
جيوا تشوفوا بعيونكم.
(هسّا for urgency. ما تكملش shows social proof without bragging. CTA is an invitation, not a command.)

**[Fourth Wall Break — The Surreal/Oatly lesson]**
"we asked AI to write this caption. it said 'come try our matcha.' we almost ran it."
(Meta-marketing. Acknowledging the game builds trust with cynical audiences.)

**[What BAD looks like — never generate this]**
❌ "Our matcha is crafted with love using only the finest ceremonial grade leaves."
❌ "We're excited to announce our new seasonal menu! Come visit us today!"
❌ "Experience the warmth of Noch Café this weekend."
❌ Any sentence beginning with: "We are", "We're excited", "Introducing", "Limited time"

---

## OUTPUT FORMAT

Return ONLY valid JSON:
\`\`\`json
{
  "caption_ar": "Libyan Tripoli dialect — Notchi voice. null if English-only.",
  "caption_en": "English — Notchi voice. null if Arabic-only.",
  "hook": "The exact first line. The one that stops the scroll.",
  "hashtags": ["#noch", "#نوتشي"],
  "notes": "One sentence: what creative choice was made and why.",
  "visual_brief": "What the visual should show — for the photographer/designer. No faces. Lo-fi or analog."
}
\`\`\`

Max 3 hashtags. Captions: 1-3 lines. No preamble. No explanation outside the JSON.`
}

// ============================================================
// USER PROMPT BUILDER
// ============================================================
export function buildUserPrompt(intent, format, platform, language, context = '') {
  const intentObj = INTENTS.find(i => i.id === intent)
  const strategy = intentObj?.strategy || ''
  const isNochVoice = intentObj?.voice === 'noch'

  const languageInstruction = isNochVoice
    ? 'Use NOCH voice: formal Arabic. Serious. Confident. No dialect, no humor.'
    : language === 'ar'
    ? 'Use NOTCHI voice: Libyan Tripoli dialect. Playful, cheeky, slightly unhinged. هسّا and بزاف should feel natural.'
    : language === 'bilingual'
    ? 'Use NOTCHI voice. Generate caption_ar in Libyan Tripoli dialect AND caption_en in English. Both must feel native — not translated. Same energy, different language.'
    : 'Use NOTCHI voice: English. Same unhinged confidence. No Arabic needed but Noch personality fully present.'

  return `Content type: **${intentObj?.label || intent}**
Platform: **${platform}**
Format: **${format}**

${strategy}

Language: ${languageInstruction}

${context ? `Context from the team: ${context}` : ''}

Generate. JSON only. Make the hook impossible to skip.`
}

// ============================================================
// STREAMING GENERATION
// No per-call feedback injection. brand_program carries the learning.
// ============================================================
export async function* generatePostStream({ brand, intent, format, platform, language = 'bilingual', context = '' }) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('Anthropic API key not set — add it in Brand Settings')
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildSystemPrompt(brand),
    messages: [{ role: 'user', content: buildUserPrompt(intent, format, platform, language, context) }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ============================================================
// JSON EXTRACTOR
// ============================================================
export function extractJSON(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/)
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()) } catch { /* fall through */ }
  }
  const braces = text.match(/\{[\s\S]*\}/)
  if (braces) {
    try { return JSON.parse(braces[0]) } catch { /* fall through */ }
  }
  return null
}

// ============================================================
// SELF-IMPROVEMENT LOOP (Karpathy pattern)
// Triggered manually. Reads rated posts + feedback.
// Rewrites brand_program. Injected into all future generations.
// ============================================================
export async function runImprovementLoop(brandId) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Anthropic API key not set — add it in Brand Settings')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const brand = await getBrand(brandId)
  const logs = await getGenerationLogs(brandId, 50)

  const scoredLogs = logs.filter(l => l.score_overall != null && l.human_feedback)
  if (scoredLogs.length < 5) {
    throw new Error('Need at least 5 rated posts with feedback to run the improvement loop')
  }

  const topPosts = scoredLogs
    .filter(l => l.score_overall >= 8)
    .slice(0, 5)
    .map(l => `✅ Score ${l.score_overall}/10 | Pillar: ${l.intent || '?'} | "${(l.output_ar || l.output_en || '').slice(0, 150)}"`)
    .join('\n')

  const lowPosts = scoredLogs
    .filter(l => l.score_overall <= 4)
    .slice(0, 5)
    .map(l => `❌ Score ${l.score_overall}/10 | Pillar: ${l.intent || '?'} | Feedback: "${l.human_feedback}" | "${(l.output_ar || l.output_en || '').slice(0, 100)}"`)
    .join('\n')

  const allFeedback = scoredLogs
    .filter(l => l.human_feedback)
    .slice(0, 10)
    .map(l => `- "${l.human_feedback}" (score: ${l.score_overall})`)
    .join('\n')

  const currentProgram = brand.brand_program || 'No existing program yet'

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are refining a brand content program for Noch — a Libyan matcha café with a Confident-Chaotic voice.
The program is injected into every future content generation prompt.
Be specific. Be brutal about what isn't working. Keep what is.
Output only the new program text — no preamble, no JSON.`,
    messages: [{
      role: 'user',
      content: `Current brand_program:
---
${currentProgram.slice(0, 2000)}
---

Performance data from ${scoredLogs.length} rated posts:

HIGH-SCORING (do more of this):
${topPosts || '(none yet)'}

LOW-SCORING (stop doing this):
${lowPosts || '(none yet)'}

Team feedback:
${allFeedback || '(none yet)'}

Write an improved brand_program that:
1. Names the specific patterns that scored high — phrases, hooks, structures
2. Explicitly bans patterns that scored low
3. Adds new examples based on what the team responded to
4. Stays under 1200 words
5. Remembers: this is Notchi, not a marketing tool`
    }],
  })

  const newProgram = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  if (!newProgram || newProgram.length < 100) {
    throw new Error('Improvement loop produced empty output')
  }

  await updateBrand(brandId, { brand_program: newProgram })
  return newProgram
}

// ============================================================
// CAPTION VARIANTS — Generate 3 distinct variants in one call
// ============================================================
export async function* generateVariantsStream({ brand, intent, format, platform, language = 'bilingual', context = '' }) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('Anthropic API key not set — add it in Brand Settings')
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const basePrompt = buildUserPrompt(intent, format, platform, language, context)

  const variantPrompt = `${basePrompt}

---

Generate exactly 3 DISTINCT variants of this post. Each variant must approach the brief differently:
- Variant 1: Different hook angle
- Variant 2: Different tone/energy within Notchi's range
- Variant 3: Most unexpected / surprising interpretation

Return JSON ONLY:
\`\`\`json
{
  "variants": [
    {
      "caption_ar": "...",
      "caption_en": "...",
      "hook": "...",
      "hashtags": [],
      "notes": "...",
      "visual_brief": "..."
    },
    { ... },
    { ... }
  ]
}
\`\`\``

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: buildSystemPrompt(brand),
    messages: [{ role: 'user', content: variantPrompt }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

export function parseVariants(text) {
  const parsed = extractJSON(text)
  if (parsed?.variants && Array.isArray(parsed.variants)) {
    return parsed.variants.slice(0, 3)
  }
  return null
}

// ============================================================
// IDEA SCORING — Score a content idea against brand alignment
// ============================================================
export async function scoreIdeaAgainstBrand(idea, brand) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Anthropic API key not set')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const ideaText = [
    idea.title && `Title: ${idea.title}`,
    idea.notes && `Notes: ${idea.notes}`,
    idea.source_url && `Source: ${idea.source_url}`,
    idea.content_pillar && `Proposed pillar: ${idea.content_pillar}`,
    idea.source_platform && `Platform: ${idea.source_platform}`,
  ].filter(Boolean).join('\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: buildSystemPrompt(brand),
    messages: [{
      role: 'user',
      content: `Rate this content idea against Notchi's persona on a scale of 1-10.

IDEA:
${ideaText}

Check:
1. Does it fit one of Notchi's 5 content pillars?
2. Does it pass all 9 red lines (no corporate language, no naming competitors, etc.)?
3. Is it something Notchi would genuinely post?
4. Does it have the stop-the-scroll / shareability potential?

Return JSON ONLY:
\`\`\`json
{
  "score": 7.5,
  "pillar_fit": "notchis_world",
  "red_line_violations": [],
  "recommendation": "Strong candidate — develop as a Notchi's World meme",
  "why": "..."
}
\`\`\``
    }],
  })

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return extractJSON(text)
}
