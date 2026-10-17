import { describe, expect, it } from "vitest";
import { challengeUrl, channelFromToken, shareText, whatsappUrl } from "../src";

const ctx = { baseUrl: "https://clash.example.com", code: "abcDEF2345", gameName: "Naija Rush", score: 1250, displayName: "Tolu" };

describe("share links", () => {
  it("tags each channel so arrivals can be attributed", () => {
    expect(challengeUrl(ctx, "whatsapp")).toBe("https://clash.example.com/c/abcDEF2345?s=wa");
    expect(channelFromToken("tt")).toBe("tiktok");
    expect(channelFromToken(null)).toBe("direct");
    expect(channelFromToken("zz")).toBe("other");
  });

  it("builds an editable WhatsApp message containing the link", () => {
    const text = shareText(ctx, "whatsapp");
    expect(text).toContain("Tolu scored 1,250");
    const url = new URL(whatsappUrl(text));
    expect(url.hostname).toBe("wa.me");
    expect(url.searchParams.get("text")).toContain("/c/abcDEF2345?s=wa");
  });

  it("falls back to first person when no nickname is shared", () => {
    expect(shareText({ ...ctx, displayName: null }, "copy")).toMatch(/^I scored/);
  });
});
