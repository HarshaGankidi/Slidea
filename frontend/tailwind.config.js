export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        secondary: '#ec4899',
        accent: '#f59e0b',
        darkBg: '#1f2937',
        lightBg: '#f9fafb',
      },
      backgroundImage: {
        'gradient-1': 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
      }
    },
  },
  plugins: [],
}
