"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Nav from "@components/Nav";
import SectionNav from "@components/SectionNav";
import { getActiveSection, type SectionKey } from "@components/nav-config";

export default function NavigationHeader({ version }: { version: string }) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<SectionKey | null>(() => getActiveSection(pathname) ?? "dashboard");

  useEffect(() => {
    const routeSection = getActiveSection(pathname);
    if (routeSection) setActiveSection(routeSection);
  }, [pathname]);

  return (
    <div className="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-x-12 gap-y-3">
      <Link href="/" className="font-semibold">
        Gemini Balance Console <span className="text-white/50 text-xs align-top">v{version}</span>
      </Link>
      <Nav activeSection={activeSection} onSelectSection={setActiveSection} />
      <Link
        href="/data/system-map"
        target="_blank"
        rel="noreferrer"
        className="justify-self-end rounded border border-sky-400/80 px-3 py-1.5 text-sm font-semibold text-sky-300 transition hover:border-sky-300 hover:bg-sky-400/10 hover:text-sky-200"
      >
        System Map
      </Link>
      <div className="col-span-3 border-t border-white/10" />
      <div aria-hidden="true" />
      <div className="col-span-2 min-w-0">
        <SectionNav activeSection={activeSection} />
      </div>
    </div>
  );
}
