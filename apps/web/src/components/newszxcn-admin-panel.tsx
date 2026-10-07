import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Copy, ExternalLink, FolderOpen, Inbox, Link2, Loader2, Mail, Pencil, Plug, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { newszxcnService, type NewSzxcnFolder, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";
import { sharingQueryKeys } from "@/hooks/use-sharing";
import { subscriptionQueryKeys } from "@/hooks/subscription-query-cache";
import { useI18n } from "@/i18n/I18nProvider";

const ranges = [{ value: 30, label: "最近 30 分钟" }, { value: 60, label: "最近 1 小时" }, { value: 360, label: "最近 6 小时" }, { value: 1440, label: "最近 1 天" }, { value: 10080, label: "最近 7 天" }];
const copy = { title: "共享收件箱", description: "通过只读 API 管理 NewSzxcn 邮箱的访问范围和短链接。", apiConnection: "邮箱连接", connected: "连接正常", configureHelp: "配置只读 API 后载入邮箱，令牌仅保存在服务端。", enabled: "已连接", unconfigured: "待配置", apiAddress: "服务地址", tokenKeep: "API 令牌（留空保持不变）", tokenEnter: "输入只读 API 令牌", apiToken: "API 令牌", save: "保存配置", test: "测试连接", myMailboxes: "邮箱列表", mailboxHelp: "搜索邮箱并管理只读分享，对外链接不会暴露 API 令牌。", search: "搜索邮箱，例如 01", all: "全部状态", shared: "已分享", unshared: "未分享", refresh: "刷新", loading: "正在读取邮箱", empty: "没有匹配的邮箱", configureFirst: "请先配置邮箱连接", manageShare: "管理分享", manageTitle: "管理共享收件箱", currentShare: "当前分享", accessSettings: "访问范围", editAccess: "更改访问范围", saveChanges: "保存更改", discardChanges: "取消更改", changeWarning: "保存后旧链接会立即失效，并生成新链接。", range: "最近可查看范围", rollingRange: "范围会随当前时间滚动，不代表链接有效期。", folders: "可查看文件夹", mailUnit: "封", minuteUnit: "分钟", shortLink: "SubNest 短链接", copyLink: "复制链接", preview: "访客预览", close: "关闭分享", reset: "重置链接", open: "开启分享", cancel: "取消", confirm: "确认", resetConfirm: "确认重置链接？", closeConfirm: "确认关闭分享？", resetHelp: "重置后旧链接会立即失效，并使用当前访问范围生成新链接。", closeHelp: "关闭后当前链接将立即失效，访客无法继续访问。" };
type Filter = "all" | "shared" | "closed";

const systemFolderNames: Record<string, string> = {
  inbox: "收件箱", archive: "已归档", drafts: "草稿箱", sent: "已发送",
  trash: "已删除", deleted: "已删除", junk: "垃圾邮件", spam: "垃圾邮件",
};

function folderLabel(folder: NewSzxcnFolder) {
  const role = folder.role?.toLowerCase();
  const name = folder.name.trim().toLowerCase();
  return (role && systemFolderNames[role]) || systemFolderNames[name] || folder.name;
}

function rangeLabel(minutes: number) {
  return ranges.find((item) => item.value === minutes)?.label ?? `${minutes} ${copy.minuteUnit}`;
}

export function NewSzxcnAdminPanel({ id, className, showHeader = true }: { id?: string; className?: string; showHeader?: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("https://mail.newszxcn.com");
  const [token, setToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mailboxes, setMailboxes] = useState<NewSzxcnMailbox[]>([]);
  const [links, setLinks] = useState<SharedInboxLink[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<NewSzxcnMailbox | null>(null);
  const [folderNamesByMailbox, setFolderNamesByMailbox] = useState<Record<string, string[]>>({});
  const requestedFolderNames = useRef(new Set<string>());
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    requestedFolderNames.current.clear();
    setFolderNamesByMailbox({});
    try {
      const config = await newszxcnService.getConfig();
      if (!config.integration) { setConfigured(false); setConfigOpen(true); setMailboxes([]); setLinks([]); return; }
      setConfigured(true); setBaseUrl(config.integration.baseUrl);
      const [boxResult, linkResult] = await Promise.all([newszxcnService.mailboxes(), newszxcnService.links()]);
      setMailboxes(boxResult.items); setLinks(linkResult.links);
    } catch (error) { toast.error(error instanceof Error ? error.message : "无法读取共享收件箱配置"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const reloadAfterMutation = useCallback(async () => {
    await reload();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sharingQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: subscriptionQueryKeys.all }),
    ]);
  }, [queryClient, reload]);

  const activeByMailbox = useMemo(() => {
    const result = new Map<string, SharedInboxLink>();
    for (const link of links) if (!link.seatId && link.status === "active" && !result.has(link.mailboxId)) result.set(link.mailboxId, link);
    return result;
  }, [links]);
  const sharedByMailbox = useMemo(() => {
    const result = new Map<string, { generic: boolean; seats: number }>();
    for (const link of links) {
      if (link.seatId || link.status !== "active" || (link.expiresAt && !(Date.parse(link.expiresAt) > now))) continue;
      const summary = result.get(link.mailboxId) ?? { generic: false, seats: 0 };
      if (link.seatId) summary.seats += 1;
      else summary.generic = true;
      result.set(link.mailboxId, summary);
    }
    return result;
  }, [links, now]);
  const visible = useMemo(() => mailboxes
    .filter((mailbox) => mailbox.address.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((mailbox) => filter === "all" || (filter === "shared") === sharedByMailbox.has(mailbox.id))
    .sort((a, b) => a.address.localeCompare(b.address)), [mailboxes, query, filter, sharedByMailbox]);
  useEffect(() => {
    const queue = visible
      .filter((mailbox) => activeByMailbox.has(mailbox.id) && !requestedFolderNames.current.has(mailbox.id))
      .map((mailbox) => mailbox.id);
    if (queue.length === 0) return;
    for (const mailboxId of queue) requestedFolderNames.current.add(mailboxId);
    let cancelled = false;
    const worker = async () => {
      while (queue.length > 0) {
        const mailboxId = queue.shift();
        if (!mailboxId) return;
        try {
          const result = await newszxcnService.folders(mailboxId);
          const link = activeByMailbox.get(mailboxId);
          if (!cancelled && link) {
            const names = link.folderIds.map((folderId) => {
              const folder = result.items.find((item) => item.id === folderId);
              return folder ? folderLabel(folder) : folderId;
            });
            setFolderNamesByMailbox((current) => ({ ...current, [mailboxId]: names }));
          }
        } catch {
          if (!cancelled) setFolderNamesByMailbox((current) => ({ ...current, [mailboxId]: [] }));
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    return () => { cancelled = true; };
  }, [activeByMailbox, visible]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await newszxcnService.saveConfig(token.trim() ? { baseUrl, token: token.trim() } : { baseUrl });
      setToken(""); setConfigured(true); setConfigOpen(false); toast.success("NewSzxcn API 配置已加密保存"); await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };
  const testConnection = async () => {
    try { const result = await newszxcnService.test(); toast.success(`连接成功，共 ${result.mailboxes.length} 个邮箱`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "连接失败"); }
  };

  return <section id={id} className={cn("overflow-hidden", className)}>
    {showHeader ? <header className="border-b border-border pb-4">
      <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Inbox className="h-4 w-4" /></span><div><h2 className="text-lg font-semibold">{copy.title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div></div>
    </header> : null}
    <div className="border-b border-border">
      <button type="button" onClick={() => setConfigOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 py-4 text-left">
        <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Plug className="h-4 w-4" /></span><div className="min-w-0"><h2 className="font-semibold">{copy.apiConnection}</h2><p className="truncate text-sm text-muted-foreground">{configured ? `${baseUrl} · ${copy.connected}` : copy.configureHelp}</p></div></div>
        <span className={configured ? "text-sm text-emerald-600" : "text-sm text-muted-foreground"}>{configured ? copy.enabled : copy.unconfigured}</span>
      </button>
      {configOpen ? <div className="grid gap-4 border-t border-border bg-muted/20 p-4">
        <div className="grid gap-2"><Label htmlFor="newszxcn-api-url">{copy.apiAddress}</Label><Input id="newszxcn-api-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="newszxcn-api-token">{copy.apiToken}</Label><Input id="newszxcn-api-token" value={token} onChange={(event) => setToken(event.target.value)} type="password" placeholder={configured ? copy.tokenKeep : copy.tokenEnter} /></div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void saveConfig()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.save}</Button>{configured ? <Button variant="outline" onClick={() => void testConnection()}><Plug className="mr-2 h-4 w-4" />{copy.test}</Button> : null}</div>
      </div> : null}
    </div>

    <div>
      <div className="flex flex-col gap-3 border-b border-border py-4 md:flex-row md:items-center md:justify-between">
        <div><h2 className="text-lg font-semibold">{copy.myMailboxes} <span className="text-muted-foreground">({mailboxes.length})</span></h2><p className="text-sm text-muted-foreground">{copy.mailboxHelp}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="pl-9 sm:w-72" /></div><Select value={filter} onValueChange={(value) => setFilter(value as Filter)}><SelectTrigger className="sm:w-36" aria-label={copy.all}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.all}</SelectItem><SelectItem value="shared">{copy.shared}</SelectItem><SelectItem value="closed">{copy.unshared}</SelectItem></SelectContent></Select><Button variant="outline" size="icon" onClick={() => void reload()} aria-label={copy.refresh}><RefreshCw className="h-4 w-4" /></Button></div>
      </div>
      {loading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4" />{copy.loading}</div> : visible.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center text-muted-foreground"><Inbox className="mb-2 h-8 w-8" /><p>{configured ? copy.empty : copy.configureFirst}</p></div> : <div className="divide-y divide-border">{visible.map((mailbox) => {
        const link = activeByMailbox.get(mailbox.id);
        const summary = sharedByMailbox.get(mailbox.id);
        const displayName = mailbox.displayName?.trim();
        const hasDistinctDisplayName = Boolean(displayName && displayName.toLowerCase() !== mailbox.address.trim().toLowerCase());
        const folderNames = folderNamesByMailbox[mailbox.id];
        const sharingDetails = link
          ? [folderNames?.join("、"), rangeLabel(link.windowMinutes)].filter(Boolean).join(" · ")
          : "";
        return <div key={mailbox.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-3"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><p className="truncate font-medium">{mailbox.address}</p>{hasDistinctDisplayName ? <p className="truncate text-xs text-muted-foreground">{displayName}</p> : null}</div></div>
          <span className={summary ? "w-fit rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600" : "w-fit rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"}>{summary?.seats ? `${t("sharing.inboxLinkCount", { count: summary.seats })}${summary.generic ? ` · ${sharingDetails}` : ""}` : summary?.generic && link ? `${copy.shared} · ${sharingDetails}` : copy.unshared}</span>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setSelected(mailbox)}><Link2 className="h-3.5 w-3.5" />{copy.manageShare}</Button></div>
        </div>;
      })}</div>}
    </div>
    <MailboxShareDialog mailbox={selected} link={selected ? activeByMailbox.get(selected.id) ?? null : null} onOpenChange={(open) => { if (!open) setSelected(null); }} onChanged={reloadAfterMutation} />
  </section>;
}

function MailboxShareDialog({ mailbox, link, onOpenChange, onChanged }: { mailbox: NewSzxcnMailbox | null; link: SharedInboxLink | null; onOpenChange: (open: boolean) => void; onChanged: () => Promise<void> }) {
  const [folders, setFolders] = useState<NewSzxcnFolder[]>([]); const [folderIds, setFolderIds] = useState<string[]>([]); const [windowMinutes, setWindowMinutes] = useState(30); const [working, setWorking] = useState(false);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersFailed, setFoldersFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<"reset" | "revoke" | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!mailbox) return;
    let cancelled = false;
    setFolders([]); setFoldersLoading(true); setFoldersFailed(false);
    setEditing(!link); setConfirmation(null);
    setWindowMinutes(link?.windowMinutes ?? 30); setFolderIds(link?.folderIds ?? []);
    void newszxcnService.folders(mailbox.id).then((result) => { if (!cancelled) { setFolders(result.items); setFolderIds((current) => current.filter((id) => result.items.some((folder) => folder.id === id))); } }).catch(() => { if (!cancelled) { setFoldersFailed(true); setFolderIds([]); } }).finally(() => { if (!cancelled) setFoldersLoading(false); });
    return () => { cancelled = true; };
  }, [mailbox, link]);
  if (!mailbox) return null;
  const validSelection = !foldersLoading && !foldersFailed && folderIds.length > 0 && folderIds.every((id) => folders.some((folder) => folder.id === id));
  const initialFolderIds = link?.folderIds ?? [];
  const hasChanges = Boolean(link) && (windowMinutes !== link?.windowMinutes || [...folderIds].sort().join("\0") !== [...initialFolderIds].sort().join("\0"));
  const currentFolderNames = link?.folderIds.map((id) => { const folder = folders.find((item) => item.id === id); return folder ? folderLabel(folder) : id; }) ?? [];
  const create = async () => { if (!validSelection) return; setWorking(true); try { await newszxcnService.create({ mailboxId: mailbox.id, folderIds, windowMinutes }); toast.success("分享已开启"); await onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "开启分享失败"); } finally { setWorking(false); } };
  const revoke = async () => { if (!link) return; setWorking(true); try { await newszxcnService.revoke(link.id); toast.success("分享已关闭，旧链接立即失效"); await onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "关闭分享失败"); } finally { setWorking(false); } };
  const replace = async (nextFolderIds: string[], nextWindowMinutes: number, message: string) => { if (!link || foldersLoading || foldersFailed || nextFolderIds.length === 0) return; setWorking(true); try { await newszxcnService.revoke(link.id); await newszxcnService.create({ mailboxId: mailbox.id, folderIds: nextFolderIds, windowMinutes: nextWindowMinutes, expiresAt: link.expiresAt && Date.parse(link.expiresAt) > Date.now() ? link.expiresAt : null }); toast.success(message); } catch (error) { toast.error(error instanceof Error ? error.message : "更新分享失败"); } finally { try { await onChanged(); } finally { setWorking(false); } } };
  const copyLink = async () => { if (!link) return; const result = await copyTextToClipboard(link.shortUrl); toast[result.ok ? "success" : "error"](result.ok ? "链接已复制" : "复制失败"); };
  return <><Dialog open onOpenChange={(open) => { if (!working && !confirmation) onOpenChange(open); }}><DialogContent className="max-h-[min(88dvh,44rem)] max-w-lg overflow-y-auto" onOpenAutoFocus={(event) => event.preventDefault()}><DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />{copy.manageTitle}</DialogTitle><DialogDescription className="break-all">{mailbox.address}</DialogDescription></DialogHeader>
    {foldersLoading ? <p role="status" className="text-sm text-muted-foreground">{t("sharing.loadingLinks")}</p> : foldersFailed ? <p role="alert" className="text-sm text-destructive">{t("sharing.loadLinksFailed")}</p> : null}
    <div className="space-y-5 py-1">
      {link ? <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{copy.currentShare}</h3><span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" />{copy.shared}</span></div><div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm"><p className="flex items-start gap-2"><FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{foldersLoading ? t("sharing.loadingLinks") : currentFolderNames.join("、")}</span></p><p className="flex items-center gap-2"><Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" /><span>{rangeLabel(link.windowMinutes)}</span></p></div><div className="grid gap-2"><Label>{copy.shortLink}</Label><div className="flex gap-2"><Input readOnly tabIndex={-1} value={link.shortUrl} className="min-w-0 font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => void copyLink()} aria-label={copy.copyLink}><Copy className="h-4 w-4" /></Button><Button variant="outline" size="icon" asChild aria-label={copy.preview}><a href={link.shortUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button></div></div></section> : null}
      {editing ? <section className={link ? "space-y-4 border-t border-border pt-4" : "space-y-4"}><h3 className="text-sm font-semibold">{copy.accessSettings}</h3><div className="grid gap-2"><Label htmlFor="shared-range">{copy.range}</Label><Select value={String(windowMinutes)} onValueChange={(value) => setWindowMinutes(Number(value))} disabled={working}><SelectTrigger id="shared-range"><SelectValue /></SelectTrigger><SelectContent>{ranges.map((range) => <SelectItem key={range.value} value={String(range.value)}>{range.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{copy.rollingRange}</p></div><div className="grid gap-2"><Label>{copy.folders}</Label><div className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border">{folders.map((folder) => <label key={folder.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm"><input type="checkbox" checked={folderIds.includes(folder.id)} disabled={working} onChange={(event) => setFolderIds((current) => event.target.checked ? [...current, folder.id] : current.filter((id) => id !== folder.id))} /><span className="min-w-0 flex-1 truncate">{folderLabel(folder)}</span><span className="text-xs text-muted-foreground">{folder.totalCount ?? 0} {copy.mailUnit}</span></label>)}</div></div>{link && hasChanges ? <p className="text-xs text-amber-700 dark:text-amber-400">{copy.changeWarning}</p> : null}</section> : null}
    </div>
    <DialogFooter className="gap-2 sm:justify-between">{link && !editing ? <Button variant="destructive" onClick={() => setConfirmation("revoke")} disabled={working}>{copy.close}</Button> : <span />}{link && !editing ? <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" onClick={() => setEditing(true)} disabled={working || foldersLoading || foldersFailed}><Pencil className="mr-2 h-4 w-4" />{copy.editAccess}</Button><Button variant="outline" onClick={() => setConfirmation("reset")} disabled={working || foldersLoading || foldersFailed}><RefreshCw className="mr-2 h-4 w-4" />{copy.reset}</Button></div> : link ? <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" onClick={() => { setWindowMinutes(link.windowMinutes); setFolderIds(link.folderIds); setEditing(false); }} disabled={working}>{copy.discardChanges}</Button><Button onClick={() => void replace(folderIds, windowMinutes, "分享范围已更新，旧链接已失效")} disabled={working || !validSelection || !hasChanges}>{copy.saveChanges}</Button></div> : <Button onClick={() => void create()} disabled={working || !validSelection}><Link2 className="mr-2 h-4 w-4" />{copy.open}</Button>}</DialogFooter>
  </DialogContent></Dialog><AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation === "reset" ? copy.resetConfirm : copy.closeConfirm}</AlertDialogTitle><AlertDialogDescription>{confirmation === "reset" ? copy.resetHelp : copy.closeHelp}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{copy.cancel}</AlertDialogCancel><AlertDialogAction className={confirmation === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => { const action = confirmation; setConfirmation(null); if (action === "reset" && link) void replace(link.folderIds, link.windowMinutes, "短链接已重置，旧链接立即失效"); else if (action === "revoke") void revoke(); }}>{copy.confirm}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
