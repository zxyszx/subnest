import { useEffect, useState } from "react";

// Size pages from the actual list pane, not the browser width or sidebar state.
export function useWorkspaceCapacity(rowHeight: number, columns = 1) {
  const [element, setContainer] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(400);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const size = Math.max(1, Math.floor((height - 44) / rowHeight)) * columns;
  return [setContainer, size] as const;
}
