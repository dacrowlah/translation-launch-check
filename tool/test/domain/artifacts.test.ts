import { describe, expect, it } from "vitest";
import { copyFitArtifacts, findArtifacts } from "../../src/domain/artifacts";
import { testRules } from "../support/rules";

const MASTER = "Hi {{first_name}}";

describe("findArtifacts", () => {
  it("lists_each_leftover_once_in_order", () => {
    expect(findArtifacts("[[file]] and [[cta]] and [[file]]", testRules())).toEqual([
      "[[file]]",
      "[[cta]]",
    ]);
  });
  it("leaves_merge_tags_to_the_merge_tag_check", () => {
    expect(findArtifacts("Hallo {{vorname}} [[cta]]", testRules())).toEqual(["[[cta]]"]);
  });
  it("lists_leftovers_in_order_of_first_appearance_across_patterns_and_phrases", () => {
    const text = "Jetzt kaufen (mindestens eines erforderlich) [[cta]] {0}";
    expect(findArtifacts(text, testRules())).toEqual([
      "(mindestens eines erforderlich)",
      "[[cta]]",
      "{0}",
    ]);
  });
  it("a_placeholder_inside_another_leftover_is_part_of_it", () => {
    expect(findArtifacts("Hallo [[first_name]] und [NAME]", testRules())).toEqual([
      "[[first_name]]",
      "[NAME]",
    ]);
  });
  it("finds_phrases_ignoring_case", () => {
    expect(findArtifacts("HERE IS THE TRANSLATION: hi", testRules())).toEqual([
      "HERE IS THE TRANSLATION",
    ]);
  });
});

describe("copyFitArtifacts", () => {
  it("a_merge_tag_from_the_master_is_not_an_artifact", () => {
    expect(copyFitArtifacts("Hallo {{first_name}}", MASTER, testRules())).toEqual([]);
  });
  it("a_merge_tag_the_master_lacks_is_an_artifact_in_text_order", () => {
    expect(copyFitArtifacts("[[cta]] Hallo {{vorname}}", MASTER, testRules())).toEqual([
      "[[cta]]",
      "{{vorname}}",
    ]);
  });
  it("a_tag_compares_by_name_so_a_translated_default_is_no_artifact", () => {
    const master = 'Hi {{ first_name | default: "you" }}';
    expect(copyFitArtifacts('Hallo {{first_name | default: "du"}}', master, testRules())).toEqual(
      [],
    );
  });
  it("copy_fit_lists_a_leftover_once_with_the_placeholder_inside_it", () => {
    expect(copyFitArtifacts("Hallo [[first_name]]", MASTER, testRules())).toEqual([
      "[[first_name]]",
    ]);
  });
  it("without_master_a_merge_tag_is_not_an_artifact", () => {
    expect(copyFitArtifacts("Hallo {{vorname}}", null, testRules())).toEqual([]);
  });
  it("a_merge_tag_written_with_full_width_braces_is_an_artifact", () => {
    const text = "\uff5b\uff5bfirst_name\uff5d\uff5d\u69d8";
    expect(copyFitArtifacts(text, MASTER, testRules())).toEqual([
      "\uff5b\uff5bfirst_name\uff5d\uff5d",
    ]);
  });
  it("a_full_width_tag_after_folded_text_is_listed_as_written", () => {
    const text =
      "\u30e9\u30b9\u30c8\u30c1\u30e3\u30f3\u30b9\u2026\uff5b\uff5bfirst_name\uff5d\uff5d\u69d8";
    expect(copyFitArtifacts(text, MASTER, testRules())).toEqual([
      "\uff5b\uff5bfirst_name\uff5d\uff5d",
    ]);
  });
  it("a_valid_tag_with_full_width_text_in_its_default_is_no_artifact", () => {
    const master = 'Hi {{ first_name | default: "there" }}';
    const text = '{{ first_name | default: "\u30b2\u30b9\u30c8\uff01" }}\u69d8';
    expect(copyFitArtifacts(text, master, testRules())).toEqual([]);
  });
  it("an_ideographic_space_inside_a_tag_breaks_it", () => {
    const text = "{{ first_name\u3000}}\u69d8";
    expect(copyFitArtifacts(text, "Hi {{ first_name }},", testRules())).toEqual([
      "{{ first_name\u3000}}",
    ]);
  });
  it("a_partly_full_width_merge_tag_is_an_artifact_without_a_master", () => {
    expect(copyFitArtifacts("{{first_name\uff5d\uff5d", null, testRules())).toEqual([
      "{{first_name\uff5d\uff5d",
    ]);
  });
});
