/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        /* Remapped for Lab Settings app themes (see styles/appThemes.css) */
        stone: {
          50: "rgb(var(--color-stone-50) / <alpha-value>)",
          100: "rgb(var(--color-stone-100) / <alpha-value>)",
          200: "rgb(var(--color-stone-200) / <alpha-value>)",
          300: "rgb(var(--color-stone-300) / <alpha-value>)",
          400: "rgb(var(--color-stone-400) / <alpha-value>)",
          500: "rgb(var(--color-stone-500) / <alpha-value>)",
          600: "rgb(var(--color-stone-600) / <alpha-value>)",
          700: "rgb(var(--color-stone-700) / <alpha-value>)",
          800: "rgb(var(--color-stone-800) / <alpha-value>)",
          900: "rgb(var(--color-stone-900) / <alpha-value>)",
          950: "rgb(var(--color-stone-950) / <alpha-value>)",
        },
        amber: {
          50: "rgb(var(--color-amber-50) / <alpha-value>)",
          100: "rgb(var(--color-amber-100) / <alpha-value>)",
          200: "rgb(var(--color-amber-200) / <alpha-value>)",
          300: "rgb(var(--color-amber-300) / <alpha-value>)",
          400: "rgb(var(--color-amber-400) / <alpha-value>)",
          500: "rgb(var(--color-amber-500) / <alpha-value>)",
          600: "rgb(var(--color-amber-600) / <alpha-value>)",
          700: "rgb(var(--color-amber-700) / <alpha-value>)",
          800: "rgb(var(--color-amber-800) / <alpha-value>)",
          900: "rgb(var(--color-amber-900) / <alpha-value>)",
          950: "rgb(var(--color-amber-950) / <alpha-value>)",
        },
        "lims-paper": "rgb(var(--lims-paper) / <alpha-value>)",
        lab: {
          50:  "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7dc8fb",
          400: "#38aaf4",
          500: "#0e8fe1",
          600: "#0270bf",
          700: "#035a9b",
          800: "#074d80",
          900: "#0c416a",
          950: "#082947",
        },
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)",
        card: "0 4px 6px -1px rgb(15 23 42 / 0.05), 0 2px 4px -2px rgb(37 99 235 / 0.06)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
        jakarta: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "retention-due-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "retention-due-blink": "retention-due-blink 1.15s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
