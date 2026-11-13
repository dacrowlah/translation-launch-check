# Tool contract: the Translation Launch Check tool (`tool/`)

The authoritative contract of this service: what each tool function takes, what it
returns, and the rules it applies. It is consumed by the Translation Launch Check workflow
in Optimizely's Agent Platform ("Mark"). A change to a name, type or behaviour here is a
breaking change for that workflow and needs the owner's approval.

## 1. Context

Seasonal campaigns run on the same date in every market and are localized from one master.
A local reviewer then checks the translations by eye, and the costly mistakes are
mechanical: a number, date, merge tag, link parameter or promo code that differs from the
master; copy that no longer fits its channel; copy in the wrong language; leftover template
text. The use case came out of ideating with Mark.

A marketer attaches a localization file (a CSV string table: master copy plus each
translation). The workflow reads it, calls this service for every rule-based check, asks
models only for language judgment (meaning, claims, tone, fix drafts), and reports a verdict
per language. This service supplies everything deterministic:
- every rule check of the translation against the master;
- exact counting: characters, double-width characters, SMS segments;
- the language check (is each column and each long line in the right language);
- the corrected line for market spelling;
- severities, from one rules file.

The platform's sandboxes have no internet access, and language models miscount characters
and miss mechanical differences, so these jobs live here.

Callers:
- `localization_check` is called from workflow code steps (via `opal_tms_sdk`): once to
  check the whole package, and once to re-check the suggested fixes. No model sits between
  this service and the result.
- `copy_fit_check` is called by the Translation Fix Suggestions agent, which checks each
  draft and redrafts if it does not fit.

The service is a screening aid. It never decides a verdict: the caller turns findings and
check statuses into verdicts.

## 2. Service rules (all functions)

- **Discovery** at `GET /discovery` is public. Every tool call requires
  `Authorization: Bearer <TOOL_BEARER_TOKEN>`. The token is at least 32 characters, or the
  service refuses to start.
- **Never throw at the caller.** Every expected problem is a status on the item it
  concerns. HTTP 500 is reserved for genuine defects.
- **Statuses only, no technical diagnostics** in responses: no stack traces, headers, file
  paths or timings. The caller turns statuses into user-facing text.
- **No outbound requests.** The service never fetches anything. User input never becomes a
  URL that is requested; URLs in the copy are only compared.
- **No campaign copy in logs.** Technical detail goes to the server log only, as one
  structured line per call: tool, status, counts, latency. Never secrets, headers or any
  text from a request. The SDK's own request-body logging is silenced.
- **Inputs are validated** with zod against the parameter tables below. The bounds come from
  `limits` in `config/rules.json` (`max_lines`, `max_targets`, `max_cell_chars`) where they
  exist there, and are fixed in the schemas otherwise. A malformed call returns a validation
  error and does no work.
- **Determinism:** the same inputs, the same rules file and the same run date give the same
  output. Output keeps input order: locales in the order given, lines in the order given,
  findings in the order of the check table (section 3).

## 3. `localization_check`

One call covers every locale and line (batched).

| Param | Type | Req | Description |
|---|---|---|---|
| `campaign` | string | yes | Campaign name, at most 100 characters. Not used by any check; never logged |
| `master_locale` | string | yes | Exactly `"en-US"` |
| `locales` | string[] | yes | The target locales, 1-5 entries, each matching `^[a-z]{2}-[A-Z]{2}$`. The master is not repeated here |
| `lines` | object[] | yes | 1-50 entries: `{ id, channel, field, texts }` |

Line fields:
- `id`, `channel`, `field`: strings, each at most 40 characters;
- `texts`: an object of locale -> text, each text at most 1000 characters. It must hold the
  master locale and every locale in `locales`; a missing key is a validation error.

Types are in `tool/src/domain/types.ts`. It exports `ALL_CHECK_IDS` (a readonly tuple of the
24 check ids below) and derives `CheckId` from it, so the list exists once.

Response (`LocalizationReport`):
```
{
  rules:   { version, effective_date },
  master:  LocaleReport,            // locale "en-US": only the two language checks
  locales: [LocaleReport]           // one per requested locale, in input order
}
LocaleReport = {
  locale,
  status: "checked" | "unsupported_locale",
  column_findings: [Finding],       // whole-column findings (language_column)
  lines: [{ id, length, findings: [Finding], spelling_fix }],
  checks: { <check id>: "verified" | "not_applicable" }
}
Finding = { check, severity, detail, expected, found }
```

Field values:
- `severity`: `blocker` | `warning` | `info`. `detail` is a plain-language sentence built
  from a template; `expected` and `found` quote the master and translation values, or are
  null.
- `lines[].length`: `{ value, limit, unit }` for the line's channel and field, with `unit`
  `chars` | `ads_chars` | `sms_segments`. It is shown even when the line fits. It is null
  for a channel/field pair that is not in the channel table (no length finding is made).
- `lines[].spelling_fix`: the whole line with the market-spelling replacements applied, built
  by code, or null when the line has no spelling finding.
