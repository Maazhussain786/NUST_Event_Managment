/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Brand orange ── */
        brand: {
          50:  '#FFF8EF',
          100: '#FFEFD8',
          200: '#FFDCB0',
          300: '#FFC47D',
          400: '#FFA94E',
          500: '#FF9F43',
          600: '#E8852D',
          700: '#C26A20',
          800: '#9B541D',
          900: '#7E441B',
          950: '#44210A',
        },
        /* ── Neutral surface ── */
        surface: {
          DEFAULT: '#ffffff',
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        /* ── shadcn semantic tokens ── */
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg:   'var(--radius)',
        md:   'calc(var(--radius) - 2px)',
        sm:   'calc(var(--radius) - 4px)',
        '4xl': '2rem',
      },
      boxShadow: {
        'glow':        '0 0 40px rgba(255, 159, 67, 0.18)',
        'glow-lg':     '0 0 60px rgba(255, 159, 67, 0.28)',
        'elevation-1': '0 1px 3px rgba(0, 0, 0, 0.08)',
        'elevation-2': '0 4px 16px rgba(0, 0, 0, 0.08)',
        'elevation-3': '0 8px 30px rgba(0, 0, 0, 0.12)',
      },
      borderWidth: {
        '3': '3px',
      },
      zIndex: {
        'header':  '30',
        'nav':     '40',
        'overlay': '50',
        'modal':   '60',
        'toast':   '70',
        'offline': '100',
      },
      keyframes: {
        'slide-in-from-bottom-2': {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-top-4': {
          '0%':   { transform: 'translateY(-16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'in':             'slide-in-from-bottom-2 0.3s ease-out',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
