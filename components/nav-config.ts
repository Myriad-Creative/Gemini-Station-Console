export type NavLink = {
  href: string;
  label: string;
  aliases?: string[];
};

export const MAIN_NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard" },
  { href: "/mods", label: "Mods" },
  { href: "/abilities", label: "Abilities" },
  { href: "/items", label: "Items" },
  { href: "/missions", label: "Missions" },
  { href: "/mob-lab", label: "Mobs" },
  { href: "/merchant-lab", label: "Merchant Profiles" },
  { href: "/comms", label: "Comms" },
  { href: "/data", label: "Data" },
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
  { href: "/mods/manager", label: "Manager", aliases: ["/authoring", "/mods/builder"] },
];

const ABILITY_SECTION_LINKS: NavLink[] = [
  { href: "/abilities", label: "Abilities Dashboard" },
  { href: "/abilities/manager", label: "Abilities" },
  { href: "/abilities/bulk", label: "Bulk Edit" },
  { href: "/abilities/status-effects", label: "Status Effects" },
];

const ITEM_SECTION_LINKS: NavLink[] = [
  { href: "/items", label: "Items Dashboard" },
  { href: "/items/explorer", label: "Explorer" },
  { href: "/items/manager", label: "Manager" },
];

const DATA_SECTION_LINKS: NavLink[] = [
  { href: "/data", label: "Data Dashboard" },
  { href: "/data/map", label: "Map" },
  { href: "/data/routes", label: "Routes" },
  { href: "/data/tutorial", label: "Tutorial" },
  { href: "/data/zones", label: "Zones" },
  { href: "/data/systems", label: "Systems" },
];

const SETTINGS_SECTION_LINKS: NavLink[] = [{ href: "/settings", label: "Settings Dashboard" }];

const SECTION_DASHBOARD_HREFS = new Set(["/missions", "/mods", "/abilities", "/items", "/data", "/settings"]);

export function getActiveSection(pathname: string | null | undefined): "missions" | "mods" | "abilities" | "items" | "data" | "settings" | null {
  if (!pathname) return null;

  if (pathname === "/mission-lab" || pathname === "/missions" || pathname.startsWith("/missions/")) {
    return "missions";
  }

  if (pathname === "/authoring" || pathname === "/mods" || pathname.startsWith("/mods/")) {
    return "mods";
  }

  if (pathname === "/abilities" || pathname.startsWith("/abilities/")) {
    return "abilities";
  }

  if (pathname === "/items" || pathname.startsWith("/items/")) {
    return "items";
  }

  if (pathname === "/data" || pathname.startsWith("/data/")) {
    return "data";
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }

  return null;
}

export function getSectionLinks(pathname: string | null | undefined): NavLink[] {
  const section = getActiveSection(pathname);
  if (section === "missions") return MISSION_SECTION_LINKS;
  if (section === "mods") return MOD_SECTION_LINKS;
  if (section === "abilities") return ABILITY_SECTION_LINKS;
  if (section === "items") return ITEM_SECTION_LINKS;
  if (section === "data") return DATA_SECTION_LINKS;
  if (section === "settings") return SETTINGS_SECTION_LINKS;
  return [];
}

export function isMainLinkActive(pathname: string | null | undefined, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/missions") return getActiveSection(pathname) === "missions";
  if (href === "/mods") return getActiveSection(pathname) === "mods";
  if (href === "/abilities") return getActiveSection(pathname) === "abilities";
  if (href === "/items") return getActiveSection(pathname) === "items";
  if (href === "/data") return getActiveSection(pathname) === "data";
  if (href === "/settings") return getActiveSection(pathname) === "settings";
  return pathname === href || pathname?.startsWith(`${href}/`) || false;
}

export function isSectionLinkActive(pathname: string | null | undefined, link: NavLink) {
  if (!pathname) return false;
  if (SECTION_DASHBOARD_HREFS.has(link.href)) {
    if (pathname === link.href) return true;
  } else if (pathname === link.href || pathname.startsWith(`${link.href}/`)) {
    return true;
  }
  return (link.aliases ?? []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}
