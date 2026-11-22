import type { ReactNode } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "./components/ui/card";
export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function Icon({ user = false }: { user?: boolean }) {
  return (
    <img
      className="name-icon"
      src={
        user
          ? "/images/user-avatar.png"
          : "/images/reference-preview/anime-nav/servers.png"
      }
      alt=""
    />
  );
}
