import * as React from "react";
import { X } from "lucide-react";
import * as Drawer from "@radix-ui/react-dialog";
import { FloatingPortalContainerProvider } from "@/components/ui/floating-portal-container";
import { useModalSurface } from "@/components/ui/use-modal-surface";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 移动端任务窗口统一使用居中弹窗，业务内容只负责自己的滚动链和操作区。
const DEFAULT_MOBILE_DRAWER_BODY_CLASSNAME =
  "min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]";

type MobileBottomDrawerContentProps = Omit<React.ComponentPropsWithoutRef<typeof Drawer.Content>, "children" | "title"> & {
  actions?: React.ReactNode;
  /** null 表示业务自管滚动链和底部操作区，供云备份、筛选抽屉这类复合面板复用同一外壳。 */
  bodyClassName?: string | null;
  closeLabel: string;
  description: React.ReactNode;
  descriptionMode?: "visible" | "sr-only";
  descriptionClassName?: string;
  headerClassName?: string;
  icon?: React.ReactNode;
  overlayClassName?: string;
  title: React.ReactNode;
  titleClassName?: string;
  zIndexClassName?: string;
  children?: React.ReactNode;
};

function MobileDrawerRoot({ shouldScaleBackground, ...props }: React.ComponentProps<typeof Drawer.Root> & { shouldScaleBackground?: boolean }) {
  // Compatibility for existing callers; centered windows never scale or drag the page.
  void shouldScaleBackground;
  return <Drawer.Root {...props} />;
}
const MobileDrawerTrigger = Drawer.Trigger;
const MobileDrawerClose = Drawer.Close;

function MobileBottomDrawerContent({
  actions,
  bodyClassName,
  children,
  className,
  closeLabel,
  description,
  descriptionClassName,
  descriptionMode = "visible",
  headerClassName,
  icon,
  overlayClassName,
  title,
  titleClassName,
  zIndexClassName = "z-50",
  ...props
}: MobileBottomDrawerContentProps) {
  const { contentRef, overlayRef } = useModalSurface();
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
  const setContentRef = React.useCallback((node: HTMLDivElement | null) => {
    contentRef(node);
    setPortalContainer(node);
  }, [contentRef]);
  const descriptionClass = descriptionMode === "sr-only"
    ? "sr-only"
    : cn("mt-1 text-left leading-5 text-muted-foreground", descriptionClassName ?? "text-sm");

  return (
    <Drawer.Portal>
      <Drawer.Overlay
        ref={overlayRef}
        data-modal-overlay=""
        className={cn(
          "fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          zIndexClassName,
          overlayClassName,
        )}
      />
      <Drawer.Content
        ref={setContentRef}
        data-modal-content=""
        className={cn(
          "h5-dialog-panel h5-drawer-panel fixed inset-0 m-auto flex h-[min(40rem,calc(var(--app-viewport-height)-2rem))] max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          zIndexClassName,
          className,
        )}
        {...props}
      >
        <FloatingPortalContainerProvider container={portalContainer}>
        <div className={cn("flex items-start justify-between gap-4 px-5 pb-3 pt-4", headerClassName)}>
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {icon ? (
              <div aria-hidden="true" className="shrink-0">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <Drawer.Title
                className={cn("min-w-0 text-base font-semibold text-foreground", titleClassName)}
              >
                <span className="block min-w-0 truncate">{title}</span>
              </Drawer.Title>
              <Drawer.Description className={descriptionClass}>
                {description}
              </Drawer.Description>
            </div>
          </div>
          <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-2">
            {actions}
            <MobileDrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">{closeLabel}</span>
              </Button>
            </MobileDrawerClose>
          </div>
        </div>
        {bodyClassName === null ? children : (
          <div className={cn(DEFAULT_MOBILE_DRAWER_BODY_CLASSNAME, bodyClassName)}>
            {children}
          </div>
        )}
        </FloatingPortalContainerProvider>
      </Drawer.Content>
    </Drawer.Portal>
  );
}

export {
  MobileBottomDrawerContent,
  MobileDrawerClose,
  MobileDrawerRoot,
  MobileDrawerTrigger,
};
