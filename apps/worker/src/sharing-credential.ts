import { accountSecurityKeyRing } from "./account-security-key";
import { arrayBufferFromBytes, base64Url, base64UrlToArrayBuffer } from "./encoding";
import type { Env } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
