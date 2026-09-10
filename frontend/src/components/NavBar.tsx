"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "ภาพรวม" },
  { href: "/expenses", label: "รายการเบิกจ่าย (เหรัญญิก)" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-paperLine bg-white px-4 py-2">
      <div className="mx-auto flex max-w-5xl gap-4">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm ${
              pathname === link.href ? "font-semibold text-jade" : "text-inkFaint hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
