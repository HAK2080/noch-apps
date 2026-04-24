/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Cairo', 'sans-serif'],
        display: ['Space Grotesk', 'Outfit', 'sans-serif'],
        arabic: ['Cairo', 'sans-serif'],
      },
      colors: {
        noch: {
          green: '#4ADE80',
          'green-dim': '#22C55E',
          dark: '#09090B',
          surface: '#0F1013',
          card: '#131318',
          'card-hover': '#1A1A22',
          border: '#1E2030',
          'border-bright': '#2D3050',
          muted: '#71717A',
          subtle: '#3F3F46',
        }
      },
      backgroundImage: {
        'gradient-sidebar': 'linear-gradient(180deg, #0F1013 0%, #09090B 100%)',
        'gradient-green': 'linear-gradient(135deg, #4ADE80 0%, #22C55E 100%)',
      },
      boxShadow: {
        'green-glow': '0 0 20px rgba(74, 222, 128, 0.12)',
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
