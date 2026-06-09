/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Clinical, calm. Teal is the single bold colour; everything else is quiet.
        ink: '#0E2A3A', // sidebar / strongest text
        canvas: '#F2F6F7', // app background
        surface: '#FFFFFF',
        primary: {
          DEFAULT: '#0F7C86',
          hover: '#0B636B',
          soft: '#E2F1F2',
        },
        body: '#16323F',
        muted: '#5C6F77',
        line: '#D9E2E6',
        // Quiz / status semantics (used heavily from Phase 5)
        success: '#157347',
        danger: '#B42318',
        warning: '#B45309',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,42,58,0.06), 0 4px 16px rgba(14,42,58,0.06)',
      },
      borderRadius: {
        xl: '0.9rem',
      },
    },
  },
  plugins: [],
};
