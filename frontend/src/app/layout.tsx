import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { DevAuthProvider } from "@/lib/dev-auth";
import { CsmjuAppShell } from "@/components/csmju/CsmjuAppShell";

// CSMJU brand system fonts (ui-design-system.md v1.3.0 typography spec),
// self-hosted at build via next/font/google (no CDN <link>).
// - font-display: Plus Jakarta Sans, with Noto Sans Thai appended as
//   fallback since Plus Jakarta Sans has no Thai glyphs — Thai headings
//   would otherwise silently fall back to the system font.
// - font-body (default body font): Noto Sans Thai.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-jakarta",
});
const notoThai = Noto_Sans_Thai({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-thai",
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
      <body className={`${jakarta.variable} ${notoThai.variable} bg-surface text-on-surface font-sans antialiased`}>
        <DevAuthProvider>
          <CsmjuAppShell>{children}</CsmjuAppShell>
        </DevAuthProvider>
      </body>
    </html>
  );
}
