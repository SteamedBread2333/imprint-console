import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3";
import type { GraphData, GraphNode } from "../domain/contracts";
import { graphFit, graphStructureKey, nodeRadius } from "../domain/graph-model";
import {
  findNodeAt,
  paintFrame,
  type SimLink,
  type SimNode,
} from "./force-graph-canvas";

export type GraphHandle = {
  fit: () => void;
  zoomBy: (factor: number) => void;
};

type GraphView = {
  canvas: HTMLCanvasElement;
  zoom: ZoomBehavior<HTMLCanvasElement, unknown>;
  transform: ZoomTransform;
  nodes: SimNode[];
  links: SimLink[];
  width: number;
  height: number;
  redraw: () => void;
};

function layoutTickCount(nodeCount: number): number {
  return Math.min(220, Math.max(80, 64 + Math.round(Math.sqrt(nodeCount) * 8)));
}

function pointerGraph(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  transform: ZoomTransform,
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  return transform.invert([sx, sy]);
}

export const ForceGraph = forwardRef<GraphHandle, {
  data: GraphData;
  nodes: GraphNode[];
  enabledKinds: Set<string>;
  selectedId: string;
  labels: "off" | "on" | "auto";
  onSelect: (id: string) => void;
}>(function ForceGraph({ data, nodes, enabledKinds, selectedId, labels, onSelect }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => {});
  const redrawRef = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const labelsRef = useRef(labels);
  const modelRef = useRef({ data, nodes, enabledKinds });
  const viewRef = useRef<GraphView | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);
  const [sizeEpoch, setSizeEpoch] = useState(0);
  onSelectRef.current = onSelect;
  selectedRef.current = selectedId;
  labelsRef.current = labels;
  modelRef.current = { data, nodes, enabledKinds };
  const structureKey = graphStructureKey(nodes, data.edges, enabledKinds, "layout");

  const fitView = () => fitRef.current();

  useImperativeHandle(ref, () => ({
    fit: fitView,
    zoomBy(factor: number) {
      const view = viewRef.current;
      if (!view) return;
      select(view.canvas).transition().duration(180).call(view.zoom.scaleBy, factor);
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || (host.clientWidth >= 20 && host.clientHeight >= 20)) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (host.clientWidth >= 20 && host.clientHeight >= 20) setSizeEpoch((value) => value + 1);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [structureKey, sizeEpoch]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { data: graph, nodes: sourceNodes, enabledKinds: kinds } = modelRef.current;
    host.replaceChildren();
    const measured = host.clientWidth >= 20 && host.clientHeight >= 20;
    const width = measured ? host.clientWidth : 640;
    const height = measured ? host.clientHeight : 420;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nodeIds = new Set(sourceNodes.map((node) => node.id));
    const cx = width / 2;
    const cy = height / 2;
    const seedRadius = Math.min(
      Math.min(width, height) * 0.28,
      24 + Math.sqrt(sourceNodes.length) * 5,
    );
    const simNodes: SimNode[] = sourceNodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(sourceNodes.length, 1) - Math.PI / 2;
      return {
        ...node,
        r: nodeRadius(node, node.id === selectedRef.current),
        x: cx + Math.cos(angle) * seedRadius,
        y: cy + Math.sin(angle) * seedRadius,
        vx: 0,
        vy: 0,
      };
    });
    const links: SimLink[] = graph.edges
      .filter((edge) => kinds.has(edge.kind) && nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ ...edge }));

    const canvas = document.createElement("canvas");
    canvas.dataset.testid = "force-graph";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Rule graph, ${simNodes.length} nodes`);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.touchAction = "none";
    host.appendChild(canvas);

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    let transform = zoomIdentity;
    let hoveredId: string | null = null;
    let rafPaint = 0;
    let layoutRaf = 0;

    const redraw = () => {
      paintFrame(
        ctx,
        width,
        height,
        dpr,
        transform,
        simNodes,
        links,
        selectedRef.current,
        hoveredId,
        labelsRef.current,
      );
    };

    const scheduleRedraw = () => {
      if (rafPaint) return;
      rafPaint = requestAnimationFrame(() => {
        rafPaint = 0;
        redraw();
      });
    };
    redrawRef.current = redraw;

    const nodeAtPointer = (event: { clientX: number; clientY: number }) => {
      const [gx, gy] = pointerGraph(event, canvas, transform);
      return findNodeAt(simNodes, gx, gy);
    };

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.02, 8])
      .filter((event) => {
        if (event.type === "wheel") return true;
        const source = event.sourceEvent as MouseEvent | TouchEvent | undefined;
        if (!source) return true;
        if ("button" in source && source.button !== 0) return true;
        if (event.type === "mousedown" || event.type === "touchstart") {
          const point = "touches" in source && source.touches.length > 0
            ? source.touches[0]
            : source as MouseEvent;
          const [gx, gy] = pointerGraph(point, canvas, transform);
          if (findNodeAt(simNodes, gx, gy)) return false;
        }
        return true;
      })
      .on("zoom", (event) => {
        transform = event.transform;
        if (viewRef.current) viewRef.current.transform = transform;
        scheduleRedraw();
      });

    select(canvas).call(zoomBehavior).on("dblclick.zoom", null);

    const chargeStrength = -Math.min(72, 28 + Math.sqrt(simNodes.length) * 5);
    const repulseMax = Math.min(width, height) * 0.42;
    const simulation = forceSimulation(simNodes)
      .force("link", forceLink<SimNode, SimLink>(links).id((datum) => datum.id).distance(48).strength(0.62))
      .force("charge", forceManyBody().strength(chargeStrength).distanceMax(repulseMax).theta(0.9))
      .force("center", forceCenter(cx, cy).strength(0.12))
      .force("collide", forceCollide<SimNode>().radius((datum) => datum.r + 8).strength(0.85).iterations(2))
      .velocityDecay(0.45)
      .stop();

    const releasePins = () => {
      for (const n of simNodes) {
        n.fx = null;
        n.fy = null;
      }
    };

    const physicsStepsPerDragFrame = simNodes.length > 280 ? 2 : simNodes.length > 120 ? 3 : 5;

    const fit = (animate: boolean) => {
      const viewWidth = host.clientWidth >= 20 ? host.clientWidth : width;
      const viewHeight = host.clientHeight >= 20 ? host.clientHeight : height;
      const labelPad = labelsRef.current === "on" || (labelsRef.current === "auto" && simNodes.length <= 14)
        ? 120
        : 0;
      const frame = graphFit(simNodes, viewWidth, viewHeight, labelPad);
      const next = zoomIdentity.translate(viewWidth / 2, viewHeight / 2).scale(frame.k).translate(-frame.cx, -frame.cy);
      zoomBehavior.extent([[0, 0], [viewWidth, viewHeight]]);
      transform = next;
      if (viewRef.current) viewRef.current.transform = transform;
      const target = animate ? select(canvas).transition().duration(420) : select(canvas);
      target.call(zoomBehavior.transform, next);
      scheduleRedraw();
      if (viewRef.current) {
        viewRef.current.width = viewWidth;
        viewRef.current.height = viewHeight;
      }
    };
    fitRef.current = () => fit(true);
    viewRef.current = {
      canvas,
      zoom: zoomBehavior,
      transform,
      nodes: simNodes,
      links,
      width,
      height,
      redraw,
    };

    const totalTicks = layoutTickCount(simNodes.length);
    const ticksPerFrame = simNodes.length > 120 ? 12 : 24;
    let tickDone = 0;
    const runLayoutFrame = () => {
      const end = Math.min(tickDone + ticksPerFrame, totalTicks);
      for (; tickDone < end; tickDone += 1) simulation.tick();
      scheduleRedraw();
      if (tickDone < totalTicks) {
        layoutRaf = requestAnimationFrame(runLayoutFrame);
      } else {
        fit(false);
      }
    };
    layoutRaf = requestAnimationFrame(runLayoutFrame);

    let dragNode: SimNode | null = null;
    let pointerMoved = false;
    let downX = 0;
    let downY = 0;
    let settleRaf = 0;

    const runPhysics = (steps: number) => {
      simulation.stop();
      for (let i = 0; i < steps; i += 1) simulation.tick();
    };

    const settleAfterDrag = () => {
      let left = Math.min(48, 12 + Math.round(Math.sqrt(simNodes.length)));
      const step = () => {
        runPhysics(2);
        scheduleRedraw();
        left -= 2;
        if (left > 0) settleRaf = requestAnimationFrame(step);
      };
      if (settleRaf) cancelAnimationFrame(settleRaf);
      settleRaf = requestAnimationFrame(step);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const node = nodeAtPointer(event);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      if (settleRaf) cancelAnimationFrame(settleRaf);
      canvas.setPointerCapture(event.pointerId);
      dragNode = node;
      pointerMoved = false;
      downX = event.clientX;
      downY = event.clientY;
      releasePins();
      for (const n of simNodes) {
        n.vx = 0;
        n.vy = 0;
      }
      dragNode.fx = dragNode.x ?? 0;
      dragNode.fy = dragNode.y ?? 0;
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (dragNode) {
        if (Math.hypot(event.clientX - downX, event.clientY - downY) > 3) pointerMoved = true;
        const [gx, gy] = pointerGraph(event, canvas, transform);
        dragNode.fx = gx;
        dragNode.fy = gy;
        runPhysics(physicsStepsPerDragFrame);
        scheduleRedraw();
        return;
      }
      const node = nodeAtPointer(event);
      const nextId = node?.id ?? null;
      canvas.style.cursor = node ? "grab" : "default";
      if (nextId === hoveredId) return;
      hoveredId = nextId;
      if (node) {
        const bounds = host.getBoundingClientRect();
        setTip({
          x: event.clientX - bounds.left + 14,
          y: event.clientY - bounds.top + 14,
          title: `${node.id} · ${node.status} · ${node.confidence.toFixed(2)}`,
          body: node.claim,
        });
      } else {
        setTip(null);
      }
      scheduleRedraw();
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragNode) return;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      const picked = dragNode;
      picked.fx = null;
      picked.fy = null;
      dragNode = null;
      canvas.style.cursor = "grab";
      settleAfterDrag();
      if (!pointerMoved) onSelectRef.current(picked.id);
      pointerMoved = false;
    };

    const onPointerUp = (event: PointerEvent) => {
      endDrag(event);
    };

    const onPointerCancel = (event: PointerEvent) => {
      endDrag(event);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", () => {
      if (!dragNode) {
        hoveredId = null;
        setTip(null);
        scheduleRedraw();
      }
    });

    return () => {
      if (rafPaint) cancelAnimationFrame(rafPaint);
      if (layoutRaf) cancelAnimationFrame(layoutRaf);
      if (settleRaf) cancelAnimationFrame(settleRaf);
      redrawRef.current = () => {};
      viewRef.current = null;
      fitRef.current = () => {};
      simulation.stop();
      select(canvas).on(".zoom", null);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      host.replaceChildren();
    };
  }, [structureKey, sizeEpoch]);

  useEffect(() => {
    selectedRef.current = selectedId;
    labelsRef.current = labels;
    redrawRef.current();
  }, [labels, selectedId, structureKey]);

  return (
    <div className="force-graph">
      <div ref={hostRef} className="force-graph-canvas" />
      {tip && (
        <div className="graph-tip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.title}</strong>
          <span>{tip.body}</span>
        </div>
      )}
    </div>
  );
});
