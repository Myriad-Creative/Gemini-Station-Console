export type NavLink = {
  href: string;
  label: string;
  aliases?: string[];
};

export const MAIN_NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard" },
  { href: "/mods", label: "Mods" },
  { href: "/items", label: "Items" },
  { href: "/missions", label: "Missions" },
  { href: "/mob-lab", label: "Mobs" },
  { href: "/merchant-lab", label: "Merchant Profiles" },
  { href: "/comms", label: "Comms" },
  { href: "/reports/holes", label: "Holes" },
  { href: "/reports/outliers", label: "Outliers" },
  { href: "/settings", label: "Settings" },
];

const MISSION_SECTION_LINKS: NavLink[] = [
  { href: "/missions", label: "Missions Dashboard" },
  { href: "/missions/explorer", label: "Explorer" },
  { href: "/missions/lab", label: "Lab", aliases: ["/mission-lab"] },
  { href: "/missions/creator", label: "Creator" },
];

const MOD_SECTION_LINKS: NavLink[] = [
  { href: "/mods", label: "Mods Dashboard" },
  { href: "/mods/explorer", label: "Explorer" },
  { href: "/mods/builder", label: "Builder", aliases: ["/authoring"] },
];

export function getActiveSection(pathname: string | null | undefined): "missions" | "mods" | null {
  if (!pathname) return null;

  if (pathname === "/mission-lab" || pathname === "/missions" || pathname.startsWith("/missions/")) {
    return "missions";
  }

  if (pathname === "/authoring" || pathname === "/mods" || pathname.startsWith("/mods/")) {
    return "mods";
  }

  return null;
}

export function getSectionLinks(pathname: string | null | undefined): NavLink[] {
  const section = getActiveSection(pathname);
  if (section === "missions") return MISSION_SECTION_LINKS;
  if (section === "mods") return MOD_SECTION_LINKS;
  return [];
}

export function getSectionAnchorHref(pathname: string | null | undefined) {
  const section = getActiveSection(pathname);
  if (section === "missions") return "/missions";
  if (section === "mods") return "/mods";
  return null;
}

export function isMainLinkActive(pathname: string | null | undefined, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/missions") return getActiveSection(pathname) === "missions";
  if (href === "/mods") return getActiveSection(pathname) === "mods";
  return pathname === href || pathname?.startsWith(`${href}/`) || false;
}

export function isSectionLinkActive(pathname: string | null | undefined, link: NavLink) {
  if (!pathname) return false;
  if (pathname === link.href || pathname.startsWith(`${link.href}/`)) return true;
  return (link.aliases ?? []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}
