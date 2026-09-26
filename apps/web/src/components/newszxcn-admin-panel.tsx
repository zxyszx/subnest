import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Inbox, Link2, Loader2, Plug, RefreshCw, Search, ShieldCheck } from "lucide-react";
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

const ranges = [{ value: 30, label: "最近 30 分钟" }, { value: 60, label: "最近 1 小时" }, { value: 360, label: "最近 6 小时" }, { value: 1440, label: "最近 1 天" }, { value: 10080, label: "最近 7 天" }];
const copy = { title: "共享收件箱", description: "通过只读 API 管理 NewSzxcn 邮箱的访问范围和短链接。", apiConnection: "邮箱连接", connected: "连接正常", configureHelp: "配置只读 API 后载入邮箱，令牌仅保存在服务端。", enabled: "已连接", unconfigured: "待配置", apiAddress: "服务地址", tokenKeep: "API 令牌（留空保持不变）", tokenEnter: "输入只读 API 令牌", apiToken: "API 令牌", save: "保存配置", test: "测试连接", myMailboxes: "邮箱列表", mailboxHelp: "搜索邮箱并管理只读分享，对外链接不会暴露 API 令牌。", search: "搜索邮箱，例如 01", all: "全部状态", shared: "已分享", unshared: "未分享", refresh: "刷新", loading: "正在读取邮箱", empty: "没有匹配的邮箱", configureFirst: "请先配置邮箱连接", manage: "管理", manageTitle: "管理共享收件箱", range: "最近可查看范围", rollingRange: "范围会随当前时间滚动，不代表链接有效期。", folders: "可查看文件夹", mailUnit: "封", shortLink: "SubNest 短链接", copyLink: "复制链接", preview: "访客预览", close: "关闭分享", reset: "重置链接", open: "开启分享" };
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

export function NewSzxcnAdminPanel({ id, className }: { id?: string; className?: string }) {
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

  const reload = useCallback(async () => {
    setLoading(true);
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
    for (const link of links) if (link.status === "active" && !result.has(link.mailboxId)) result.set(link.mailboxId, link);
    return result;
  }, [links]);
  const visible = useMemo(() => mailboxes
    .filter((mailbox) => mailbox.address.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((mailbox) => filter === "all" || (filter === "shared") === activeByMailbox.has(mailbox.id))
    .sort((a, b) => a.address.localeCompare(b.address)), [mailboxes, query, filter, activeByMailbox]);

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
    <header className="border-b border-border pb-4">
      <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Inbox className="h-4 w-4" /></span><div><h2 className="text-lg font-semibold">{copy.title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div></div>
    </header>
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
      {loading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.loading}</div> : visible.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center text-muted-foreground"><Inbox className="mb-2 h-8 w-8" /><p>{configured ? copy.empty : copy.configureFirst}</p></div> : <div className="divide-y divide-border">{visible.map((mailbox) => { const link = activeByMailbox.get(mailbox.id); return <div key={mailbox.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-medium">{mailbox.address}</p>{mailbox.displayName ? <p className="truncate text-xs text-muted-foreground">{mailbox.displayName}</p> : null}</div><span className={link ? "w-fit rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600" : "w-fit rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"}>{link ? `${copy.shared} · ${ranges.find((item) => item.value === link.windowMinutes)?.label ?? `${link.windowMinutes} 分钟`}` : copy.unshared}</span><Button variant="outline" size="sm" onClick={() => setSelected(mailbox)}>{copy.manage}</Button></div>; })}</div>}
    </div>
    <MailboxShareDialog mailbox={selected} link={selected ? activeByMailbox.get(selected.id) ?? null : null} onOpenChange={(open) => { if (!open) setSelected(null); }} onChanged={reloadAfterMutation} />
  </section>;
}

