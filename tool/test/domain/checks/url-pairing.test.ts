import { describe, expect, it } from "vitest";
import { pairUrls } from "../../../src/domain/checks/url-pairing.js";
import { extractUrls } from "../../../src/domain/tokens/urls.js";

const links = (text: string) => Object.freeze(extractUrls(text).urls.map((u) => Object.freeze(u)));
const raws = (pairs: ReturnType<typeof pairUrls>) => pairs.map(([m, t]) => [m?.raw, t?.raw]);

describe("pairUrls", () => {
  it("pairs_frozen_links_by_page_then_lists_the_unpaired", () => {
    const masters = links("https://e.com/x?a=1 https://e.com/y https://e.com/z");
    const targets = links("https://e.com/y https://e.com/x?a=2");
    expect(raws(pairUrls(masters, targets))).toEqual([
      ["https://e.com/x?a=1", "https://e.com/x?a=2"],
      ["https://e.com/y", "https://e.com/y"],
      ["https://e.com/z", undefined],
    ]);
  });

  it("lists_a_target_only_link_last", () => {
    expect(raws(pairUrls(links(""), links("https://e.com/x")))).toEqual([
      [undefined, "https://e.com/x"],
    ]);
  });
});