- `rules` is the version and effective date of `config/rules.json`. The caller shows
  "Checked against market rules v<version> (effective <date>)" in every report.

Checks and default severities (the 24 check ids; severities come from `severities` in
`config/rules.json` and can be changed there):

| Check id | Flags | Default |
|---|---|---|
| `numbers` | A number or percentage differs from the master | blocker |
| `currency_amount` | A currency amount differs (same currency) | blocker |
| `currency_code` | The currency differs from the master ("confirm local price") | warning |
| `dates` | A date (day, month) differs from the master | blocker |
| `weekday_date_match` | A weekday does not match its date (next occurrence from the run date) | warning |
| `merge_tags` | Merge tags differ: missing, renamed or extra | blocker |
| `url_params` | A URL is missing, its host differs, or a query parameter differs | blocker |
| `url_path` | A URL path differs (localized path) | info |
| `promo_codes` | A promo code differs (pattern in rules) | blocker |
| `template_leftovers` | Template leftover text in the translation (section 4) | blocker |
| `length_hard` | Over a hard channel limit (e.g. ads headline 30) | blocker |
| `length_soft` | Over a soft limit (e.g. email subject 40) | warning |
| `formality` | Formality differs from the locale's rule, or is mixed | warning |
| `glossary_forbidden` | A forbidden glossary term is present | blocker |
| `glossary_dnt` | A do-not-translate term is missing | warning |
| `untranslated` | The line equals the master, beyond do-not-translate terms | warning |
| `language_column` | The whole column reads as another language (section 5) | blocker |
| `language_line` | A line with 20+ letters reads as another language (section 5) | warning |
| `typography` | French spacing before `; : ! ?` and inside guillemets | info |
| `length_ratio` | The translation is longer than the locale's ratio to the master | info |
| `trademark_symbols` | A trademark symbol (TM, R, C) is missing or added | warning |
| `markup` | HTML tags differ from the master, or a tag is left unclosed | blocker |
| `time_zone` | A time or deadline without a time zone | warning |
| `locale_spelling` | A US spelling in en-GB, or the `ss` rule in de-CH | warning |

Behaviour:
- **Locale-aware parsing:** decimal and thousands separators (`1.299,00`, `1 299,00` with a
  narrow no-break space, `1,299.00`, `1'299.50`), `20 %` vs `20%`, full-width digits, month
  and weekday names for en, de, fr and ja, and Japanese month-day dates written with kanji.
  Tokens that are only reordered (merge tags, URLs, dates) are not findings.
- **Numeric dates** are read in each locale's own order (`11/29` in en-US, `29/11` in
  en-GB), from `date_order` in rules.
- **Trademark symbols** are compared as a multiset per line, master against translation.
- **Time zones:** a translation containing a time or deadline (clock times, "midnight",
  "noon", "today only" and their de, fr and ja equivalents, from `time_expressions`) and no
  token from `time_zones` is a warning. It is checked on each translation, so a zone the
  master names but a translation drops is caught too.
- **Market spelling:** whole words only, keeping the word's case. en-GB uses the US-to-UK
  word list plus `ize_to_ise` (with its exceptions); de-CH replaces the German sharp s (`\u00df`) with `ss`.
  One warning per line lists every word found and its replacement, and `spelling_fix`
  carries the corrected line.
- **HTML tags:** names are compared as a multiset per line, and the translation's tags must
  be balanced (void tags such as `br` and `img` excepted). Links inside `href` are covered
  by the URL checks.
- **Same-language locales:** `untranslated` is not applicable when the target's language
  equals the master's (en-GB).
- **Formality** is checked by the locale's pronoun and verb-form lexicon. It is not
  applicable for locales whose rule is `not_applicable` (en-US, ja-JP, en-GB).
- **Length** is measured in the channel's unit with the rules in section 4.

The `checks` status rules (so a check that did not run can never look like a pass):
- Every locale with `status: "checked"` lists all 24 check ids, except `master`, which lists
  only `language_column` and `language_line`.
- `verified`: the check ran on at least one line or column where it applies.
- `not_applicable`: it applied to none (e.g. `formality` for ja-JP, `untranslated` for en-GB,
  `language_line` when every line has fewer than 20 letters, `glossary_dnt` when no master
  line holds a do-not-translate term).
- A locale's `checks` never says `verified` for a check the service could not run.

Unsupported locale: a locale that is well-formed but missing from `locales` in
`config/rules.json` returns `status: "unsupported_locale"`, no findings, `lines: []` and
`checks: {}`. The caller must treat it as not checked, never as clean. The call still
succeeds for the other locales.

## 4. `copy_fit_check`

| Param | Type | Req | Description |
|---|---|---|---|
| `items` | object[] | yes | 1-50 entries: `{ channel, field, text, master? }`. `channel` and `field` at most 40 characters; `text` and `master` at most 1000 characters |

Response: `[{ channel, field, length, limit, unit, fits, over_by, encoding, template_artifacts, severity }]`.

- `channel` and `field` must match an entry in the channel table (section 6). An unknown
  pair returns `limit: null`, `fits: null`, `severity: "warning"`.
