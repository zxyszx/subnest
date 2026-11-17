import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { FloatingPortalContainerProvider } from "@/components/ui/floating-portal-container";
import { useModalSurface } from "@/components/ui/use-modal-surface";
import { cn } from "@/lib/utils";

type SideDrawerSide = "left" | "right";

type SideDrawerContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
  side: SideDrawerSide;
};

type SideDrawerRootProps = Omit<React.ComponentProps<typeof DialogPrimitive.Root>, "modal">;

function SideDrawerRoot(props: SideDrawerRootProps) {
  return <DialogPrimitive.Root modal {...props} />;
}

const SideDrawerTrigger = DialogPrimitive.Trigger;
const SideDrawerClose = DialogPrimitive.Close;
const SideDrawerTitle = DialogPrimitive.Title;
const SideDrawerDescription = DialogPrimitive.Description;

const SideDrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SideDrawerContentProps
>(({ children, className, overlayClassName, side, ...props }, ref) => {
  const { contentRef, overlayRef } = useModalSurface();
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
  const setRefs = React.useCallback(
    (node: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
      contentRef(node);
      setPortalContainer(node);
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref, contentRef],
  );

  return (
    // Radix Presence 必须持续拥有 Portal，才能在 data-state=closed 的退场动画结束后再卸载窗口。
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        ref={overlayRef}
        data-modal-overlay=""
        data-side-drawer-overlay=""
        className={cn(
          "fixed inset-0 z-70 bg-black/60 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          overlayClassName,
        )}
      />
      <DialogPrimitive.Content
        ref={setRefs}
        data-modal-content=""
        data-side={side}
        data-side-drawer-content=""
        className={cn(
          "h5-dialog-panel fixed inset-0 z-80 m-auto flex h-fit max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        <FloatingPortalContainerProvider container={portalContainer}>
          {children}
        </FloatingPortalContainerProvider>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SideDrawerContent.displayName = DialogPrimitive.Content.displayName;

export {
  SideDrawerClose,
  SideDrawerContent,
  SideDrawerDescription,
  SideDrawerRoot,
  SideDrawerTitle,
  SideDrawerTrigger,
};
