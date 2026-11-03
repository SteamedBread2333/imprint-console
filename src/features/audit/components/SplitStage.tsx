import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ScrollArea } from "@mantine/core";
import { clampDetailWidth } from "../domain/graph-model";

export function SplitStage({ graph, detail }: { graph: ReactNode; detail: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const apply = () => {
      setWidth((current) => clampDetailWidth(current, element.clientWidth, window.innerWidth));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const resizeTo = (clientX: number) => {
    const element = frame.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setWidth(clampDetailWidth(rect.right - clientX, rect.width, window.innerWidth));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizing(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
    resizeTo(event.clientX);
  };

  useEffect(() => {
    if (!resizing) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [resizing]);

  return (
    <div
      className={resizing ? "graph-stage is-resizing" : "graph-stage"}
      ref={frame}
      data-testid="graph-stage"
    >
      <div className="graph-stage-main">{graph}</div>
      <div
        className="graph-stage-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize detail panel"
        data-testid="graph-resizer"
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          event.preventDefault();
          resizeTo(event.clientX);
        }}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={() => setResizing(false)}
      />
      <aside className="graph-stage-detail" style={{ width }} aria-live="polite">
        <ScrollArea h="100%" p="md" bg="var(--mantine-color-dark-8)">
          {detail}
        </ScrollArea>
      </aside>
    </div>
  );
}
