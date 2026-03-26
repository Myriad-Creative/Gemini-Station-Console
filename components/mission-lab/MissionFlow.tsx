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
import { useEffect, useState } from "react";
import type { MissionGraphEdge, MissionGraphNode } from "@lib/mission-lab/types";
import { MissionCard } from "@components/mission-lab/MissionCard";

type MissionFlowNodeData = {
  mission: MissionGraphNode;
  selected: boolean;
  onSelect: (missionKey: string) => void;
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

function layoutNodes(
  rawNodes: MissionGraphNode[],
  rawEdges: MissionGraphEdge[],
  selectedMissionKey: string | null,
  focusNodeIds: string[],
  focusEdgeIds: string[],
  onSelect: (missionKey: string) => void,
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
      graph.setNode(node.id, { width: 340, height: estimateNodeHeight(node) });
    }

    for (const edge of component.edges) {
      graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (const node of component.nodes) {
      const position = graph.node(node.id);
      const width = 340;
      minX = Math.min(minX, position.x - width / 2);
      maxX = Math.max(maxX, position.x + width / 2);
    }

    const componentOffsetX = nextComponentX - minX;
    const componentWidth = maxX - minX;

    for (const node of component.nodes) {
      const position = graph.node(node.id);
      const width = 340;
      const height = estimateNodeHeight(node);

      nodes.push({
        id: node.id,
        type: "missionNode",
        position: {
          x: componentOffsetX + position.x - width / 2,
          y: position.y - height / 2 + 24,
        },
        draggable: false,
        selectable: false,
        data: {
          mission: node,
          selected: selectedMissionKey === node.id,
          onSelect,
        },
      });
    }

    nextComponentX += componentWidth + 84;
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

function MissionFlowNode({ data }: NodeProps<MissionFlowCanvasNode>) {
  return (
    <div className="w-[340px]">
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

  useEffect(() => {
    const next = layoutNodes(nodes, edges, selectedMissionKey, focusNodeIds, focusEdgeIds, onSelect);
    setFlowNodes(next.nodes);
    setFlowEdges(next.edges);
  }, [nodes, edges, selectedMissionKey, focusNodeIds, focusEdgeIds, onSelect]);

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
