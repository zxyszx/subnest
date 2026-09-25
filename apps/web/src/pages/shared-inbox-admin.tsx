import { Header } from "@/components/header";
import { NewSzxcnAdminPanel } from "@/components/newszxcn-admin-panel";

const copy = { title: "共享收件箱", help: "集中管理 NewSzxcn 邮箱的只读分享链接与授权范围。" };

export default function SharedInboxAdmin() {
  return <div className="min-h-screen bg-background"><Header /><main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8"><div className="mb-6"><h1 className="text-2xl font-bold tracking-normal text-foreground">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.help}</p></div><NewSzxcnAdminPanel /></main></div>;
}
