import { describe, expect, it } from "vitest";

import { mailDocument } from "@/pages/shared-inbox";

describe("shared inbox email links", () => {
  it("opens safe links in an isolated new tab", () => {
    const html = mailDocument('<a href="https://example.com/verify">Verify</a>');

    expect(html).toContain('href="https://example.com/verify"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("removes active and unsupported link schemes", () => {
    const html = mailDocument('<a href="javascript:alert(1)">Unsafe</a><a href="data:text/html,x">Data</a>');

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
  });
});
