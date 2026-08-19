// tailwind.config.ts
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6', // blue-500
        secondary: '#f59e0b', // amber-500
        accent: '#10b981', // emerald-500
        background: '#f3f4f6', // gray-100
        text: '#111827', // gray-900,
        docBg: '#ffffff',
        pageBg: '#f9fbfd',
        toolbarBg: '#fafafa',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Merriweather', 'serif'],
      },
    },
  },
  plugins: [],
}
