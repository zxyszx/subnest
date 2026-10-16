import { ChevronUp, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth-client";
import { PRODUCT_NAME } from "@/lib/product-brand";
import { useRouter } from "@/lib/router";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";

export function AccountMenu({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { data } = authClient.useSession();
  const { t } = useI18n();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const user = data?.user;
  const name = user?.name || user?.email || PRODUCT_NAME;

  const logout = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      toast.success(t("header.logoutSuccessTitle"));
      router.replace("/login");
    } catch {
      toast.error(t("header.logoutFailedTitle"), { description: t("error.generic") });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="account-menu-trigger"
          aria-label={`${name} · ${t("nav.settings")}`}
          title={`${name} · ${t("nav.settings")}`}
          className={cn("flex min-h-11 items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary", compact ? "w-11 shrink-0 justify-center px-0" : "w-full", className)}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
            {name.slice(0, 1).toUpperCase()}
          </span>
          {!compact && <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64 max-w-[calc(100vw-24px)] rounded-lg p-2" mobileTitle={t("nav.settings")}>
        <DropdownMenuLabel className="min-w-0 px-2 py-3">
          <span className="block truncate">{name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => router.push("/settings")}>
          <Settings className="h-4 w-4" />{t("nav.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{t("header.toggleTheme")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} className="min-h-11 gap-3 text-destructive focus:text-destructive" onSelect={() => void logout()}>
          <LogOut className="h-4 w-4" />{t("header.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
