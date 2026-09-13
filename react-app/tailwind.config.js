/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '.theme-night'],
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
};
