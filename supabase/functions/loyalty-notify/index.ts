// loyalty-notify: Send Nochi notifications to customers
// Types: reward_earned, nochi_sad, nochi_tired, nochi_deathbed, birthday, random_love, feedback_request

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  return res.json()
}

async function sendTelegram(chatId: string, message: string) {
  if (!chatId || !TELEGRAM_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  })
}

// Nochi messages by state (Arabic + English)
const MESSAGES = {
  reward_earned: [
    '🎉 نوتشي يحتفل بك! 🐰\n\nلقد حصلت على مشروبك المجاني! أرِ هذه الرسالة للبارستا عند زيارتك القادمة.\n\n☕ استمتع!\n— نوتشي 🐰',
    '🎉 Nochi is celebrating you! 🐰\n\nYou earned your FREE DRINK! Show this message to the barista on your next visit.\n\n☕ Enjoy!\n— Nochi 🐰',
  ],
  nochi_sad: [
    '😢 نوتشي يفتقدك...\n\nمرّت ${days} أيام ولم تزرنا. نوتشي حزين وينتظرك ☕\n\nتعال نكمل رحلتك! لديك ${stamps} طوابع.',
    '😢 Nochi misses you...\n\n${days} days without a visit. Nochi is sad and waiting for you ☕\n\nCome back and continue your journey! You have ${stamps} stamps.',
  ],
  nochi_tired: [
    '😴 نوتشي تعبان...\n\n${days} يوم بدونك! نوتشي أصبح كبيراً في السن ولا يستطيع المشي كثيراً 🐰\n\nهل تتذكر قهوتنا اللذيذة؟ نحن نتذكرك! ☕',
    '😴 Nochi is exhausted...\n\n${days} days without you! Nochi is getting old and can barely move 🐰\n\nDo you remember our delicious coffee? We remember you! ☕',
  ],
  nochi_deathbed: [
    '🛏️ نوتشي على فراش المرض...\n\nمضت ${days} يوم! نوتشي يحتضر ويحتاجك 😢🐰\n\nفقط زيارة واحدة تنقذه! القهوة تنتظرك ☕',
    '🛏️ Nochi is on his deathbed...\n\n${days} days! Nochi is dying and needs you 😢🐰\n\nJust ONE visit can save him! Coffee is waiting ☕',
  ],
  nochi_dead: [
    '💀 نوتشي... رحل.\n\nلكن! يمكنك إحياؤه من جديد 🌟\n\nزيارة واحدة تعيد الحياة لنوتشي!\nنراك قريباً؟ ☕🐰',
    '💀 Nochi... is gone.\n\nBut! You can bring him back to life 🌟\n\nOne visit revives Nochi!\nSee you soon? ☕🐰',
  ],
  feedback_request: [
    '☕ كيف كانت زيارتك اليوم؟\n\nنوتشي يريد أن يعرف! 🐰\nأرسل تقييمك (1-5 نجوم): ⭐⭐⭐⭐⭐\n\nرأيك يهمنا كثيراً 💚',
    '☕ How was your visit today?\n\nNochi wants to know! 🐰\nSend your rating (1-5 stars): ⭐⭐⭐⭐⭐\n\nYour opinion matters to us 💚',
  ],
  birthday: [
    '🎂 عيد ميلاد سعيد ${name}! 🎉\n\nنوتشي يحتفل معك اليوم! 🐰🎈\nلديك مشروب مجاني في انتظارك كهدية عيد ميلاد!\n\nتعال واحتفل معنا ☕💚',
    '🎂 Happy Birthday ${name}! 🎉\n\nNochi is celebrating with you today! 🐰🎈\nYou have a FREE DRINK waiting as your birthday gift!\n\nCome celebrate with us ☕💚',
  ],
  random_love: [
    '🌹 نوتشي يرسل لك وردة اليوم!\n\nأنت من أهم عملائنا ونحن نقدّرك 💚\nإلى اللقاء قريباً ☕🐰',
    '😘 نوتشي يرسل لك قبلة!\n\nنحن نفكر فيك! تعال وأنعشنا بزيارتك ☕🐰',
    '✨ حكمة اليوم من نوتشي:\n\n"القهوة الجيدة تجمع الناس الطيبين"\n\nنراك قريباً! ☕🐰',
    '💙 نوتشي يفكر فيك!\n\nلأنك من أهم زبائننا، نتمنى لك يوماً رائعاً! ☕🐰',
    '🌟 ${name}، أنت نجم نوتشي اليوم!\n\nشكراً لولاءك المستمر 💚☕',
  ],
  stamp_progress: [
    '☕ طابع جديد لنوتشي! ${current}/${goal}\n\nنوتشي سعيد بزيارتك اليوم 🐰\n${remaining} طوابع للحصول على مشروبك المجاني!',
    '☕ New stamp for Nochi! ${current}/${goal}\n\nNochi is happy you visited today 🐰\n${remaining} more stamps for your FREE drink!',
  ],
}

function fillTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\${(\w+)}/g, (_, key) => String(vars[key] ?? ''))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })

  try {
    const { type, customer_id, lang = 'ar', vars = {} } = await req.json()

    if (!customer_id || !type) {
      return new Response(JSON.stringify({ error: 'customer_id and type required' }), { status: 400 })
    }

    // Get customer
    const customers = await sbGet(`loyalty_customers?id=eq.${customer_id}&limit=1`)
    const customer = customers?.[0]
    if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 404 })

    if (!customer.phone) return new Response(JSON.stringify({ error: 'No contact info' }), { status: 400 })

    const msgTemplates = MESSAGES[type as keyof typeof MESSAGES]
    if (!msgTemplates) return new Response(JSON.stringify({ error: 'Unknown notification type' }), { status: 400 })

    // Pick message (lang 0=ar, 1=en, random for love)
    let template: string
    if (type === 'random_love') {
      template = msgTemplates[Math.floor(Math.random() * msgTemplates.length)] as string
    } else {
      template = (lang === 'en' ? msgTemplates[1] : msgTemplates[0]) as string
    }

    const message = fillTemplate(template, {
      name: customer.full_name,
      stamps: customer.current_stamps,
      days: vars.days || 0,
      current: customer.current_stamps,
      goal: vars.goal || 9,
      remaining: (vars.goal || 9) - customer.current_stamps,
      ...vars,
    })

    // Send via Telegram if customer has a telegram_chat_id
    // (In Phase 1, phone = telegram_chat_id if customer registered via Telegram)
    if (customer.phone) {
      await sendTelegram(customer.phone, message)
    }

    return new Response(JSON.stringify({ success: true, message_sent: message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
