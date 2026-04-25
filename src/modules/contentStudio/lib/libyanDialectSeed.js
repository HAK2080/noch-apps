// Tripoli Libyan dialect seed data — validated by native speaker.
// Source: personal memory `libyan-tripoli-dialect.md`.
// This is the baseline a user can load into a voice profile with one click,
// then refine via the Dialect Trainer and approved-draft feedback loop.

export const LIBYAN_TRIPOLI_SEED = {
  dialect_rules: `Write in Tripoli Libyan Arabic. This is a western-Libyan / Maghrebi dialect — fast, casual, with Italian loanwords naturalized.

GRAMMAR
- Negation wraps the verb: ما ... ش. Examples: ما نقدرش (can't), ما شفتوش (didn't see), ما عندوش (doesn't have).
- First-person plural uses n- prefix: نروح (we go), نحبوا (we like), نديرو (we do/make).
- /q/ is often a glottal stop in urban Tripoli (قهوة → 'هوة in speech; keep قاف in writing unless stylistic).

CORE VERB: نديرو (we do/make) — the single most important Tripoli marker.
- ✅ شنو قاعدين نديرو؟ (what are we doing?)
- ❌ شنو قاعدين نعملوا؟ (sounds pan-Arab/MSA, not Tripoli)

GREETINGS & FILLER
- هلا / شنو الجو؟ (not ازيك / كيفك alone)
- والله (constantly, as truth-emphasis)
- مية مية (perfect / 100%)
- هلبة (a lot / very much — NOT بزاف alone when Tripoli-specific tone is needed)

STYLE
- Conversational, never MSA. Syllables compress; short words elide.
- Warm-family-roast humor. Never mean-spirited.
- Mix occasional English naturally (Gen Z code-switching) — but DO NOT use this as a crutch for a weak Arabic sentence.

CULTURAL TOUCHPOINTS (use sparingly, when concept calls for it)
- الحر (the heat), انقطاع التيار (power cuts), الزحمة (traffic), البقالة (corner shop), القهوة الليبية (Libyan coffee), العزومة (obligatory family gathering), رمضان rhythm.

DO NOT USE
- Egyptian markers: مش, عايز, عايزة, ازيك
- Levantine markers: شو, بدي, هسّا
- Gulf markers: الحين (use توّى), نظن (use نحسب)
- MSA formal structures when a dialect equivalent exists.`,

  dialect_lexicon: [
    { msa: 'ماذا',   dialect: 'شنو',    note: 'Tripoli "what" — NOT شو (Levantine) or ايش (Gulf)' },
    { msa: 'أريد',   dialect: 'نبّي',    note: 'I want' },
    { msa: 'الآن',   dialect: 'توّى',    note: 'now / just now — NOT هسّا or الحين' },
    { msa: 'كثير',   dialect: 'هلبة',    note: 'a lot / very much — Tripoli-specific intensifier' },
    { msa: 'جيد جداً', dialect: 'مية مية', note: 'perfect / 100%' },
    { msa: 'نفعل',   dialect: 'نديرو',   note: 'CORE VERB — we do/make. Never نعملوا.' },
    { msa: 'أظن',    dialect: 'نحسب',    note: 'I think/reckon — NOT نظن (Gulf)' },
    { msa: 'ماذا يحدث', dialect: 'شنو الجو', note: 'what\'s up / how\'s it going' },
    { msa: 'مرحبا', dialect: 'هلا',     note: 'casual hi/hey' },
    { msa: 'حقاً',   dialect: 'والله',   note: 'truth-emphasis, used constantly' },
    { msa: 'كاملاً',  dialect: 'بكّل',    note: 'completely / absolutely' },
    { msa: 'انظر',   dialect: 'حكّر',    note: 'look / look at this (imperative)' },
    { msa: 'اجلس',   dialect: 'قعمز',    note: 'sit down (imperative)' },
    { msa: 'حار جداً', dialect: 'سخانة',   note: 'hot weather / sweltering' },
    // Italian loanwords (Tripoli-naturalized)
    { msa: 'إشارة مرور', dialect: 'سيمافرو', note: 'traffic light — from Italian semaforo' },
    { msa: 'تنورة',  dialect: 'جونة',    note: 'skirt — from Italian gonna' },
    { msa: 'معطف',   dialect: 'كبّوط',    note: 'coat — from Italian cappotto' },
    { msa: 'شرفة',   dialect: 'بالكون',   note: 'balcony — from Italian balcone' },
    { msa: 'فرن',    dialect: 'فورنو',   note: 'oven — from Italian forno' },
    { msa: 'مثلجات', dialect: 'جلاطي',   note: 'ice cream — from Italian gelato' },
    // User-validated corrections
    { msa: 'توقف حيث تجد', dialect: 'توقف وين ماتلاقي', note: 'Tripoli negation pattern' },
    { msa: 'لا تقل',  dialect: 'ما تقلولش', note: 'plural address + double negation' },
    { msa: 'احكمي بنفسك', dialect: 'احكمي', note: 'imperative — NOT تحكمي' },
    { msa: 'مبكراً', dialect: 'بكري',    note: 'early — NOT بكير' },
    { msa: 'ما الفرق', dialect: 'شنو الفرق', note: 'article required' },
    // Libyanized English
    { msa: 'انتهيت', dialect: 'فناشيت',  note: 'from English "I finished" + past-tense suffix' },
  ],

  forbidden_msa_forms: [
    'نعملوا',   // wrong verb for do/make
    'مش',       // Egyptian negator
    'عايز', 'عايزة', // Egyptian "want"
    'ازيك',     // Egyptian greeting
    'شو',       // Levantine "what"
    'بدي',      // Levantine "want"
    'هسّا',     // Levantine "now"
    'الحين',    // Gulf "now"
    'نظن',      // Gulf "I think"
    'في هذا الوقت', // MSA formal
    'يجب علينا', // MSA formal
  ],

  gold_examples: [
    {
      text: 'والله ما عندنا فكرة شنو ندير، بس القهوة مية مية',
      source_type: 'reference',
      source_ref: 'memory/libyan-tripoli-dialect.md translation principle',
      rating: 5,
    },
  ],
}
