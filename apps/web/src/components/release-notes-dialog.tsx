import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import type { SystemVersionResponse } from "@/lib/api/schemas/app";

/** Release text is untrusted content; render text only, never raw HTML. */
export function ReleaseNotesDialog({ version, open, onOpenChange }: {
  version: SystemVersionResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const release = version.releaseInfo;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent layout="frame" className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden p-0" dismissMode="explicit">
      <DialogHeader className="shrink-0 border-b p-5 pr-12">
        <DialogTitle className="flex flex-wrap items-center gap-2">{t("system.viewChangelog")}<span className="text-muted-foreground">{t("system.badgeVersion", { version: release?.version ?? version.latestVersion ?? version.currentVersion })}</span></DialogTitle>
        <DialogDescription>{release?.name || t("system.latestVersion")}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5 text-sm leading-7" data-testid="release-notes-body">
        {release?.body.trim() ? release.body.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
          const text = line.replace(/^#{1,6}\s+/, "");
          if (/^#{1,6}\s/.test(line)) return <p key={index} className="pt-2 text-base font-semibold">{text}</p>;
          return <p key={index} className="whitespace-pre-wrap wrap-anywhere">{text}</p>;
        }) : <p className="text-muted-foreground">{t("system.changelogUnavailable")}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t p-4">
        {release?.htmlUrl?.startsWith("https://github.com/zxyszx/subnest/releases/") ? <Button variant="outline" asChild><a href={release.htmlUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{t("system.releaseLink")}</a></Button> : null}
        <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
