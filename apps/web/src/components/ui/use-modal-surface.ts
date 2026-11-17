import { useCallback, useRef } from "react";

type Surface = { content: HTMLElement; overlay: HTMLElement | null; returnFocus: HTMLElement | null };
const surfaces = new WeakMap<Document, Surface[]>();

function showSurface(surface: Surface, covered: boolean) {
  for (const node of [surface.content, surface.overlay]) {
    if (!node) continue;
    node.toggleAttribute("data-modal-suspended", covered);
    node.toggleAttribute("data-modal-front", !covered);
  }
  surface.content.toggleAttribute("inert", covered);
}

function refresh(document: Document) {
  const stack = surfaces.get(document) ?? [];
  stack.forEach((surface, index) => showSurface(surface, index !== stack.length - 1));
}

/** Keep drafts and scroll positions mounted, but expose only the current task window. */
export function useModalSurface() {
  const surface = useRef<Surface | null>(null);
  const overlay = useRef<HTMLElement | null>(null);
  const overlayRef = useCallback((node: HTMLElement | null) => {
    overlay.current = node;
    if (surface.current) {
      surface.current.overlay = node;
      refresh(surface.current.content.ownerDocument);
    }
  }, []);
  const contentRef = useCallback((node: HTMLElement | null) => {
    const previous = surface.current;
    if (previous?.content === node) return;
    if (previous) {
      const document = previous.content.ownerDocument;
      const stack = surfaces.get(document) ?? [];
      const wasCurrent = stack.at(-1) === previous;
      const remaining = stack.filter((item) => item !== previous);
      surfaces.set(document, remaining);
      refresh(document);
      const parent = remaining.at(-1);
      if (wasCurrent && parent && previous.returnFocus && parent.content.contains(previous.returnFocus)) {
        // Radix roots opened programmatically may have no Trigger to restore focus to.
        queueMicrotask(() => {
          if (surfaces.get(document)?.at(-1) === parent && previous.returnFocus?.isConnected) {
            previous.returnFocus.focus({ preventScroll: true });
          }
        });
      }
    }
    surface.current = node ? {
      content: node,
      overlay: overlay.current,
      returnFocus: node.ownerDocument.activeElement instanceof HTMLElement ? node.ownerDocument.activeElement : null,
    } : null;
    if (surface.current) {
      const document = surface.current.content.ownerDocument;
      surfaces.set(document, [...(surfaces.get(document) ?? []), surface.current]);
      refresh(document);
    }
  }, []);
  return { contentRef, overlayRef };
}
