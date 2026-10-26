import { Header } from "@/components/header";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { NewSzxcnAdminPanel } from "@/components/newszxcn-admin-panel";

const copy = { title: "共享收件箱", help: "集中管理 NewSzxcn 邮箱的只读分享链接与授权范围。" };

export default function SharedInboxAdmin() {
  return <div className="app-page bg-background"><Header /><main className="app-main mx-auto w-full max-w-[120rem]"><WorkspacePageHeading hideDesktopTitle title={copy.title} description={copy.help} /><NewSzxcnAdminPanel showHeader={false} /></main></div>;
}
