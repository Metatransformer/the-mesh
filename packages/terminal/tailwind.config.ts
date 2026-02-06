import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        mesh: {
          bg: '#0a0a0f',
          surface: '#12121a',
          border: '#1e1e2e',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          text: '#e2e8f0',
          muted: '#64748b',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
        neon: {
          void: '#050510',
          cyan: '#00f0ff',
          magenta: '#ff00ff',
          'neon-blue': '#4060ff',
          grid: '#00f0ff',
          'grid-dim': '#003844',
          text: '#e0e0ff',
          surface: '#0a0a1a',
          glow: '#00f0ff',
        },
      },
    },
  },
  plugins: [],
};

export default config;
