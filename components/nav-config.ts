export type NavLink = {
  href: string;
  label: string;
  aliases?: string[];
  newTab?: boolean;
};

export type SectionKey = "dashboard" | "missions" | "combat" | "inventory" | "world" | "comms" | "reports" | "settings";

export type MainNavLink = {
  section: SectionKey;
  label: string;
};

export const MAIN_NAV_LINKS: MainNavLink[] = [
  { section: "dashboard", label: "Dashboard" },
  { section: "missions", label: "Missions" },
  { section: "combat", label: "Combat" },
  { section: "inventory", label: "Inventory" },
  { section: "world", label: "World Data" },
  { section: "comms", label: "Comms" },
  { section: "reports", label: "Reports" },
  { section: "settings", label: "Settings" },
];

const DASHBOARD_SECTION_LINKS: NavLink[] = [{ href: "/", label: "Dashboard" }];

const MISSION_SECTION_LINKS: NavLink[] = [
  { href: "/missions", label: "Missions Dashboard" },
  { href: "/missions/explorer", label: "Explorer" },
  { href: "/missions/lab", label: "Lab", aliases: ["/mission-lab"] },
  { href: "/missions/creator", label: "Creator" },
];

const COMBAT_SECTION_LINKS: NavLink[] = [
  { href: "/mob-lab", label: "Mob Lab" },
  { href: "/data/ai", label: "AI JSON" },
  { href: "/abilities", label: "Abilities Dashboard" },
  { href: "/abilities/manager", label: "Abilities" },
  { href: "/abilities/bulk", label: "Bulk Edit" },
  { href: "/abilities/status-effects", label: "Status Effects" },
  { href: "/abilities/talents", label: "Talents" },
];

const INVENTORY_SECTION_LINKS: NavLink[] = [
  { href: "/items", label: "Items Dashboard" },
  { href: "/items/explorer", label: "Item Explorer" },
  { href: "/items/manager", label: "Item Manager" },
  { href: "/mods", label: "Mods Dashboard" },
  { href: "/mods/explorer", label: "Mod Explorer" },
  { href: "/mods/manager", label: "Mod Manager", aliases: ["/authoring", "/mods/builder"] },
  { href: "/merchant-lab", label: "Merchant Profiles" },
];

const WORLD_SECTION_LINKS: NavLink[] = [
  { href: "/data", label: "Data Dashboard" },
  { href: "/data/map", label: "Map Data" },
  { href: "/data/zones", label: "Zones" },
  { href: "/data/routes", label: "Trade Routes" },
  { href: "/data/asteroid-belt-gates", label: "Belt Gates" },
  { href: "/data/systems", label: "Systems" },
  { href: "/data/tutorial", label: "Tutorial" },
];

const SETTINGS_SECTION_LINKS: NavLink[] = [{ href: "/settings", label: "Settings Dashboard" }];

const COMMS_SECTION_LINKS: NavLink[] = [{ href: "/comms", label: "Comms" }];

const REPORT_SECTION_LINKS: NavLink[] = [
  { href: "/reports/holes", label: "Holes" },
  { href: "/reports/outliers", label: "Outliers" },
];

const SECTION_DASHBOARD_HREFS = new Set(["/", "/missions", "/mods", "/abilities", "/items", "/data", "/settings"]);

export function getActiveSection(pathname: string | null | undefined): SectionKey | null {
  if (!pathname) return null;

  if (pathname === "/") {
    return "dashboard";
  }

  if (pathname === "/mission-lab" || pathname === "/missions" || pathname.startsWith("/missions/")) {
    return "missions";
  }

  if (pathname === "/mob-lab" || pathname === "/data/ai" || pathname.startsWith("/data/ai/")) {
    return "combat";
  }

  if (pathname === "/abilities" || pathname.startsWith("/abilities/")) {
    return "combat";
  }

  if (pathname === "/authoring" || pathname === "/mods" || pathname.startsWith("/mods/")) {
    return "inventory";
  }

  if (pathname === "/items" || pathname.startsWith("/items/")) {
    return "inventory";
  }

  if (pathname === "/merchant-lab") {
    return "inventory";
  }

  if (pathname === "/data" || pathname.startsWith("/data/")) {
    return "world";
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }

  if (pathname === "/comms") {
    return "comms";
  }

  if (pathname.startsWith("/reports/")) {
    return "reports";
  }

  return null;
}

export function getSectionLinksForSection(section: SectionKey | null | undefined): NavLink[] {
  if (section === "dashboard") return DASHBOARD_SECTION_LINKS;
  if (section === "missions") return MISSION_SECTION_LINKS;
  if (section === "combat") return COMBAT_SECTION_LINKS;
  if (section === "inventory") return INVENTORY_SECTION_LINKS;
  if (section === "world") return WORLD_SECTION_LINKS;
  if (section === "settings") return SETTINGS_SECTION_LINKS;
  if (section === "comms") return COMMS_SECTION_LINKS;
  if (section === "reports") return REPORT_SECTION_LINKS;
  return [];
}

export function getSectionLinks(pathname: string | null | undefined): NavLink[] {
  return getSectionLinksForSection(getActiveSection(pathname));
}

export function isMainLinkActive(activeSection: SectionKey | null | undefined, section: SectionKey) {
  return activeSection === section;
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
