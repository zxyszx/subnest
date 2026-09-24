import { useState } from "react";
import { Copy, Eye, EyeOff, Loader2, RefreshCw, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import type { FamilySharingFormState } from "@/types/subscription-form";
import { subscriptionService } from "@/services/subscription-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { toast } from "@/components/ui/sonner";
import { generateFamilySharingPassword } from "@/lib/family-sharing-password";

export function SubscriptionFamilySharingFields({
  id,
  subscriptionId,
  value,
  onChange,
  error,
}: {
  id: (name: string) => string;
  subscriptionId?: string | undefined;
  value: FamilySharingFormState;
  onChange: (value: FamilySharingFormState) => void;
  error?: string | undefined;
}) {
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const update = <K extends keyof FamilySharingFormState>(key: K, next: FamilySharingFormState[K]) => {
    onChange({ ...value, [key]: next });
  };
  const readSavedPassword = async () => {
    if (!subscriptionId || !value.hasPassword) return value.password;
    if (value.password) return value.password;
    setPasswordLoading(true);
    try {
      const password = await subscriptionService.familyPassword(subscriptionId);
      update("password", password);
      return password;
    } catch {
      toast.error(t("subscription.familySharing.passwordUnavailable"));
      return "";
    } finally {
      setPasswordLoading(false);
    }
  };

  const togglePassword = async () => {
    if (!passwordVisible && value.hasPassword && !value.password) {
      const password = await readSavedPassword();
      if (!password) return;
    }
    setPasswordVisible((current) => !current);
  };

  const copyPassword = async () => {
    const password = await readSavedPassword();
    if (!password) return;
    const result = await copyTextToClipboard(password);
    toast[result.ok ? "success" : "error"](t(result.ok ? "subscription.familySharing.passwordCopied" : "subscription.familySharing.passwordCopyFailed"));
  };

  const generatePassword = () => {
    update("password", generateFamilySharingPassword());
    setPasswordVisible(true);
    toast.success(t("subscription.familySharing.passwordGenerated"));
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={id("familySharingEnabled")} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <UsersRound className="h-4 w-4" />
            {t("subscription.familySharing.title")}
          </Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("subscription.familySharing.help")}</p>
        </div>
        <Switch
          id={id("familySharingEnabled")}
          checked={value.enabled}
          onCheckedChange={(enabled) => update("enabled", enabled)}
        />
      </div>

      {value.enabled ? (
        <div className="grid gap-4 border-t border-border pt-4">
          <FormField id={id("familySharingLoginAccount")} label={t("subscription.familySharing.loginAccount")}>
            {(field) => (
              <Input
                id={field.id}
                value={value.loginAccount}
                onChange={(event) => update("loginAccount", event.target.value)}
                autoComplete="username"
                required
                aria-describedby={field.describedBy}
                className="border-border bg-secondary"
              />
            )}
          </FormField>
          <FormField
            id={id("familySharingPassword")}
            label={t("subscription.familySharing.password")}
          >
            {(field) => (
              <div className="relative">
                <Input
                  id={field.id}
                  type={passwordVisible ? "text" : "password"}
                  value={value.password}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder={value.hasPassword ? value.passwordMask : t("subscription.familySharing.passwordPlaceholder")}
                  autoComplete="new-password"
                  required={!value.hasPassword}
                  aria-describedby={field.describedBy}
                  className="border-border bg-secondary pr-32"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-22 top-0 h-full w-11"
                  onClick={generatePassword}
                  aria-label={t("subscription.familySharing.generatePassword")}
                  title={t("subscription.familySharing.generatePassword")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {value.hasPassword || value.password ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-11 top-0 h-full w-11"
                    onClick={() => void copyPassword()}
                    disabled={passwordLoading}
                    aria-label={t("subscription.familySharing.copyPassword")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-11"
                  onClick={() => void togglePassword()}
                  disabled={passwordLoading}
                  aria-label={t(passwordVisible ? "subscription.familySharing.hidePassword" : "subscription.familySharing.showPassword")}
                >
                  {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </FormField>
          <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-[minmax(0,1fr)_8rem]">
            <FormField id={id("familySharingVerificationLink")} label={t("subscription.familySharing.verificationLink")}>
              {(field) => (
                <Input
                  id={field.id}
                  type="url"
                  value={value.verificationLink}
                  onChange={(event) => update("verificationLink", event.target.value)}
                  placeholder={t("subscription.familySharing.verificationLinkPlaceholder")}
                  aria-describedby={field.describedBy}
                  className="border-border bg-secondary"
                />
              )}
            </FormField>
            <FormField id={id("familySharingCapacity")} label={t("subscription.familySharing.capacity")}>
              {(field) => (
                <Input
                  id={field.id}
                  type="number"
                  min={1}
                  max={100}
                  value={value.capacity}
                  onChange={(event) => update("capacity", event.target.value)}
                  required
                  aria-describedby={field.describedBy}
                  className="border-border bg-secondary"
                />
              )}
            </FormField>
          </FormFieldRow>
          <FieldError id={id("familySharing-error")} message={error} />
        </div>
      ) : null}
    </section>
  );
}
