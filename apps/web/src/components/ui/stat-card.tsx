/**
 * 统计卡片原语。
 *
 * 架构位置：dashboard/public-status 共用的指标展示层，负责一致的信息层级和展示密度。
 *
 * 注意： 不在这里计算指标含义；金额换算和日期窗口属于 subscriptions domain。
 */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'default' | 'primary' | 'warning';
  density?: "default" | "compact" | "dashboard";
  className?: string;
  valueClassName?: string;
  onClick?: () => void;
  "aria-label"?: string;
  "data-testid"?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
  density = "default",
  className,
  valueClassName,
  onClick,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: StatCardProps) {
  const compact = density === "compact";
  const dashboard = density === "dashboard";

  return (
    <div
      data-testid={dataTestId}
      role={onClick ? "button" : undefined}
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } } : undefined}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all duration-300 hover:bg-card-hover",
        dashboard ? "p-1.5 sm:p-3" : compact ? "p-4 lg:p-6" : "p-6",
        className,
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className={cn("flex items-start justify-between", dashboard ? "gap-0 sm:gap-3" : compact && "gap-3")}>
        <div className={cn("grid min-w-0", dashboard ? "flex-1 justify-items-center gap-1 sm:justify-items-start sm:gap-1.5" : compact ? "gap-1.5 lg:gap-2" : "gap-2")}>
          <p className={cn("font-medium text-muted-foreground", dashboard ? "whitespace-nowrap text-[9px] leading-4 sm:text-xs xl:text-sm" : compact ? "truncate text-xs" : "text-sm")}>
            {title}
          </p>
          <p
            className={cn(
              "font-bold tracking-tight",
              dashboard ? "max-w-full truncate text-[11px] tabular-nums sm:text-xl xl:text-2xl 2xl:text-3xl" : compact ? "truncate text-2xl lg:text-3xl" : "text-3xl",
              variant === 'primary' && "text-foreground",
              variant === 'warning' && "text-warning",
              valueClassName,
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p className={cn("text-muted-foreground", dashboard ? "hidden truncate text-[11px] leading-4 sm:block xl:text-xs" : compact ? "truncate text-[11px] leading-4" : "text-xs")}>
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg",
            dashboard ? "hidden h-9 w-9 [&_svg]:h-4 [&_svg]:w-4 sm:flex xl:h-10 xl:w-10 xl:[&_svg]:h-5 xl:[&_svg]:w-5" : compact ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5 lg:h-12 lg:w-12 lg:[&_svg]:h-6 lg:[&_svg]:w-6" : "h-12 w-12",
            variant === 'default' && "bg-secondary text-muted-foreground",
            variant === 'primary' && "bg-secondary text-primary",
            variant === 'warning' && "bg-warning/10 text-warning",
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
