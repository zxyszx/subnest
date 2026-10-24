import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared page hierarchy: title, scope, then actions. Keep tools out of the title. */
export function WorkspacePageHeading({ title, description, actions, className }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("workspace-page-heading flex min-w-0 flex-wrap items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
