import type { Config } from "tailwindcss"
import brand from "./public/brand/brand-tokens.json"

// Fase M — Manual de identidad oficial "Vida Solidaria Mardel" v1.0
// (22/09/2026). Los nombres viejos (purple-deep, purple, yellow, orange,
// navy, cream) se mantienen como alias de los mismos HEX oficiales para no
// tener que reescribir cada className ya usado en /casos, /proyectos,
// /equipos, /analitica, etc. en esta misma pasada — ver PLAN_FASE_M.md.
// Los nombres nuevos (violeta, amarillo, azul, magenta, naranja, celeste,
// papel, tinta) son los que usa el código nuevo de acá en adelante.
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        violeta: brand.colors.violeta,
        amarillo: brand.colors.amarillo,
        azul: brand.colors.azul,
        magenta: brand.colors.magenta,
        naranja: brand.colors.naranja,
        celeste: brand.colors.celeste,
        papel: brand.colors.papel,
        tinta: brand.colors.tinta,

        "purple-deep": brand.colors.purpleDeep,
        purple: brand.colors.purple,
        yellow: brand.colors.yellow,
        orange: brand.colors.orange,
        navy: brand.colors.navy,
        cream: brand.colors.cream,
      },
      fontFamily: {
        display: ["Outfit", "sans-serif"],
        body: ["Work Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
