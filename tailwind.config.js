/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: {
          850: '#202022',
          900: '#18181b',
          950: '#09090b',
        }
      }
    },
  },
  plugins: [],
}
