"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { EmberMark } from "@/components/ember-mark";

const links = [
  ["/", "Journey"],
  ["/atlas", "Atlas"],
  ["/history", "History"],
  ["/data", "Data Lab"],
  ["/sourcebook", "Sourcebook"],
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <Link className="brand-lockup" href="/" aria-label="Restless Pacific home" onClick={() => setOpen(false)}>
        <EmberMark className="brand-mark" />
        <span>
          Restless <i>Pacific</i>
        </span>
      </Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {label}
          </Link>
        ))}
      </nav>
      <button
        className="menu-button"
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav
        id="mobile-navigation"
        className="mobile-nav"
        aria-label="Mobile navigation"
        aria-hidden={!open}
        data-open={open}
        inert={!open}
      >
        {links.map(([href, label], index) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <span>0{index + 1}</span>
            {label}
          </Link>
        ))}
        <p>Science as a landscape, not an alarm.</p>
      </nav>
    </header>
  );
}
