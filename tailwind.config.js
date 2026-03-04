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
        'glow': '0 0 40px rgba(255, 159, 67, 0.18)',
        'glow-lg': '0 0 60px rgba(255, 159, 67, 0.28)',
        'card-light': '0 2px 20px rgba(0, 0, 0, 0.06)',
        'card-dark': '0 2px 20px rgba(0, 0, 0, 0.4)',
        'nav-light': '0 -4px 30px rgba(0, 0, 0, 0.08)',
        'nav-dark': '0 -4px 30px rgba(0, 0, 0, 0.5)',
      },
      borderWidth: {
        '3': '3px',
      },
      keyframes: {
        'slide-in-from-bottom-2': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-top-4': {
          '0%': { transform: 'translateY(-16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'in': 'slide-in-from-bottom-2 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
