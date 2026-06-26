export type BeaconScanTierDraft = {
  key: string;
  level: string;
  text: string;
};

export type BeaconDraft = {
  key: string;
  id: string;
  title: string;
  displayName: string;
  xp: string;
  faction: string;
  beaconClass: string;
  tags: string[];
  missionsAvailable: string[];
  grantMissionIdsOnScan: string[];
  scanFaction: string;
  scanClass: string;
  scanNotes: string;
  scanTiers: BeaconScanTierDraft[];
  scanExtraJson: string;
  extraJson: string;
};

export type BeaconWorkspace = {
  beacons: BeaconDraft[];
  extraJson: string;
  sourceLabel: string;
  parseWarnings: string[];
};

export type BeaconValidationIssue = {
  level: "error" | "warning";
  beaconKey?: string;
  field: string;
  message: string;
};
