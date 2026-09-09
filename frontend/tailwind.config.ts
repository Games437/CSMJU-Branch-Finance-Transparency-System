import type { Config } from "tailwindcss";

// Design tokens for the "passbook" concept: CSMJU-BFTS is a bank-passbook
// metaphor for branch financial transparency. Deliberately NOT the
// warm-cream+terracotta combination common in generated UI — paper is
// cooler/greyer, and the accent trio (jade/brass/rust) carries meaning
// (approved/pending/void) rather than being decorative.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        paper: "#EFF1ED",
        paperLine: "#D7D9D0",
        ink: "#1B2A4A",
        inkFaint: "#4A567A",
        jade: "#3D6B5C",
        jadeSoft: "#E4ECE8",
        brass: "#B8863B",
        brassSoft: "#F3E9D6",
        rust: "#86423A",
        rustSoft: "#F1E1DE",
      },
      fontFamily: {
        display: ["var(--font-noto-serif-thai)", "serif"],
        sans: ["var(--font-plex-sans-thai)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        passbook: "2px 10px 2px 2px", // asymmetric — evokes a passbook cover corner, not a uniform SaaS-card radius
      },
    },
  },
  plugins: [],
};
export default config;
