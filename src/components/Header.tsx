"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminKey } from "@/lib/useAdminKey";

const LINKS = [
  { href: "/", label: "Vagas" },
  { href: "/favoritos", label: "Favoritos" },
];

export function Header() {
  const pathname = usePathname();
  const adminKey = useAdminKey();
  const links = adminKey ? [...LINKS, { href: "/fontes", label: "Fontes" }] : LINKS;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-bold text-slate-900">
          Vagas<span className="text-emerald-600">Hub</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 transition ${
                  active ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
