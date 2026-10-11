import { accountSecurityKeyRing } from "./account-security-key";
import { arrayBufferFromBytes, base64Url, base64UrlToArrayBuffer } from "./encoding";
import type { Env } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const credentialBundlePrefix = "subnest-family-v2:";

export interface SharingCredentialBundle {
  password: string;
  additionalCredential: { name: string; value: string } | null;
}

export interface SharingCredentialMetadata {
  passwordMask: string;
  additionalCredential: { name: string; valueMask: string } | null;
}

export function encodeSharingCredentialBundle(bundle: SharingCredentialBundle): string {
  return `${credentialBundlePrefix}${JSON.stringify(bundle)}`;
}

export function decodeSharingCredentialBundle(plaintext: string): SharingCredentialBundle {
  if (!plaintext.startsWith(credentialBundlePrefix)) {
    return { password: plaintext, additionalCredential: null };
  }
  try {
    const parsed = JSON.parse(plaintext.slice(credentialBundlePrefix.length)) as Partial<SharingCredentialBundle>;
    const additional = parsed.additionalCredential;
    return {
      password: typeof parsed.password === "string" ? parsed.password : "",
      additionalCredential: additional && typeof additional.name === "string" && typeof additional.value === "string"
        ? { name: additional.name, value: additional.value }
        : null,
    };
  } catch {
    throw new Error("invalid sharing credential bundle");
  }
}

export function encodeSharingCredentialMetadata(metadata: SharingCredentialMetadata): string {
  if (!metadata.additionalCredential) return metadata.passwordMask;
  return `${credentialBundlePrefix}${JSON.stringify(metadata)}`;
}

export function decodeSharingCredentialMetadata(value: string): SharingCredentialMetadata {
  if (!value.startsWith(credentialBundlePrefix)) {
    return { passwordMask: value, additionalCredential: null };
  }
  try {
    const parsed = JSON.parse(value.slice(credentialBundlePrefix.length)) as Partial<SharingCredentialMetadata>;
    const additional = parsed.additionalCredential;
    return {
      passwordMask: typeof parsed.passwordMask === "string" ? parsed.passwordMask : "",
      additionalCredential: additional && typeof additional.name === "string" && typeof additional.valueMask === "string"
        ? { name: additional.name, valueMask: additional.valueMask }
        : null,
    };
  } catch {
    return { passwordMask: "", additionalCredential: null };
  }
}

export function maskAdditionalCredential(value: string): string {
  return "•".repeat(Math.min(Math.max(Array.from(value).length, 1), 12));
}

export async function encryptSharingCredential(env: Env, plaintext: string): Promise<string> {
  const key = (await accountSecurityKeyRing(env)).sharingCredential;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, encoder.encode(plaintext));
  return `v1.${base64Url(nonce)}.${base64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSharingCredential(env: Env, value: string): Promise<string> {
  const [version, nonceValue, ciphertextValue, extra] = value.split(".");
  if (version !== "v1" || !nonceValue || !ciphertextValue || extra) throw new Error("invalid sharing credential");
  const key = (await accountSecurityKeyRing(env)).sharingCredential;
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64UrlToArrayBuffer(nonceValue)) },
    key,
    arrayBufferFromBytes(new Uint8Array(base64UrlToArrayBuffer(ciphertextValue))),
  );
  return decoder.decode(plaintext);
}

export function maskSharingPassword(value: string): string {
  const characters = Array.from(value);
  if (characters.length === 0) return "";
  if (characters.length === 1) return "*";
  if (characters.length === 2) return characters.join("");
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}
