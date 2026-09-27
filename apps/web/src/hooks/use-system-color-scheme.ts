import { useEffect } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 公开链接专用：只跟随设备系统主题，不读写应用的手动主题偏好。 */
export function useSystemColorScheme() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    const apply = () => {
      root.classList.toggle("dark", media.matches);
      root.style.colorScheme = media.matches ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      root.classList.toggle("dark", wasDark);
      root.style.colorScheme = previousColorScheme;
    };
  }, []);
}
