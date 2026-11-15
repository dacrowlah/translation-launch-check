import { describe, expect, it } from "vitest";
import { numberRows } from "../../support/rows";

describe("candidates pair by value first", () => {
  it.each([
    [
      "24-hour delivery on orders before 9 PM",
      "Livraison en 24 h pour toute commande avant 21 h",
      "fr-FR",
    ],
    [
      "Order before 9 PM for 24-hour delivery",
      "Commandez avant 21 h pour une livraison en 24 h",
      "fr-FR",
    ],
    [
      "24-hour delivery on orders before noon",
      "Livraison en 24 h pour toute commande avant midi",
      "fr-FR",
    ],
    [
      "Sale: 12 hours only, ends at midnight",
      "Soldes : 12 h seulement, fin \u00e0 minuit",
      "fr-FR",
    ],
    ["Ends at midnight: 12 hours only", "Fin \u00e0 minuit : 12 h seulement", "fr-FR"],
    [
      "Delivery in 2 hours when you order by 6 PM",
      "Livraison en 2 h pour toute commande avant 18 h",
      "fr-FR",
    ],
    ["24-hour flash sale ends at 9 PM", "Vente flash de 24 h : fin \u00e0 21 h", "fr-FR"],
    [
      "Free returns within 24 hours. Open 10 AM - 8 PM",
      "Retour gratuit sous 24 h. Ouvert de 10 h \u00e0 20 h",
      "fr-FR",
    ],
    [
      "Ships within 1 to 2 hours - order by 2 PM",
      "Exp\u00e9di\u00e9 sous 1 \u00e0 2 h - commandez avant 14 h",
      "fr-FR",
    ],
    ["Delivery in 1-2 hours, ends 9 PM", "Livraison en 1 \u00e0 2 h, fin \u00e0 21 h", "fr-FR"],
    ["Sizes 8 and 10 until 9 PM", "Gr\u00f6\u00dfen 8 und 10 bis 21 Uhr", "de-DE"],
  ])("a_duration_beside_a_deadline_is_no_finding_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    ["Midnight Blue jacket", "Midnight Blue Jacke", "de-DE"],
    [
      "Midnight Blue jacket - order by noon",
      "Jacke in Midnight Blue - bestellen bis 12 Uhr",
      "de-DE",
    ],
    ["Midnight Blue jacket - order by noon", "Veste Midnight Blue - commandez avant midi", "fr-FR"],
    [
      "Midnight Blue jacket - order by noon",
      "\u30df\u30c3\u30c9\u30ca\u30a4\u30c8\u30d6\u30eb\u30fc - " +
        "\u6b63\u5348\u307e\u3067\u306b\u3054\u6ce8\u6587",
      "ja-JP",
    ],
    [
      "Midnight Blue hoodie, delivered in 2 hours",
      "Sweat Midnight Blue, livr\u00e9 en 2 h",
      "fr-FR",
    ],
    ["Midnight Madness: 2 hours only", "Midnight Madness : 2 h seulement", "fr-FR"],
  ])("a_name_opposite_a_candidate_of_another_value_is_no_finding_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_duration_opposite_the_same_plain_number_stays_that_number", () => {
    const target = "Sweat Bleu nuit, livr\u00e9 en 24 h";
    expect(numberRows("Midnight Blue hoodie, delivered in 24 hours", target, "fr-FR")).toEqual([]);
  });

  it.each([
    ["Ends at 9 pm", "Endet um 20 Uhr", "de-DE", [["21:00", "20:00"]]],
    [
      "Ends 9 PM, delivery in 24 hours",
      "Livraison en 24 h, fin \u00e0 22 h",
      "fr-FR",
      [["21:00", "22:00"]],
    ],
    ["Midnight Blue - order by noon", "Midnight Blue - bis 13 Uhr", "de-DE", [[null, "13"]]],
  ])("a_changed_time_beside_a_candidate_is_a_finding_%#", (master, target, locale, expected) => {
    expect(numberRows(master, target, locale)).toEqual(expected);
  });

  it.each([
    [
      "Ends 9 PM",
      "Fin \u00e0 22:00, livraison en 24 h",
      [
        ["21:00", "22:00"],
        [null, "24"],
      ],
    ],
    ["Ends 9 PM", "Fin \u00e0 21 h, livraison en 18 h", [[null, "18"]]],
    ["Ends 9 PM", "Fin \u00e0 21:00 (21 h)", [[null, "21"]]],
    ["Ends 9 PM", "Fin \u00e0 21 h (21 h)", [[null, "21"]]],
    ["Ends 9 PM. 21 left", "Fin \u00e0 21 h. Plus que 21 !", []],
  ])("each_time_of_the_other_side_pairs_with_one_candidate_only_%#", (master, target, expected) => {
    expect(numberRows(master, target, "fr-FR")).toEqual(expected);
  });

  it.each([
    ["Top 21 deals end at 9 PM", "Top 22 : fin \u00e0 21 h", "fr-FR", [["21", "22"]]],
    [
      "Ends 9 PM - 21 items left",
      "Fin \u00e0 21 h - 20 articles restants",
      "fr-FR",
      [["21", "20"]],
    ],
    ["Ends 9 PM. Only 21 left", "Fin \u00e0 21 h", "fr-FR", [["21", null]]],
    ["Ends 8 PM. 20 items", "Endet 20 Uhr", "de-DE", [["20", null]]],
  ])(
    "a_candidate_whose_time_stands_opposite_is_that_time_%#",
    (master, target, locale, expected) => {
      expect(numberRows(master, target, locale)).toEqual(expected);
    },
  );

  it("known_limitation_candidates_of_different_values_on_both_sides_stay_numbers", () => {
    expect(numberRows("Ends at midnight", "Endet um 23 Uhr", "de-DE")).toEqual([[null, "23"]]);
  });

  it("known_limitation_a_bare_range_without_a_half_stays_numbers_beside_a_paired_word", () => {
    const target = "Ge\u00f6ffnet 9-17 Uhr, endet um Mitternacht";
    expect(numberRows("Open 9-5, ends at midnight", target, "de-DE")).toEqual([["5", "17"]]);
  });
});
