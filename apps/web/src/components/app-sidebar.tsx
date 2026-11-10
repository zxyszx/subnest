import type { ReactNode } from "react";
import "@/styles/workspace.css";

/** A shared horizontal navigation leaves the full workspace available for data. */
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  return <div className="workspace-shell"><div className="workspace-content">{children}</div></div>;
}
