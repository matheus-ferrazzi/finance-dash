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
        accent: '#4fd6a4',      // verde menta (receita/positivo) — dessaturado no acabamento de 15/10 (era #2ee6a0)
        'accent-dim': '#1f9d74',
        despesa: '#ff6b6b',     // coral (gasto)
        warn: '#f5b642',        // âmbar
        matheus: '#f0932b',     // laranja
        ariane: '#ec5f9e',      // rosa
      },
      fontFamily: {
        // Manrope via next/font (layout.tsx); o resto é o fallback enquanto carrega
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        // sombra tingida do fundo (não preto puro) + 1px de luz em cima: a borda do card fica mais suave
        card: 'inset 0 1px 0 rgba(233,236,241,.035), 0 1px 2px rgba(2,6,10,.55), 0 10px 28px -12px rgba(2,10,16,.75)',
        glow: '0 0 0 1px rgba(79,214,164,.18), 0 6px 24px rgba(79,214,164,.08)',
      },
    },
  },
  plugins: [],
};

export default config;
