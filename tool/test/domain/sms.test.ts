import { describe, expect, it } from "vitest";
import { smsEncoding } from "../../src/domain/sms";

describe("smsEncoding", () => {
  it.each([
    ["\u00e9", "GSM-7"],
    ["\u00c7", "GSM-7"],
    ["\u20ac", "GSM-7"],
    ["\u00e7", "UCS-2"],
    ["Soldes \u00e0 -20 % \u2013 vite", "UCS-2"],
  ])("tells_gsm_7_from_ucs_2_%#", (text, encoding) => {
    expect(smsEncoding(text)).toBe(encoding);
  });
});
