export type ShipJsonValue = null | boolean | number | string | ShipJsonValue[] | { [key: string]: ShipJsonValue };

export type ShipJsonObject = Record<string, ShipJsonValue>;

export type ShipProfile = {
  key: string;
  fileName: string;
  relativePath: string;
  profileIndex: number | null;
  id: string;
  displayName: string;
  description: string;
  scene: string;
  sprite: string;
  starter: boolean;
  stats: Record<string, number | string>;
  modSlots: Record<string, number | string>;
  cargo: ShipJsonObject;
  purchase: ShipJsonObject;
  tags: string[];
  abilities: ShipJsonValue[];
  parseError: string | null;
  rawJson: string;
  data: ShipJsonObject | null;
};

export type ShipProfilesResponse = {
  ok: boolean;
  sourceRoot: string | null;
  shipsDirectory: string | null;
  summary: {
    totalProfiles: number;
    starterCount: number;
    parseErrors: number;
  };
  profiles: ShipProfile[];
  error?: string;
};