- `length` is measured in the channel's `unit`:
  - `ads_chars`: double-width (CJK) characters count 2;
  - `sms_segments`: GSM-7 vs UCS-2 detection, then segment count (160/153 for GSM-7, 70/67
    for UCS-2; one non-GSM character switches the whole message to UCS-2);
  - `chars` for everything else.
- `template_artifacts` lists leftover placeholders or prompt text found in `text`: `[[...]]`,
  `{skill:...}`, and the phrases in the artifact list in `config/rules.json`.
  `{{...}}` counts as an artifact only if it is not in `master`; without `master`, no
  `{{...}}` counts, because a merge tag is legitimate copy.
- `severity`:
  - `blocker` when any template artifact is found;
  - else `warning` when over the limit;
  - else `null`.
  - Exception: channels marked `soft` in the channel table (e.g. email subject) never exceed
    `warning`.
- `localization_check` uses the same counting and artifact code (`length_hard`,
  `length_soft`, `template_leftovers`), so the two functions cannot disagree.

## 5. Language check

No Mark tool or agent detects a text's language, so this service does it, deterministically
and offline. A back-translation alone cannot do it: it turns any language into clean English.

- **Script rules (certain):** a ja-JP line must contain Japanese characters; de-DE, fr-FR,
  en-US (and the other latin-script locales) lines must not. The script of each locale is
  `script` in rules.
- **Statistics:** the `eld` library (Apache-2.0, no dependencies), "small" dataset, restricted
  to a candidate set. The candidates are the latin-script languages of every locale in
  `config/rules.json` (`en`, `de`, `fr`), not only the file's own languages, so a file with
  two languages can still catch a third language pasted in (builder's call).
- **Stripping:** before detecting, remove what is not language: merge tags, URLs, promo
  codes, numbers, prices, brand and do-not-translate terms (all covered by other checks).
- **Whole column** (`language_column`, blocker): all of a locale's stripped lines are joined
  and checked as one text; a mismatch reads "the de-DE column reads as French". This works
  even when every line is short. The master column is checked the same way.
- **Single line** (`language_line`, warning): only lines with `min_letters` (20) or more
  letters left after stripping. Shorter lines, and lines made only of brand or
  do-not-translate terms, are not applicable.
- **Unsure:** when the detector answers null for a column, the finding is a `warning` on
  `language_column`, "couldn't confirm the language" (builder's call). It is never silent and
  never a pass.
- The locale-to-language and script mapping, the letter threshold and the severities live
  in `config/rules.json`.

## 6. Rules (`config/rules.json`)

The one source of market rules. The tool reads it at start-up and refuses to start if it is
invalid. The workflow's skill text is rendered from the same file, so the checks and the
agents' instructions cannot drift apart. Values are the builder's defaults and can be
changed without code changes. Non-ASCII values are written as `\uXXXX` escapes.

Top-level keys:
- `version`, `effective_date` (`YYYY-MM-DD`): returned with every result;
- `limits`: `max_file_bytes`, `max_lines`, `max_targets`, `max_cell_chars`;
- `master_locale`;
- `locales`: per locale `language`, `script`, `decimal`, `group`, `formality`, and where
  needed `date_order`, `length_ratio_max`, `typography`;
- `locale_aliases`: near misses to suggest (`jp` -> `ja-JP`);
- `channels`: the channel table below;
- `severities`: one severity for each of the 24 check ids (exactly those keys);
- `spelling`: per locale word lists and character rules (en-GB, de-CH);
- `trademark_symbols`, `void_tags`;
- `time_expressions` (per language), `time_zones`;
- `merge_tag_patterns`, `promo_code_pattern`;
- `artifact_patterns`, `artifact_phrases`;
- `currencies`: symbol or code to ISO 4217;
- `calendar`: month and weekday names for en, de, fr, ja;
- `formality_markers`: formal and informal lexicons for de and fr;
- `glossary`: `do_not_translate`, `approved_translations`, `forbidden`;
- `language_check`: `min_letters`.

Channel table (`channels`):

| Channel | Field | Limit | Unit | Soft |
|---|---|---|---|---|
| email | subject | 40 | chars | yes |
| email | preheader | 90 | chars | yes |
| email | body | none | chars | yes |
| email | cta | none | chars | yes |
| google_ads | headline | 30 | ads_chars | no |
| google_ads | description | 90 | ads_chars | no |
| sms | body | 1 | sms_segments | no |
| web | meta_title | 60 | chars | yes |
| web | meta_description | 155 | chars | yes |

Sources:
- [Google Ads help](https://support.google.com/google-ads/answer/7653455): double-width
  characters count 2.
- [Twilio](https://twilio.com/docs/glossary/what-sms-character-limit) and
  [Plivo](https://plivo.com/docs/sms/concepts/encoding-and-concatenation): SMS encoding and
  segments.
- [Typecount](https://typecount.com/blog/email-subject-line-length): email subjects have no
  hard limit, so their limit is soft (mobile inboxes cut off around 40 characters).
