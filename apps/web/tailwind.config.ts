import type { Config } from "tailwindcss"
import brand from "./public/brand/brand-tokens.json"

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "purple-deep": brand.colors.purpleDeep,
        purple: brand.colors.purple,
        magenta: brand.colors.magenta,
        yellow: brand.colors.yellow,
        orange: brand.colors.orange,
        navy: brand.colors.navy,
        cream: brand.colors.cream,
      },
      fontFamily: {
        display: ["Baloo 2", "sans-serif"],
        body: ["Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
