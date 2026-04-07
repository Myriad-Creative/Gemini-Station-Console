export function buildIconSrc(icon: string | undefined, id: string, name: string, version?: string) {
  const params = new URLSearchParams({
    res: icon || "icon_lootbox.png",
    id,
    name,
  });

  if (version) {
    params.set("v", version);
  }

  return `/api/icon?${params.toString()}`;
}
