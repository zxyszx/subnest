import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared page hierarchy: title, scope, then actions. Keep tools out of the title. */
export function WorkspacePageHeading({ title, description, actions, className, hideDesktopTitle = false }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  hideDesktopTitle?: boolean;
}) {
  return (
    <div className={cn("workspace-page-heading mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2", className)}>
      <div className="min-w-0">
        <h1 className={cn("text-xl font-semibold tracking-tight sm:text-2xl", hideDesktopTitle && "md:sr-only")}>{title}</h1>
        {description ? <div className={cn("text-sm leading-6 text-muted-foreground", hideDesktopTitle ? "mt-1 md:mt-0" : "mt-1")}>{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
