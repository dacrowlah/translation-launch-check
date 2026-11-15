import { describe, expect, it } from "vitest";
import { checkFormality } from "../../../src/domain/checks/formality.js";
import { checkGlossary } from "../../../src/domain/checks/glossary.js";
import { checkMarkup } from "../../../src/domain/checks/markup.js";
import { checkTimeZone } from "../../../src/domain/checks/time-zone.js";
import { checkTrademarks } from "../../../src/domain/checks/trademarks.js";
import { checkTypography } from "../../../src/domain/checks/typography.js";
import { checkUntranslated } from "../../../src/domain/checks/untranslated.js";
import { aPair, ctx } from "../../support/builders.js";
import { rows } from "../../support/rows.js";

const CELL =
  '<td align="center" style="font-family:Arial,sans-serif;"><a href="https://x.com">Acheter</a></td>';
const JA_BRAND = "\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed";
const NARROW = "\u202f";

const fr = (target: string) => aPair("Hi", target, "fr-FR");
const typographyRows = (target: string) => rows(checkTypography(fr(target), ctx("fr-FR")));
const zoneRows = (target: string, locale = "de-DE") =>
  rows(checkTimeZone(aPair("Hi", target, locale), ctx(locale)));

describe("wording checks read the visible copy", () => {
  it("typography_ignores_attributes_css_and_links", () => {
    expect(typographyRows(CELL)).toEqual([]);
    expect(typographyRows('<a href="mailto:aide@example.com">Aide</a>')).toEqual([]);
  });
  it("typography_still_flags_visible_copy_inside_markup", () => {
    expect(typographyRows("<p>Offre: aujourd'hui</p>")).toEqual([[`e${NARROW}:`, "e:"]]);
  });
  it("typography_sees_a_brand_or_code_glued_to_a_mark", () => {
    expect(typographyRows("D\u00e9couvrez TrailPro!")).toEqual([[`o${NARROW}!`, "o!"]]);
    expect(typographyRows("Code BF26!")).toEqual([[`6${NARROW}!`, "6!"]]);
  });
  it("typography_sees_a_mark_glued_to_inline_markup", () => {
    expect(typographyRows("<b>Soldes</b>!")).toEqual([[`s${NARROW}!`, "s!"]]);
    expect(typographyRows('Achetez <a href="https://x.com">ici</a>!')).toEqual([
      [`i${NARROW}!`, "i!"],
    ]);
  });
  it.each([
    "Rendez-vous sur<br>https://x.com/fr",
    "<td>Plus d'infos</td><td>https://x.com/fr</td>",
    'Voir<a href="https://x.com/fr">https://x.com/fr</a>',
    "Aide<br>aide@example.fr",
  ])("typography_never_reads_a_link_after_a_tag_as_copy_%#", (target) => {
    expect(typographyRows(target)).toEqual([]);
  });
  it("typography_reads_a_no_break_space_reference_as_a_space", () => {
    expect(typographyRows("Code&nbsp;: BF26")).toEqual([]);
    expect(typographyRows("Code: BF26")).toEqual([[`e${NARROW}:`, "e:"]]);
  });
  it("forbidden_term_inside_a_link_is_found", () => {
    const pair = aPair("Hi", '<a href="https://x.com/a">Garantiert</a>');
    expect(rows(checkGlossary(pair, ctx()).glossary_forbidden)).toEqual([[null, "Garantiert"]]);
  });
  it("forbidden_term_only_in_an_attribute_is_not_found", () => {
    const pair = aPair("Hi", '<span class="garantiert">Sicher</span>');
    expect(checkGlossary(pair, ctx()).glossary_forbidden).toEqual({
      applicable: true,
      findings: [],
    });
  });
  it("informal_word_inside_a_link_is_found", () => {
    const pair = aPair("Hi", '<a href="https://x.com/a">Entdecke mehr</a>');
    expect(rows(checkFormality(pair, ctx()))).toEqual([["formal", "Entdecke"]]);
  });
  it("an_informal_word_only_in_an_attribute_is_not_found", () => {
    const pair = aPair("Hi", '<span title="du">Entdecken Sie mehr</span>');
    expect(checkFormality(pair, ctx())).toEqual({ applicable: true, findings: [] });
  });
  it("transliterated_brand_inside_a_link_misses_dnt", () => {
    const pair = aPair(
      '<a href="https://x.com/a">TrailPro</a>',
      `<a href="https://x.com/a">${JA_BRAND}</a>`,
      "ja-JP",
    );
    expect(rows(checkGlossary(pair, ctx("ja-JP")).glossary_dnt)).toEqual([["TrailPro", null]]);
  });
  it("a_brand_kept_inside_a_link_passes_dnt", () => {
    const pair = aPair('<a href="https://x.com/a">TrailPro</a>', "<b>TrailPro</b> ist da");
    expect(checkGlossary(pair, ctx()).glossary_dnt).toEqual({ applicable: true, findings: [] });
  });
  it("a_time_zone_only_in_an_attribute_does_not_count", () => {
    expect(zoneRows('<span title="CET">Endet um 23:59 Uhr</span>')).toEqual([[null, "23:59 Uhr"]]);
    expect(zoneRows("<span>Endet um 23:59 Uhr CET</span>")).toEqual([]);
  });
  it("a_markup_only_line_is_never_untranslated", () => {
    expect(checkUntranslated(aPair("<br>", "<br>"), ctx()).applicable).toBe(false);
    const same = aPair("<b>Shop now</b>", "<b>Shop now</b>");
    expect(rows(checkUntranslated(same, ctx()))).toEqual([[null, "<b>Shop now</b>"]]);
  });
  it("a_trademark_reference_counts_as_its_symbol", () => {
    const named = aPair("TrailPro&trade; jackets", "TrailPro\u2122 Jacken");
    expect(checkTrademarks(named, ctx()).findings).toEqual([]);
    const dropped = aPair("TrailPro&trade; jackets", "TrailPro Jacken");
    expect(rows(checkTrademarks(dropped, ctx()))).toEqual([["\u2122", null]]);
  });
});

describe("time zone wording", () => {
  it("apres_midi_is_no_time", () => {
    expect(checkTimeZone(fr("Livraison cet apr\u00e8s-midi"), ctx("fr-FR")).applicable).toBe(false);
    expect(zoneRows("Livraison avant midi", "fr-FR")).toEqual([[null, "midi"]]);
  });
  it("french_et_is_a_word_not_a_time_zone", () => {
    // found keeps the French cue word ("\u00e0 21 h"): the rest of F33, cut by R118.
    expect(zoneRows("SOLDES ET PROMOS \u00e0 21 h", "fr-FR")).toEqual([[null, "\u00e0 21 h"]]);
    expect(zoneRows("SOLDES \u00e0 21 h CET", "fr-FR")).toEqual([]);
  });
  it("et_is_still_a_time_zone_outside_french", () => {
    expect(zoneRows("Ends at 9 pm ET", "en-GB")).toEqual([]);
  });
});

describe("markup tags", () => {
  it("an_email_in_angle_brackets_is_no_tag", () => {
    const text = "Fragen? Schreiben Sie an <help@example.com>.";
    expect(checkMarkup(aPair(text, text), ctx())).toEqual({ applicable: false, findings: [] });
  });
  it("a_tag_with_attributes_or_self_closing_is_still_a_tag", () => {
    const pair = aPair('<img src="a.png"/> <b class="x">Sale</b>', '<img src="a.png"/> <b>Soldes');
    expect(rows(checkMarkup(pair, ctx()))).toEqual([["</b>", null]]);
  });
});
