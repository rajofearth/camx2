"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Detect" },
  { href: "/chat", label: "Chat with footage" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "12px",
        flexWrap: "wrap",
        marginBottom: "18px",
      }}
    >
      {navItems.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              backgroundColor: isActive
                ? "rgba(255, 255, 255, 0.08)"
                : "transparent",
              color: "inherit",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
