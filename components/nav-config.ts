export type NavLink = {
  href: string;
  label: string;
  aliases?: string[];
  newTab?: boolean;
};

export type SectionKey = "dashboard" | "mods" | "abilities" | "items" | "missions" | "mobs" | "merchant" | "comms" | "data" | "reports" | "settings";

export type MainNavLink = {
  section: SectionKey;
  label: string;
};

export const MAIN_NAV_LINKS: MainNavLink[] = [
  { section: "dashboard", label: "Dashboard" },
  { section: "mods", label: "Mods" },
  { section: "abilities", label: "Abilities" },
  { section: "items", label: "Items" },
  { section: "missions", label: "Missions" },
  { section: "mobs", label: "Mobs" },
  { section: "merchant", label: "Merchant Profiles" },
  { section: "comms", label: "Comms" },
  { section: "data", label: "Data" },
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
  { href: "/abilities/talents", label: "Talents" },
];

const ITEM_SECTION_LINKS: NavLink[] = [
  { href: "/items", label: "Items Dashboard" },
  { href: "/items/explorer", label: "Explorer" },
  { href: "/items/manager", label: "Manager" },
];

const DATA_SECTION_LINKS: NavLink[] = [
  { href: "/data", label: "Data Dashboard" },
  { href: "/data/map", label: "Map" },
  { href: "/data/system-map", label: "System Map", newTab: true },
  { href: "/data/routes", label: "Routes" },
  { href: "/data/tutorial", label: "Tutorial" },
  { href: "/data/zones", label: "Zones" },
  { href: "/data/ai", label: "AI JSON" },
  { href: "/data/asteroid-belt-gates", label: "Belt Gates" },
  { href: "/data/systems", label: "Systems" },
];

const SETTINGS_SECTION_LINKS: NavLink[] = [{ href: "/settings", label: "Settings Dashboard" }];

const MOB_SECTION_LINKS: NavLink[] = [{ href: "/mob-lab", label: "Mob Lab" }];

const MERCHANT_SECTION_LINKS: NavLink[] = [{ href: "/merchant-lab", label: "Merchant Profiles" }];

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

  if (pathname === "/mob-lab") {
    return "mobs";
  }

  if (pathname === "/merchant-lab") {
    return "merchant";
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
  if (section === "mods") return MOD_SECTION_LINKS;
  if (section === "abilities") return ABILITY_SECTION_LINKS;
  if (section === "items") return ITEM_SECTION_LINKS;
  if (section === "data") return DATA_SECTION_LINKS;
  if (section === "settings") return SETTINGS_SECTION_LINKS;
  if (section === "mobs") return MOB_SECTION_LINKS;
  if (section === "merchant") return MERCHANT_SECTION_LINKS;
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
