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
  dimmed: boolean;
  onSelect: (missionKey: string) => void;
};

type MissionFlowCanvasNode = Node<MissionFlowNodeData, "missionNode">;

function estimateNodeHeight(node: MissionGraphNode) {
  return 240 + node.objectivePreview.length * 30 + (node.rewardSummary.rewards.length ? 28 : 0) + (node.additionalSteps ? 22 : 0);
}

function layoutNodes(
  rawNodes: MissionGraphNode[],
  rawEdges: MissionGraphEdge[],
  selectedMissionKey: string | null,
  focusNodeIds: string[],
  focusEdgeIds: string[],
  onSelect: (missionKey: string) => void,
) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: 56,
    ranksep: 88,
    marginx: 32,
    marginy: 32,
  });

  const shouldDim = focusNodeIds.length > 0 && focusNodeIds.length !== rawNodes.length;
  const focusNodeSet = new Set(focusNodeIds);
  const focusEdgeSet = new Set(focusEdgeIds);

  for (const node of rawNodes) {
    graph.setNode(node.id, { width: 340, height: estimateNodeHeight(node) });
  }

  for (const edge of rawEdges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const nodes: MissionFlowCanvasNode[] = rawNodes.map((node) => {
    const position = graph.node(node.id);
    const width = 340;
    const height = estimateNodeHeight(node);

    return {
      id: node.id,
      type: "missionNode",
      position: {
        x: position.x - width / 2,
        y: position.y - height / 2,
      },
      draggable: false,
      selectable: false,
      data: {
        mission: node,
        selected: selectedMissionKey === node.id,
        dimmed: shouldDim && !focusNodeSet.has(node.id),
        onSelect,
      },
    };
  });

  const edges: Edge[] = rawEdges.map((edge) => {
    const highlighted = focusEdgeSet.has(edge.id);
    const dimmed = shouldDim && !highlighted;
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
        opacity: dimmed ? 0.2 : 0.9,
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
        dimmed={data.dimmed}
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
