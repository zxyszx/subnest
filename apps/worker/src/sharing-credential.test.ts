import { describe, expect, it } from "vitest";

import {
  decodeSharingCredentialBundle,
  decodeSharingCredentialMetadata,
  encodeSharingCredentialBundle,
  encodeSharingCredentialMetadata,
  maskAdditionalCredential,
} from "./sharing-credential";

describe("sharing credential bundles", () => {
  it("keeps legacy encrypted plaintext compatible as a password", () => {
    expect(decodeSharingCredentialBundle("legacy-password")).toEqual({
      password: "legacy-password",
      additionalCredential: null,
    });
    expect(decodeSharingCredentialMetadata("l*************d")).toEqual({
      passwordMask: "l*************d",
      additionalCredential: null,
    });
  });

  it("stores optional visible information independently from the password", () => {
    const bundle = {
      password: "",
      additionalCredential: { name: "最近通知", value: "今晚 8 点维护" },
    };
    const metadata = {
      passwordMask: "",
      additionalCredential: { name: "最近通知", valueMask: maskAdditionalCredential(bundle.additionalCredential.value) },
    };

    expect(decodeSharingCredentialBundle(encodeSharingCredentialBundle(bundle))).toEqual(bundle);
    expect(decodeSharingCredentialMetadata(encodeSharingCredentialMetadata(metadata))).toEqual(metadata);
    expect(metadata.additionalCredential.valueMask).toBe("••••••••");
  });
});
