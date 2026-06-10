export type ShipJsonValue = null | boolean | number | string | ShipJsonValue[] | { [key: string]: ShipJsonValue };

export type ShipJsonObject = Record<string, ShipJsonValue>;

export interface ShipThrusterDraft {
  key: string;
  position_x: string;
  position_y: string;
  scale_x: string;
  scale_y: string;
  rotation_degrees: string;
  z_index: string;
  enabled: boolean;
  velocity_threshold: string;
}

export interface ShipWeaponChargePointDraft {
  key: string;
  position_x: string;
  position_y: string;
  scale_x: string;
  scale_y: string;
  z_index: string;
  enabled: boolean;
}

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
  thrusters: ShipThrusterDraft[];
  weaponChargePoints: ShipWeaponChargePointDraft[];
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
