import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0e27',
        foreground: '#ffffff',
        'accent-gold': '#d4af37',
        'accent-orange': '#ff6b35',
        'secondary-dark': '#1a1f3a',
      },
    },
  },
  plugins: [],
}
export default config
