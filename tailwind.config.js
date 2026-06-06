/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          accent:    "#e8e8e8",   // near-white — matches ibrastream.vercel.app
          accentDark:"#b0b0b0",
          darkBg:    "#0f0f0f",   // pure near-black background
          cardBg:    "rgba(22, 22, 22, 0.85)",
          glassBg:   "rgba(18, 18, 18, 0.80)",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':  'spin 12s linear infinite',
        'shine':      'shine 4s linear infinite',
        'fadeIn':     'fadeIn 0.3s ease',
        'slideUp':    'slideUp 0.35s cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        shine: {
          '0%':   { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      }
    },
  },
  plugins: [],
}
