import type { Config } from "tailwindcss";

// Design tokens for the CSMJU brand system (ui-design-system.md v1.3.0 —
// presentation/visual sections only; see frontend README note in the PR
// description for which parts of that spec were intentionally NOT
// implemented, i.e. the API Gateway / auth-header sections, which are
// stale for this specific backend).
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F8F9FA",
        foreground: "#191C1D",

        "primary-container": "#2154D9",
        primary: "#003CB4",
        "primary-fixed": "#DCE1FF",
        "on-primary-container": "#D2DAFF",
        "on-primary": "#FFFFFF",

        secondary: "#4E5D87",
        accent: "#3B80F2",
        "brand-navy": "#16264D",
        "brand-blue": "#0D4FA8",
        "brand-amber": "#F59E0B",

        success: "#10B981",
        error: "#BA1A1A",
        "error-container": "#FFDAD6",
        "on-error-container": "#93000A",

        surface: "#F8F9FA",
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F3F4F5",
        "surface-container": "#EDEEEF",
        "surface-container-high": "#E7E8E9",
        "surface-container-highest": "#E1E3E4",
        "surface-variant": "#E1E3E4",
        "surface-dim": "#D9DADB",

        "on-surface": "#191C1D",
        "on-surface-variant": "#434654",

        outline: "#747686",
        "outline-variant": "#C4C5D7",
      },
      fontFamily: {
        display: ["var(--font-jakarta)", "var(--font-noto-thai)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-noto-thai)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "1.2", fontWeight: "800", letterSpacing: "-0.02em" }],
        "headline-lg": ["32px", { lineHeight: "1.3", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "1.2", fontWeight: "600", letterSpacing: "0.01em" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "600" }],
        caption: ["12px", { lineHeight: "1.2", fontWeight: "400" }],
      },
      borderRadius: {
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
        xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.08)",
      },
      screens: {
        md: "768px",
      },
    },
  },
  plugins: [],
};
export default config;
