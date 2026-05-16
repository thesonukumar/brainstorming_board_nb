import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      backgroundImage: {
        'board-gradient': 'linear-gradient(135deg, #0f766e 0%, #064e3b 100%)',
      }
    },
  },
  plugins: [],
} satisfies Config
