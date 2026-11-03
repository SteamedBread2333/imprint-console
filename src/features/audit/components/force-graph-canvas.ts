import type { ZoomTransform } from "d3";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3";
import type { GraphNode } from "../domain/contracts";
import { edgeStyle, nodeRadius, scopeColor } from "../domain/graph-model";

export type SimNode = GraphNode & SimulationNodeDatum & { r: number };
export type SimLink = SimulationLinkDatum<SimNode> & { kind: string };

export function labelOpacity(
  mode: "off" | "on" | "auto",
  count: number,
  selected: boolean,
  hovered: boolean,
): number {
  if (mode === "on" || (mode === "auto" && count <= 14) || selected || hovered) return 1;
  return 0;
}

/** Hit-test in graph space; checks larger nodes first so hubs win overlaps. */
export function findNodeAt(
  nodes: SimNode[],
  gx: number,
  gy: number,
  slop = 6,
): SimNode | undefined {
  let hit: SimNode | undefined;
  let best = Infinity;
  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const r = node.r + slop;
    const d2 = (x - gx) ** 2 + (y - gy) ** 2;
    if (d2 > r * r) continue;
    if (!hit || node.r > hit.r || (node.r === hit.r && d2 < best)) {
      hit = node;
      best = d2;
    }
  }
  return hit;
}

function truncateClaim(claim: string, max = 32): string {
  return claim.length > max + 2 ? `${claim.slice(0, max)}…` : claim;
}

/** Paint the full graph in one canvas pass (graph coordinates; transform applied by caller). */
export function paintGraphLayer(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  links: SimLink[],
  selectedId: string,
  hoveredId: string | null,
  labels: "off" | "on" | "auto",
): void {
  const labelCount = nodes.length;
  const edgesByKind = new Map<string, SimLink[]>();
  for (const link of links) {
    const bucket = edgesByKind.get(link.kind);
    if (bucket) bucket.push(link);
    else edgesByKind.set(link.kind, [link]);
  }

  ctx.lineCap = "round";
  for (const [kind, group] of edgesByKind) {
    const style = edgeStyle(kind);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = kind === "conflicts_with" ? 2.2 : 1.5;
    ctx.globalAlpha = 0.82;
    ctx.setLineDash(style.dashed ? [5, 3] : []);
    ctx.beginPath();
    for (const edge of group) {
      const s = edge.source as SimNode;
      const t = edge.target as SimNode;
      ctx.moveTo(s.x ?? 0, s.y ?? 0);
      ctx.lineTo(t.x ?? 0, t.y ?? 0);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const focused = node.id === selectedId;
    const r = nodeRadius(node, focused);
    node.r = r;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = scopeColor(node._kind && node._kind !== "rule" ? "doc" : node.scope[0] ?? "");
    ctx.fill();
    if (focused) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  const showLabel = (node: SimNode) =>
    labelOpacity(labels, labelCount, node.id === selectedId, node.id === hoveredId) > 0;

  ctx.textBaseline = "middle";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#ced4da";
  for (const node of nodes) {
    if (!showLabel(node)) continue;
    const x = (node.x ?? 0) + node.r + 5;
    const y = node.y ?? 0;
    ctx.fillText(truncateClaim(node.claim), x, y);
  }
}

export function paintFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  transform: ZoomTransform,
  nodes: SimNode[],
  links: SimLink[],
  selectedId: string,
  hoveredId: string | null,
  labels: "off" | "on" | "auto",
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);
  paintGraphLayer(ctx, nodes, links, selectedId, hoveredId, labels);
  ctx.restore();
}
