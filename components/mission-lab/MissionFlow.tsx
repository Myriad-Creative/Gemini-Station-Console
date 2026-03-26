"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionGraphEdge, MissionGraphNode } from "@lib/mission-lab/types";
import { MissionCard } from "@components/mission-lab/MissionCard";

const CARD_WIDTH = 340;
const CHAIN_GAP = 25;
const COMPONENT_GAP = 84;
const COMPONENT_TOP = 24;

type MissionFlowNodeData = {
  mission: MissionGraphNode;
  selected: boolean;
  onSelect: (missionKey: string) => void;
  onMeasure: (missionKey: string, height: number) => void;
};

type MissionFlowCanvasNode = Node<MissionFlowNodeData, "missionNode">;

function estimateWrappedLines(text: string, charsPerLine: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 1;

  return normalized
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

function estimateNodeHeight(node: MissionGraphNode) {
  const titleLines = estimateWrappedLines(node.title, 18);
  const objectiveCharsPerLine = node.primaryMode === "single" ? 34 : 28;
  const objectiveLines = Math.max(
    1,
    node.objectivePreview.reduce((total, line) => total + estimateWrappedLines(line, objectiveCharsPerLine), 0),
  );
  const rewardBlocks =
    (node.rewardSummary.credits != null ? 1 : 0) +
    (node.rewardSummary.xp != null ? 1 : 0) +
    node.rewardSummary.rewards.length;
  const rewardRows = rewardBlocks ? Math.ceil(rewardBlocks / 3) : 1;
  const modeSpacing = node.primaryMode === "sequential" ? 24 : node.primaryMode === "all" ? 14 : 0;

  return (
    172 +
    titleLines * 28 +
    objectiveLines * 24 +
    rewardRows * 66 +
    modeSpacing +
    (node.additionalSteps ? 26 : 0)
  );
}

function nodeHeightForLayout(node: MissionGraphNode, measuredHeights: Record<string, number>) {
  return measuredHeights[node.id] ?? estimateNodeHeight(node);
}

function getConnectedComponents(rawNodes: MissionGraphNode[], rawEdges: MissionGraphEdge[]) {
  const nodeMap = new Map(rawNodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  for (const node of rawNodes) adjacency.set(node.id, new Set());
  for (const edge of rawEdges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: Array<{ nodes: MissionGraphNode[]; edges: MissionGraphEdge[] }> = [];

  for (const node of rawNodes) {
    if (visited.has(node.id)) continue;

    const queue = [node.id];
    const componentNodeIds = new Set<string>();
    visited.add(node.id);

    while (queue.length) {
      const current = queue.shift()!;
      componentNodeIds.add(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }

    const componentNodes = Array.from(componentNodeIds)
      .map((nodeId) => nodeMap.get(nodeId))
      .filter((entry): entry is MissionGraphNode => !!entry)
      .sort((left, right) => left.title.localeCompare(right.title));
    const componentEdges = rawEdges.filter((edge) => componentNodeIds.has(edge.source) && componentNodeIds.has(edge.target));
    components.push({ nodes: componentNodes, edges: componentEdges });
  }

  return components.sort((left, right) => {
    const leftKey = left.nodes.map((node) => node.title).sort()[0] ?? "";
    const rightKey = right.nodes.map((node) => node.title).sort()[0] ?? "";
    return leftKey.localeCompare(rightKey);
  });
}

function buildTopologicalOrder(
  componentNodes: MissionGraphNode[],
  componentEdges: MissionGraphEdge[],
  fallbackOrder: string[],
) {
  const fallbackIndex = new Map(fallbackOrder.map((nodeId, index) => [nodeId, index]));
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const node of componentNodes) {
    indegree.set(node.id, 0);
    children.set(node.id, []);
  }

  for (const edge of componentEdges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }

  const queue = componentNodes
    .map((node) => node.id)
    .filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0)
    .sort((left, right) => (fallbackIndex.get(left) ?? 0) - (fallbackIndex.get(right) ?? 0));

  const ordered: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    ordered.push(current);

    for (const next of children.get(current) ?? []) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(next);
        queue.sort((left, right) => (fallbackIndex.get(left) ?? 0) - (fallbackIndex.get(right) ?? 0));
      }
    }
  }

  return ordered.length === componentNodes.length ? ordered : fallbackOrder;
}

