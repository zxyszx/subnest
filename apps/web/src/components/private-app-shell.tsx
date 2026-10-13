import { Outlet } from "react-router";
import { CustomConfigProvider } from "@/contexts/CustomConfigContext";
import PrivateAppearanceSync from "@/components/private-appearance-sync";
import PrivateLocaleSync from "@/components/private-locale-sync";
import { WorkspaceFrame } from "@/components/app-sidebar";

/** 私有页面共享同一 Provider 生命周期；认证守卫在父级确认会话后才会加载并挂载此壳层。 */
export default function PrivateAppShell() {
  return (
    <CustomConfigProvider>
      <PrivateAppearanceSync />
      <PrivateLocaleSync />
      <WorkspaceFrame><Outlet /></WorkspaceFrame>
    </CustomConfigProvider>
  );
}
