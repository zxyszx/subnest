import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";

export function WorkspaceQuickFilters<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('[role="dialog"]') ||
        target?.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const option = options[Number(event.code.replace("Digit", "")) - 1];
      if (option) {
        event.preventDefault();
        onChange(option.value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [options, onChange]);
  return (
    <div className="mb-2 flex shrink-0 flex-wrap gap-1">
      {options.map((option, index) => (
        <Button
          key={option.value}
          variant={value === option.value ? "secondary" : "ghost"}
          size="sm"
          className="h-9 text-xs"
          aria-pressed={value === option.value}
          title={t("workspace.filterShortcut", {
            label: option.label,
            number: index + 1,
          })}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
