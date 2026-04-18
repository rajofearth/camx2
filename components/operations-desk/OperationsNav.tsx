"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/operations", label: "Operations" },
  { href: "/", label: "Detect" },
  { href: "/chat", label: "Chat" },
];

export function OperationsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Application"
      className="mb-4 flex flex-wrap justify-center gap-3"
    >
      {navItems.map((item) => {
        const isActive =
          item.href === "/operations"
            ? pathname === "/operations"
            : item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-inherit no-underline transition-colors hover:bg-white/5"
            style={{
              backgroundColor: isActive
                ? "rgba(255, 255, 255, 0.08)"
                : "transparent",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