function MailboxShareDialog({ mailbox, link, onOpenChange, onChanged }: { mailbox: NewSzxcnMailbox | null; link: SharedInboxLink | null; onOpenChange: (open: boolean) => void; onChanged: () => Promise<void> }) {
  const [folders, setFolders] = useState<NewSzxcnFolder[]>([]); const [folderIds, setFolderIds] = useState<string[]>([]); const [windowMinutes, setWindowMinutes] = useState(30); const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!mailbox) return;
    setWindowMinutes(link?.windowMinutes ?? 30); setFolderIds(link?.folderIds ?? []);
    void newszxcnService.folders(mailbox.id).then((result) => { setFolders(result.items); if (!link) setFolderIds([]); }).catch((error) => toast.error(error instanceof Error ? error.message : "读取文件夹失败"));
  }, [mailbox, link]);
  if (!mailbox) return null;
  const create = async () => { if (folderIds.length === 0) { toast.error("请至少选择一个文件夹"); return; } setWorking(true); try { await newszxcnService.create({ mailboxId: mailbox.id, folderIds, windowMinutes }); toast.success("分享已开启"); await onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "开启分享失败"); } finally { setWorking(false); } };
  const revoke = async () => { if (!link) return; setWorking(true); try { await newszxcnService.revoke(link.id); toast.success("分享已关闭，旧链接立即失效"); await onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "关闭分享失败"); } finally { setWorking(false); } };
  const reset = async () => { if (!link) return; setWorking(true); try { await newszxcnService.revoke(link.id); await newszxcnService.create({ mailboxId: mailbox.id, folderIds, windowMinutes }); toast.success("短链接已重置，旧链接立即失效"); await onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "重置链接失败"); } finally { setWorking(false); } };
  const copyLink = async () => { if (!link) return; const result = await copyTextToClipboard(link.shortUrl); toast[result.ok ? "success" : "error"](result.ok ? "链接已复制" : "复制失败"); };
  return <Dialog open onOpenChange={onOpenChange}><DialogContent className="max-h-[min(88dvh,44rem)] max-w-lg overflow-y-auto" onOpenAutoFocus={(event) => event.preventDefault()}><DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />{copy.manageTitle}</DialogTitle><DialogDescription>{mailbox.address}</DialogDescription></DialogHeader>
    <div className="space-y-4 py-2"><div className="grid gap-2"><Label htmlFor="shared-range">{copy.range}</Label><Select value={String(windowMinutes)} onValueChange={(value) => setWindowMinutes(Number(value))} disabled={Boolean(link)}><SelectTrigger id="shared-range"><SelectValue /></SelectTrigger><SelectContent>{ranges.map((range) => <SelectItem key={range.value} value={String(range.value)}>{range.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{copy.rollingRange}</p></div>
      <div className="grid gap-2"><Label>{copy.folders}</Label><div className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border">{folders.map((folder) => <label key={folder.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm"><input type="checkbox" checked={folderIds.includes(folder.id)} disabled={Boolean(link)} onChange={(event) => setFolderIds((current) => event.target.checked ? [...current, folder.id] : current.filter((id) => id !== folder.id))} /><span className="min-w-0 flex-1 truncate">{folderLabel(folder)}</span><span className="text-xs text-muted-foreground">{folder.totalCount ?? 0} {copy.mailUnit}</span></label>)}</div></div>
      {link ? <div className="grid gap-2"><Label>{copy.shortLink}</Label><div className="flex gap-2"><Input readOnly tabIndex={-1} value={link.shortUrl} className="min-w-0 font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => void copyLink()} aria-label={copy.copyLink}><Copy className="h-4 w-4" /></Button><Button variant="outline" size="icon" asChild aria-label={copy.preview}><a href={link.shortUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button></div><p className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />{copy.shared} · {ranges.find((item) => item.value === link.windowMinutes)?.label}</p></div> : null}
    </div><DialogFooter className="gap-2 sm:justify-between">{link ? <Button variant="destructive" onClick={() => void revoke()} disabled={working}>{copy.close}</Button> : <span />}{link ? <Button variant="outline" onClick={() => void reset()} disabled={working}><RefreshCw className="mr-2 h-4 w-4" />{copy.reset}</Button> : <Button onClick={() => void create()} disabled={working || folderIds.length === 0}><Link2 className="mr-2 h-4 w-4" />{copy.open}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}
