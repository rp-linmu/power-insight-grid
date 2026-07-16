"use client";

import { useMemo, useState } from "react";

import type { TopologyEdge, TopologyNode } from "../lib/api";

type PositionedNode = TopologyNode & {
  x: number;
  y: number;
};

type ViewState = {
  scale: number;
  x: number;
  y: number;
};

type DragState = {
  startX: number;
  startY: number;
  viewX: number;
  viewY: number;
} | null;

type SelectedItem =
  | { type: "line"; edge: TopologyEdge; spread: number | null }
  | { type: "node"; node: PositionedNode }
  | null;

function formatNumber(value: number | null | undefined, digits = 2) {
  return value == null ? "-" : value.toFixed(digits);
}

function assignPositions(nodes: TopologyNode[], width: number, height: number) {
  const withGeo = nodes.filter((node) => node.longitude != null && node.latitude != null);
  const minLon = Math.min(...withGeo.map((node) => node.longitude as number));
  const maxLon = Math.max(...withGeo.map((node) => node.longitude as number));
  const minLat = Math.min(...withGeo.map((node) => node.latitude as number));
  const maxLat = Math.max(...withGeo.map((node) => node.latitude as number));
  const pad = 34;
  return nodes.map((node, index) => {
    if (node.longitude != null && node.latitude != null && maxLon > minLon && maxLat > minLat) {
      return {
        ...node,
        x: pad + ((node.longitude - minLon) / (maxLon - minLon)) * (width - pad * 2),
        y: pad + ((maxLat - node.latitude) / (maxLat - minLat)) * (height - pad * 2),
      };
    }
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * width * 0.38,
      y: height / 2 + Math.sin(angle) * height * 0.38,
    };
  });
}

export default function TopologyNetworkViewer({ nodes, edges }: { nodes: TopologyNode[]; edges: TopologyEdge[] }) {
  const width = 980;
  const height = 620;
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState>(null);
  const [selected, setSelected] = useState<SelectedItem>(null);

  const positioned = useMemo(() => assignPositions(nodes, width, height), [nodes]);
  const nodeMap = useMemo(() => new Map(positioned.map((node) => [node.name, node])), [positioned]);
  const maxSpread = Math.max(...edges.map((edge) => edge.selected_abs_spread ?? edge.max_abs_spread ?? 0), 1);

  if (!nodes.length) {
    return <div className="topology-empty">暂无拓扑网络数据</div>;
  }

  const zoom = (delta: number) => {
    setView((current) => {
      const nextScale = Math.min(4, Math.max(0.65, current.scale + delta));
      return { ...current, scale: nextScale };
    });
  };

  const reset = () => {
    setView({ scale: 1, x: 0, y: 0 });
    setSelected(null);
  };

  return (
    <div className="topology-viewer">
      <div className="topology-zoom-toolbar">
        <button type="button" onClick={() => zoom(0.25)}>+</button>
        <button type="button" onClick={() => zoom(-0.25)}>-</button>
        <button type="button" onClick={reset}>重置</button>
        <span>{Math.round(view.scale * 100)}%</span>
      </div>

      {selected ? (
        <div className="topology-selection-panel">
          {selected.type === "line" ? (
            <>
              <strong>{selected.edge.line_name}</strong>
              <span>{selected.edge.source} 至 {selected.edge.target}</span>
              <span>
                {selected.edge.selected_time ? `${selected.edge.selected_time} ` : ""}
                价差 {formatNumber(selected.spread)} 元/MWh
              </span>
              <small>峰值 {formatNumber(selected.edge.max_abs_spread)} 元/MWh / {selected.edge.peak_time || "-"}</small>
            </>
          ) : (
            <>
              <strong>{selected.node.name}</strong>
              <span>{selected.node.region || "区域未识别"} / {selected.node.voltage_level || "电压等级未知"}</span>
              <span>节点电价 {selected.node.price == null ? "-" : `${formatNumber(selected.node.price)} 元/MWh`}</span>
              <small>{selected.node.matched ? "已匹配节点电价" : "未匹配节点电价"}</small>
            </>
          )}
        </div>
      ) : null}

      <svg
        className="topology-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY > 0 ? -0.15 : 0.15);
        }}
        onMouseDown={(event) =>
          setDrag({ startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y })
        }
        onMouseMove={(event) => {
          if (!drag) return;
          setView((current) => ({
            ...current,
            x: drag.viewX + (event.clientX - drag.startX) / current.scale,
            y: drag.viewY + (event.clientY - drag.startY) / current.scale,
          }));
        }}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        <rect x="0" y="0" width={width} height={height} rx="8" fill="#f8faf8" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {edges.map((edge, index) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            const displaySpread = edge.selected_abs_spread ?? edge.max_abs_spread;
            const strength = Math.min((displaySpread || 0) / maxSpread, 1);
            const stroke = edge.blocked ? "#dc2626" : edge.voltage_level === "500" ? "#8aa69f" : "#d4ddd8";
            const strokeWidth = edge.blocked ? 1.4 + strength * 3.2 : edge.voltage_level === "500" ? 1.2 : 0.7;
            return (
              <line
                key={`${edge.line_name}-${index}`}
                className="topology-edge-hit"
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={edge.blocked ? 0.9 : 0.42}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected({ type: "line", edge, spread: displaySpread ?? null });
                }}
              >
                <title>
                  {edge.line_name} {edge.source} 至 {edge.target} {formatNumber(displaySpread)} 元/MWh
                </title>
              </line>
            );
          })}
          {positioned.map((node) => (
            <g
              key={node.name}
              className="topology-node-hit"
              onClick={(event) => {
                event.stopPropagation();
                setSelected({ type: "node", node });
              }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.voltage_level === "500" ? 4.6 : 3.2}
                fill={node.matched ? "#0f766e" : "#cbd5d1"}
                stroke="#fff"
                strokeWidth="1"
              >
                <title>{node.name} {node.price == null ? "" : `${formatNumber(node.price)} 元/MWh`}</title>
              </circle>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
