import { accountSecurityKeyRing } from "./account-security-key";
import { arrayBufferFromBytes, base64Url, base64UrlToArrayBuffer } from "./encoding";
import type { Env } from "./types";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export async function encryptNewSzxcn(env: Env, value: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, (await accountSecurityKeyRing(env)).newszxcnIntegration, encoder.encode(value));
  return `v1.${base64Url(nonce)}.${base64Url(new Uint8Array(bytes))}`;
}
export async function decryptNewSzxcn(env: Env, value: string): Promise<string> {
  const [version, nonce, ciphertext] = value.split(".");
  if (version !== "v1" || !nonce || !ciphertext) throw new Error("invalid newszxcn secret");
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(base64UrlToArrayBuffer(nonce)) }, (await accountSecurityKeyRing(env)).newszxcnIntegration, arrayBufferFromBytes(new Uint8Array(base64UrlToArrayBuffer(ciphertext))));
  return decoder.decode(bytes);
}
