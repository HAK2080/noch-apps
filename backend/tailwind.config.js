/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        noch: {
          green: '#4ADE80',
          dark: '#0A0A0A',
          card: '#141414',
          border: '#242424',
          muted: '#6B7280',
        }
      },
    },
  },
  plugins: [],
}
