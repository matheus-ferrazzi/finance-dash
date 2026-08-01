import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a0b0d',
        surface: '#121418',
        'surface-2': '#1a1d22',
        'surface-3': '#22262d',
        border: '#282d35',
        line: '#2f353e',
        text: '#e9ecf1',
        muted: '#8b93a1',
        faint: '#5c636e',
        accent: '#2ee6a0',      // verde menta (receita/positivo)
        'accent-dim': '#1f9d74',
        despesa: '#ff6b6b',     // coral (gasto)
        warn: '#f5b642',        // âmbar
        matheus: '#f0932b',     // laranja
        ariane: '#ec5f9e',      // rosa
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.25)',
        glow: '0 0 0 1px rgba(46,230,160,.18), 0 6px 24px rgba(46,230,160,.08)',
      },
    },
  },
  plugins: [],
};

export default config;
