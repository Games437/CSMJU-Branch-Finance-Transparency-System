import type { Metadata } from "next";
import { Noto_Serif_Thai, IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { DevAuthProvider } from "@/lib/dev-auth";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";

// Three-font system for the "passbook" concept:
// - display (Noto Serif Thai): headings, balance figures — evokes the
//   printed serif numerals in an actual bank passbook
// - sans (IBM Plex Sans Thai): body text, UI labels
// - mono (IBM Plex Mono): tabular numeric data (transaction amounts,
//   dates) where digit alignment in a table matters
const notoSerifThai = Noto_Serif_Thai({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-noto-serif-thai",
});
const plexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans-thai",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "CSMJU Branch Finance Transparency System",
  description: "ระบบตรวจสอบและความโปร่งใสทางการเงินของสาขา CSMJU",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${notoSerifThai.variable} ${plexSansThai.variable} ${plexMono.variable} bg-paper text-ink font-sans antialiased`}
      >
        <DevAuthProvider>
          <DevRoleSwitcher />
          {children}
        </DevAuthProvider>
      </body>
    </html>
  );
}
