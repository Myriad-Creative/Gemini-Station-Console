"use client";
import { isMainLinkActive, MAIN_NAV_LINKS, type SectionKey } from "@components/nav-config";

export default function Nav({
  activeSection,
  onSelectSection,
}: {
  activeSection: SectionKey | null;
  onSelectSection: (section: SectionKey) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-4">
      {MAIN_NAV_LINKS.map((t) => (
        <button
          key={t.section}
          type="button"
          data-main-nav-link="true"
          data-nav-section={t.section}
          className={`text-sm ${isMainLinkActive(activeSection, t.section) ? "text-accent" : "text-white/80 hover:text-white"}`}
          onClick={() => onSelectSection(t.section)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