function layoutNodes(
  rawNodes: MissionGraphNode[],
  rawEdges: MissionGraphEdge[],
  selectedMissionKey: string | null,
  focusEdgeIds: string[],
  onSelect: (missionKey: string) => void,
  onMeasure: (missionKey: string, height: number) => void,
  measuredHeights: Record<string, number>,
) {
  const focusEdgeSet = new Set(focusEdgeIds);
  const components = getConnectedComponents(rawNodes, rawEdges);
  const nodes: MissionFlowCanvasNode[] = [];
  let nextComponentX = 32;

  for (const component of components) {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({
      rankdir: "TB",
      nodesep: 44,
      ranksep: 28,
      marginx: 16,
      marginy: 16,
    });

    for (const node of component.nodes) {
      graph.setNode(node.id, { width: CARD_WIDTH, height: nodeHeightForLayout(node, measuredHeights) });
    }

    for (const edge of component.edges) {
      graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    const dagrePositions = new Map<string, { x: number; y: number }>();

    for (const node of component.nodes) {
      const position = graph.node(node.id);
      dagrePositions.set(node.id, position);
      const width = CARD_WIDTH;
      minX = Math.min(minX, position.x - width / 2);
      maxX = Math.max(maxX, position.x + width / 2);
    }

    const componentOffsetX = nextComponentX - minX;
    const componentWidth = maxX - minX;
    const parentMap = new Map<string, string[]>();
    for (const node of component.nodes) parentMap.set(node.id, []);
    for (const edge of component.edges) parentMap.get(edge.target)?.push(edge.source);

    const fallbackOrder = [...component.nodes]
      .sort((left, right) => {
        const leftPosition = dagrePositions.get(left.id)!;
        const rightPosition = dagrePositions.get(right.id)!;
        if (leftPosition.y !== rightPosition.y) return leftPosition.y - rightPosition.y;
        return leftPosition.x - rightPosition.x;
      })
      .map((node) => node.id);
    const topoOrder = buildTopologicalOrder(component.nodes, component.edges, fallbackOrder);
    const topMap = new Map<string, number>();
    for (const nodeId of topoOrder) {
      const parents = parentMap.get(nodeId) ?? [];
      if (!parents.length) {
        topMap.set(nodeId, COMPONENT_TOP);
        continue;
      }

      topMap.set(
        nodeId,
        Math.max(
          ...parents.map((parentId) => {
            const parentNode = component.nodes.find((entry) => entry.id === parentId)!;
            return (topMap.get(parentId) ?? COMPONENT_TOP) + nodeHeightForLayout(parentNode, measuredHeights) + CHAIN_GAP;
          }),
        ),
      );
    }

    for (const node of component.nodes) {
      const position = dagrePositions.get(node.id)!;
      const width = CARD_WIDTH;

      nodes.push({
        id: node.id,
        type: "missionNode",
        position: {
          x: componentOffsetX + position.x - width / 2,
          y: topMap.get(node.id) ?? COMPONENT_TOP,
        },
        draggable: false,
        selectable: false,
        data: {
          mission: node,
          selected: selectedMissionKey === node.id,
          onSelect,
          onMeasure,
        },
      });
    }

    nextComponentX += componentWidth + COMPONENT_GAP;
  }

  const edges: Edge[] = rawEdges.map((edge) => {
    const highlighted = focusEdgeSet.has(edge.id);
    const stroke = highlighted ? "#7dd3fc" : "#3f5f7e";

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
      },
      style: {
        stroke,
        strokeWidth: highlighted ? 2.5 : 1.4,
        opacity: 0.9,
      },
    };
  });

  return { nodes, edges };
}

function MissionFlowNode({ id, data }: NodeProps<MissionFlowCanvasNode>) {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = nodeRef.current;
    if (!element) return;

    const reportHeight = () => {
      const nextHeight = Math.ceil(element.offsetHeight);
      data.onMeasure(id, nextHeight);
    };

    reportHeight();
    const observer = new ResizeObserver(() => reportHeight());
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, data.onMeasure]);

  return (
    <div ref={nodeRef} className="w-[340px]">
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-0 !bg-cyan-300/70" />
      <MissionCard
        mission={data.mission}
        selected={data.selected}
        onClick={() => data.onSelect(data.mission.missionKey)}
      />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-0 !bg-cyan-300/70" />
    </div>
  );
}

const nodeTypes = {
  missionNode: MissionFlowNode,
};

export default function MissionFlow({
  nodes,
  edges,
  selectedMissionKey,
  focusNodeIds,
  focusEdgeIds,
  centerSignal,
  onSelect,
}: {
  nodes: MissionGraphNode[];
  edges: MissionGraphEdge[];
  selectedMissionKey: string | null;
  focusNodeIds: string[];
  focusEdgeIds: string[];
  centerSignal: number;
  onSelect: (missionKey: string) => void;
}) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [flowNodes, setFlowNodes] = useState<MissionFlowCanvasNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});

  const handleNodeMeasure = useCallback((missionKey: string, height: number) => {
    setMeasuredHeights((current) => {
      if (current[missionKey] === height) return current;
      return { ...current, [missionKey]: height };
    });
  }, []);

  useEffect(() => {
    const next = layoutNodes(nodes, edges, selectedMissionKey, focusEdgeIds, onSelect, handleNodeMeasure, measuredHeights);
    setFlowNodes(next.nodes);
    setFlowEdges(next.edges);
  }, [nodes, edges, selectedMissionKey, focusNodeIds, focusEdgeIds, onSelect, handleNodeMeasure, measuredHeights]);

  useEffect(() => {
    if (!flowInstance || !flowNodes.length) return;
    flowInstance.fitView({ padding: 0.18, duration: 300 });
  }, [flowInstance, flowNodes, flowEdges]);

  useEffect(() => {
    if (!flowInstance || !selectedMissionKey || !centerSignal) return;
    flowInstance.fitView({
      nodes: flowNodes.filter((node) => node.id === selectedMissionKey),
      padding: 0.32,
      duration: 350,
      maxZoom: 1.2,
    });
  }, [centerSignal, selectedMissionKey, flowInstance, flowNodes]);

  return (
    <div className="h-[78vh] overflow-hidden rounded-2xl border border-white/10 bg-[#07111d]">
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.15}
          maxZoom={1.25}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          colorMode="dark"
          onInit={setFlowInstance}
        >
          <Background color="#17314d" gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
