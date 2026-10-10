import { Header } from "@/components/header";
import { NewSzxcnAdminPanel } from "@/components/newszxcn-admin-panel";

const copy = { title: "共享收件箱", help: "集中管理 NewSzxcn 邮箱的只读分享链接与授权范围。" };

export default function SharedInboxAdmin() {
  return <div className="app-page bg-background"><Header /><main className="app-main mx-auto w-full max-w-[120rem]"><div className="mb-4 sm:mb-6"><h1 className="text-2xl font-bold tracking-normal text-foreground">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.help}</p></div><NewSzxcnAdminPanel showHeader={false} /></main></div>;
}
