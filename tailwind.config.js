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
          50:  '#FFF8F0',
          100: '#FFF0DB',
          200: '#FFE0B8',
          300: '#FFCB8A',
          400: '#FFB462',
          500: '#FF9F43',
          600: '#F08C2D',
          700: '#CC7420',
          800: '#A35C1A',
          900: '#7A4516',
          950: '#3D200A',
        },
        /* ── Neutral surface ── */
        surface: {
          DEFAULT: '#ffffff',
          50:  '#FAFAF9',
          100: '#F5F5F3',
          200: '#EAEAE7',
          300: '#D6D6D2',
          400: '#A8A8A3',
          500: '#737370',
          600: '#52524F',
          700: '#3D3D3B',
          800: '#282826',
          900: '#1A1A18',
          950: '#0D0D0C',
        },
        /* ── Status colors ── */
        status: {
          success:    'hsl(var(--status-success))',
          'success-bg': 'hsl(var(--status-success-bg))',
          warning:    'hsl(var(--status-warning))',
          'warning-bg': 'hsl(var(--status-warning-bg))',
          error:      'hsl(var(--status-error))',
          'error-bg': 'hsl(var(--status-error-bg))',
          info:       'hsl(var(--status-info))',
          'info-bg':  'hsl(var(--status-info-bg))',
          purple:     'hsl(var(--status-purple))',
          'purple-bg': 'hsl(var(--status-purple-bg))',
          live:       'hsl(var(--status-live))',
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
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        lg:    'var(--radius)',
        md:    'calc(var(--radius) - 2px)',
        sm:    'calc(var(--radius) - 4px)',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'glow':        '0 0 40px rgba(255, 159, 67, 0.15)',
        'glow-lg':     '0 0 60px rgba(255, 159, 67, 0.25)',
        'glow-sm':     '0 0 20px rgba(255, 159, 67, 0.12)',
        'elevation-1': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
        'elevation-2': '0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06)',
        'elevation-3': '0 8px 24px rgba(0, 0, 0, 0.06), 0 16px 32px rgba(0, 0, 0, 0.08)',
        'inner-glow':  'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
      borderWidth: {
        '3': '3px',
      },
      spacing: {
        '4.5':  '1.125rem',
        '13':   '3.25rem',
        '15':   '3.75rem',
        '18':   '4.5rem',
        '22':   '5.5rem',
        'safe': 'env(safe-area-inset-bottom, 0px)',
        'sidebar': '15rem', /* 240px desktop sidebar */
      },
      zIndex: {
        'header':  '30',
        'nav':     '40',
        'overlay': '50',
        'modal':   '60',
        'toast':   '70',
        'offline': '100',
      },
      backdropBlur: {
        '3xl': '64px',
      },
      screens: {
        'xs': '475px',
      },
      keyframes: {
        'slide-up': {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%':   { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%':   { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'in':              'slide-up 0.3s ease-out',
        'fade':            'fade-in 0.2s ease-out',
        'scale':           'scale-in 0.2s ease-out',
        'accordion-down':  'accordion-down 0.2s ease-out',
        'accordion-up':    'accordion-up 0.2s ease-out',
        'shimmer':         'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
