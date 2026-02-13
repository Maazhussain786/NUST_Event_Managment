/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow': '0 0 40px rgba(249, 115, 22, 0.15)',
        'glow-lg': '0 0 60px rgba(249, 115, 22, 0.25)',
        'card-light': '0 2px 20px rgba(0, 0, 0, 0.06)',
        'card-dark': '0 2px 20px rgba(0, 0, 0, 0.4)',
        'nav-light': '0 -4px 30px rgba(0, 0, 0, 0.08)',
        'nav-dark': '0 -4px 30px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
