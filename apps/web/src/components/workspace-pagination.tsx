import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";

export function useWorkspacePagination<T>(
  items: T[],
  key: string,
  size: number,
) {
  const [selection, setSelection] = useState({ key, page: 1 });
  if (selection.key !== key) setSelection({ key, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(selection.key === key ? selection.page : 1, pages);
  return {
    items: items.slice((page - 1) * size, page * size),
    page,
    pages,
    total: items.length,
    onPageChange: (next: number) =>
      setSelection({ key, page: Math.max(1, Math.min(next, pages)) }),
  };
}

export function WorkspacePagination({
  page,
  pages,
  total,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, index) => Math.max(1, Math.min(page - 2, pages - 4)) + index,
  );
  return (
    <nav
      className="workspace-pagination flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2 text-xs"
      aria-label={t("workspace.pagination")}
    >
      <span className="text-muted-foreground tabular-nums">
        {t("workspace.pageSummary", { total, page, pages })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t("workspace.previousPage")}
        >
          <ChevronLeft />
        </Button>
        {numbers.map((number) => (
          <Button
            key={number}
            variant={number === page ? "secondary" : "ghost"}
            className="h-9 min-w-9 px-2"
            aria-current={number === page ? "page" : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t("workspace.nextPage")}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
