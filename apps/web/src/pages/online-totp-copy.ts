import type { Locale } from "@/i18n/locales";

const copies = {
  "zh-CN": {
    code: "验证码", copyCode: "复制验证码", empty: "还没有 2FA 账号", createTitle: "添加 2FA 账号",
    editTitle: "编辑 2FA 账号", paused: "已暂停", secret: "2FA 密钥", secretPlaceholder: "粘贴 Base32 密钥或 otpauth:// 链接",
    secretKeep: "留空则保留当前密钥", logo: "Logo 链接", enabled: "生成验证码", shareEnabled: "启用分享链接",
    resetLink: "重置分享链接", resetConfirmTitle: "确认重置分享链接？", resetConfirmDescription: "旧链接会立即失效，并生成一个新链接。",
    deleteConfirmTitle: "确认删除此 2FA 账号？", deleteConfirmDescription: "账号和加密保存的 2FA 密钥将被永久删除。",
    saved: "2FA 账号已保存", deleted: "2FA 账号已删除", linkReset: "分享链接已重置", failed: "操作失败，请检查输入后重试。",
    publicTitle: "动态验证码", publicHint: "验证码将在倒计时结束后自动更新", publicUnavailable: "链接不可用",
    publicUnavailableHint: "分享链接无效、已暂停或已被重置。", publicLoading: "正在加载验证码",
    remaining: (seconds: number) => `${seconds} 秒`,
  },
  "en-US": {
    code: "Code", copyCode: "Copy code", empty: "No 2FA accounts yet", createTitle: "Add 2FA account",
    editTitle: "Edit 2FA account", paused: "Paused", secret: "2FA secret", secretPlaceholder: "Paste a Base32 secret or otpauth:// URL",
    secretKeep: "Leave blank to keep the current secret", logo: "Logo URL", enabled: "Generate codes", shareEnabled: "Enable share link",
    resetLink: "Reset share link", resetConfirmTitle: "Reset the share link?", resetConfirmDescription: "The old link will stop working immediately and a new link will be generated.",
    deleteConfirmTitle: "Delete this 2FA account?", deleteConfirmDescription: "The account and encrypted 2FA secret will be permanently deleted.",
    saved: "2FA account saved", deleted: "2FA account deleted", linkReset: "Share link reset", failed: "Operation failed. Check the input and try again.",
    publicTitle: "Authenticator code", publicHint: "The code refreshes automatically when the countdown ends", publicUnavailable: "Link unavailable",
    publicUnavailableHint: "The share link is invalid, paused, or has been reset.", publicLoading: "Loading authenticator code",
    remaining: (seconds: number) => `${seconds} sec`,
  },
} as const;

export function onlineTotpCopy(locale: Locale) {
  return copies[locale];
}
