// NochiBunny — The mascot component with emotional states
// Uses individual PNG assets for each emotional state
// States: happy, sad, tired, deathbed, dead

let stateImages = {}
try {
  stateImages = {
    happy: new URL('../../../assets/nochi-happy.svg', import.meta.url).href,
    sad: new URL('../../../assets/nochi-sad.png', import.meta.url).href,
    tired: new URL('../../../assets/nochi-tired.png', import.meta.url).href,
    deathbed: new URL('../../../assets/nochi-deathbed.png', import.meta.url).href,
    dead: new URL('../../../assets/nochi-dead.png', import.meta.url).href,
  }
} catch {
  stateImages = {}
}

const STATE_CONFIG = {
  happy: {
    label: 'نوتشي سعيد!',
    labelEn: 'Nochi is happy!',
    animation: 'animate-bounce',
    bg: 'bg-green-500/10 border-green-500/30',
    message: '',
    messageEn: '',
  },
  sad: {
    label: 'نوتشي يفتقدك',
    labelEn: 'Nochi misses you',
    animation: 'animate-pulse',
    bg: 'bg-blue-500/10 border-blue-500/30',
    message: 'يافريق! عميل يفتقده نوتشي',
    messageEn: 'This customer hasn\'t visited in a while',
  },
  tired: {
    label: 'نوتشي تعبان',
    labelEn: 'Nochi is tired',
    animation: '',
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    message: 'طال غياب هذا العميل!',
    messageEn: 'This customer has been away too long!',
  },
  deathbed: {
    label: 'نوتشي على فراش المرض',
    labelEn: 'Nochi is on his deathbed',
    animation: 'animate-pulse',
    bg: 'bg-orange-500/10 border-orange-500/30',
    message: 'نوتشي يحتضر! تواصل مع هذا العميل الآن',
    messageEn: 'Nochi is dying! Reach out to this customer NOW',
  },
  dead: {
    label: 'نوتشي... رحل',
    labelEn: 'Nochi is gone',
    animation: '',
    bg: 'bg-red-500/10 border-red-500/30',
    message: 'هذا العميل فقدناه. حاول استعادته!',
    messageEn: 'This customer is lost. Try to win them back!',
  },
}

export default function NochiBunny({ state = 'happy', size = 'md', showLabel = true, lang = 'ar' }) {
  const config = STATE_CONFIG[state] || STATE_CONFIG.happy

  const sizes = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-36 h-36',
    xl: 'w-48 h-48',
  }

  const imageUrl = stateImages[state]

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${sizes[size]} rounded-full flex items-center justify-center border ${config.bg} transition-all duration-500 overflow-hidden`}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Nochi ${state}`}
            className={`w-full h-full object-cover transition-all duration-500 ${config.animation}`}
          />
        ) : (
          <span className={`text-4xl ${config.animation}`}>🐰</span>
        )}
      </div>

      {showLabel && (
        <div className="text-center">
          <p className="text-sm font-medium text-white">
            {lang === 'ar' ? config.label : config.labelEn}
          </p>
          {config.message && (
            <p className="text-xs text-noch-muted mt-0.5">
              {lang === 'ar' ? config.message : config.messageEn}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
