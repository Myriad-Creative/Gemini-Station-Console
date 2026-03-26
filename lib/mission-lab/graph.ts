import type {
  MissionGraphCycle,
  MissionGraphEdge,
  MissionGraphNode,
  MissionMissingPrerequisiteIssue,
  NormalizedMission,
} from "@lib/mission-lab/types";
import { buildMissionObjectivePreview } from "@lib/mission-lab/normalize";

export interface MissionGraphBuildResult {
  nodes: MissionGraphNode[];
  edges: MissionGraphEdge[];
  missingPrerequisiteTargets: MissionMissingPrerequisiteIssue[];
  cycles: MissionGraphCycle[];
}

export interface MissionFocusedSubgraph {
  nodeIds: string[];
  edgeIds: string[];
  orderedNodeIds: string[];
}

function detectCycles(nodes: MissionGraphNode[], edges: MissionGraphEdge[]) {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: MissionGraphCycle[] = [];

  function visit(nodeId: string) {
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      const cycleNodeIds = cycleStart === -1 ? [nodeId] : stack.slice(cycleStart);
      cycles.push({
        missionKeys: cycleNodeIds,
        missionIds: cycleNodeIds,
      });
      return;
    }

    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    stack.push(nodeId);

    for (const next of adjacency.get(nodeId) ?? []) visit(next);

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const node of nodes) visit(node.id);
  return cycles;
}

export function buildMissionGraph(missions: NormalizedMission[]): MissionGraphBuildResult {
  const byMissionId = new Map<string, NormalizedMission[]>();
  for (const mission of missions) {
    const current = byMissionId.get(mission.id) ?? [];
    current.push(mission);
    byMissionId.set(mission.id, current);
  }

  const nodes: MissionGraphNode[] = missions.map((mission) => ({
    id: mission.key,
    missionKey: mission.key,
    missionId: mission.id,
    title: mission.title,
    level: mission.level,
    primaryMode: mission.primaryMode,
    classLabel: mission.classLabel,
    faction: mission.faction,
    folderName: mission.folderName,
    derivedCategory: mission.derivedCategory,
    objectiveCount: mission.objectiveCount,
    prerequisiteCount: mission.prerequisiteCount,
    objectiveTypes: mission.objectiveTypes,
    objectivePreview: buildMissionObjectivePreview(mission),
    rewardSummary: mission.rewards,
    additionalSteps: Math.max(0, mission.steps.length - 1),
    hasConversations: mission.hasConversations,
    repeatable: mission.repeatable,
    hasPrerequisites: mission.hasPrerequisites,
  }));

  const edges: MissionGraphEdge[] = [];
  const missingPrerequisiteTargets: MissionMissingPrerequisiteIssue[] = [];

  for (const mission of missions) {
    for (const prerequisiteId of mission.prerequisiteIds) {
      const matchingMissions = byMissionId.get(prerequisiteId) ?? [];
      if (!matchingMissions.length) {
        missingPrerequisiteTargets.push({
          missionKey: mission.key,
          missionId: mission.id,
          missingId: prerequisiteId,
          relativePath: mission.relativePath,
        });
        continue;
      }

      for (const prerequisiteMission of matchingMissions) {
        edges.push({
          id: `${prerequisiteMission.key}__${mission.key}`,
          source: prerequisiteMission.key,
          target: mission.key,
          sourceMissionKey: prerequisiteMission.key,
          targetMissionKey: mission.key,
          sourceMissionId: prerequisiteMission.id,
          targetMissionId: mission.id,
          kind: "prerequisite",
        });
      }
    }
  }

  const cycles = detectCycles(nodes, edges).map((cycle) => ({
    missionKeys: cycle.missionKeys,
    missionIds: cycle.missionKeys
      .map((nodeId) => nodes.find((node) => node.id === nodeId)?.missionId ?? nodeId),
  }));

  return {
    nodes,
    edges,
    missingPrerequisiteTargets,
    cycles,
  };
}

export function collectFocusedSubgraph(nodes: MissionGraphNode[], edges: MissionGraphEdge[], focusMissionKey: string | null) {
  if (!focusMissionKey || !nodes.some((node) => node.id === focusMissionKey)) {
    return {
      nodeIds: nodes.map((node) => node.id),
      edgeIds: edges.map((edge) => edge.id),
      orderedNodeIds: nodes.map((node) => node.id),
    } satisfies MissionFocusedSubgraph;
  }

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const node of nodes) {
    forward.set(node.id, []);
    backward.set(node.id, []);
  }
  for (const edge of edges) {
    forward.get(edge.source)?.push(edge.target);
    backward.get(edge.target)?.push(edge.source);
  }

  const visited = new Set<string>([focusMissionKey]);
  const queue = [focusMissionKey];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of [...(forward.get(current) ?? []), ...(backward.get(current) ?? [])]) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  const nodeIds = Array.from(visited);
  const edgeIds = edges.filter((edge) => visited.has(edge.source) && visited.has(edge.target)).map((edge) => edge.id);
  const orderedNodeIds = topologicalOrder(nodes.filter((node) => visited.has(node.id)), edges.filter((edge) => edgeIds.includes(edge.id)));

  return { nodeIds, edgeIds, orderedNodeIds };
}

function topologicalOrder(nodes: MissionGraphNode[], edges: MissionGraphEdge[]) {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right));
  const ordered: string[] = [];

  while (queue.length) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(next);
        queue.sort((left, right) => left.localeCompare(right));
      }
    }
  }

  if (ordered.length !== nodes.length) {
    return nodes.map((node) => node.id).sort((left, right) => left.localeCompare(right));
  }

  return ordered;
}
