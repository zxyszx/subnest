import { useEffect } from "react";
import { Check } from "lucide-react";
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
    <div className="mb-3 flex shrink-0 flex-wrap gap-2 sm:mb-2 sm:gap-1">
      {options.map((option, index) => (
        <Button
          key={option.value}
          variant={value === option.value ? "secondary" : "ghost"}
          size="sm"
          className={value === option.value
            ? "min-h-11 border border-primary/30 bg-primary/15 px-3 text-xs font-semibold text-primary hover:bg-primary/20 sm:min-h-9"
            : "min-h-11 border border-transparent px-3 text-xs sm:min-h-9"}
          aria-pressed={value === option.value}
          title={t("workspace.filterShortcut", {
            label: option.label,
            number: index + 1,
          })}
          onClick={() => onChange(option.value)}
        >
          {value === option.value ? <Check className="size-3.5" aria-hidden="true" /> : null}
          {option.label}
        </Button>
      ))}
    </div>
  );
}
