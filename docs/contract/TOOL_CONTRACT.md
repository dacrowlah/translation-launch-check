# Tool contract: the Translation Launch Check tool (`tool/`)

The authoritative contract of this service: what each tool function takes, what it
returns, and the rules it applies. It is consumed by the Translation Launch Check workflow
in Optimizely's Agent Platform ("Mark"). A change to a name, type or behaviour here is a
breaking change for that workflow and needs the owner's approval.

Two companion documents:
- [BEHAVIOUR.md](BEHAVIOUR.md): how the value checks read copy (numbers, money, dates, times,
  links, merge tags, promo codes), rule by rule, with examples run against the tool.
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md): what the tool does not do, or does
  imperfectly, and why each gap is accepted.

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
- the language check (is each column and each line in the right language and script);
- the corrected line for market spelling;
- severities from one rules file, and a confidence on every finding: `certain`, or `unsure`
  when the tool could not tell and a person should look.

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

- **Routes.** The service answers exactly three routes: `GET /discovery`,
  `POST /tools/localization-check` and `POST /tools/copy-fit-check`. Any other method or path
  gets HTTP 404 `{"status":"not_found"}`, before the body is read and before any token check;
  nothing of the request is echoed.
- **Auth.** Discovery is public. Every tool call requires
  `Authorization: Bearer <TOOL_BEARER_TOKEN>`. A missing or wrong token gets the SDK's own
  HTTP 401. The token is at least 32 characters with no leading or trailing whitespace, or the
  service refuses to start.
- **Every tool reply is HTTP 200 with a top-level `status` token:**
  - `ok`, with the result's fields beside it at the top level;
  - `invalid_input`: the parameters failed validation (below); no work was done;
  - `invalid_request`: the request body could not be read (malformed JSON, a body over
    256 KB, a charset that is not a UTF encoding);
  - `internal_error`: a defect.

  A reply other than `ok` carries nothing else (the SDK's 401 carries its own short
  `detail`): no message, field names, validation text,
  echo of the input, stack trace, header or timing. Mark may read a response aloud, so the
  token is the only failure signal. Expected problems with the copy are never failures: they
  are findings and statuses inside an `ok` reply.
- **Order of handling.** Route check, then body parsing, then the SDK's token check, then
  validation. So a malformed or oversized body gets `invalid_request` whether or not the token
  is right, and a readable body with a missing or wrong token gets 401.
- **Request body:** JSON, at most 256 KB. A 64 KB localization file's package, with JSON
  escaping, fits.
- **Inputs are validated** with zod against the parameter tables below, inside the tool
  handler. The bounds come from `limits` in `config/rules.json` (`max_lines`, `max_targets`,
  `max_cell_chars`) where they exist there, and are fixed in the schemas otherwise. String
  lengths count code points (Unicode characters), as the workflow counts them. The workflow
  validates before calling, so `invalid_input` means a caller defect.
- **No outbound requests.** The service never fetches anything. User input never becomes a
  URL that is requested; URLs in the copy are only compared.
- **No campaign copy in logs.** The service writes one JSON line to stdout per event, never
  secrets, headers or any text from a request:
  - each tool call: `{event, tool, status, latency_ms, lines, locales}`, where `event` is
    `tool_call` (status `ok` or `invalid_input`) or `defect` (status `internal_error`), and
    `lines` and `locales` are the counts of a successful call (0 otherwise);
  - each request refused before any tool ran: `{event: "request_failed", status}`, with status
    `invalid_request` (or `internal_error` for any other error at that stage).

  A 404 or 401 writes no line. The SDK's own console logging (request bodies, results,
  stacks) is silenced.
- **Determinism:** the same inputs, the same rules file and the same run date give the same
  output. Output keeps input order: locales in the order given, lines in the order given,
  findings in the order of the check table (section 3).

## 3. `localization_check`

One call covers every locale and line (batched).

| Param | Type | Req | Description |
|---|---|---|---|
| `campaign` | string | yes | Campaign name, at most 100 characters. Not used by any check; never logged |
| `master_locale` | string | yes | Must equal `master_locale` in `config/rules.json` (`"en-US"`) |
| `locales` | string[] | yes | The target locales, 1-5 entries (`max_targets`), each matching `^[a-z]{2}-[A-Z]{2}$`. Unique, and never the master |
| `lines` | object[] | yes | 1-50 entries (`max_lines`): `{ id, channel, field, texts }` |

Line fields:
- `id`, `channel`, `field`: strings, each at most 40 characters;
- `texts`: an object of locale -> text, each text at most 1000 characters
  (`max_cell_chars`). Its keys match `^[a-z]{2}-[A-Z]{2}$` and are exactly the master locale
  and every locale in `locales`, no other.

Any violation is `invalid_input`.

Types are in `tool/src/domain/types.ts`. It exports `ALL_CHECK_IDS` (a readonly tuple of the
24 check ids below) and derives `CheckId` from it, so the list exists once.

Response:
```
{
  status:  "ok",
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
Finding = { check, severity, confidence, detail, expected, found }
```

Field values:
- `severity`: `blocker` | `warning` | `info`.
- `confidence`: `certain` | `unsure`, on every finding.
  - `certain`: the tool is sure of the finding. Severity from `severities` in the rules, by
    check.
  - `unsure`: the tool could not tell, and the finding is a question for a person. Its
    severity is the rules' one `unsure_severity` (`warning`), whatever the check's own
    severity, so with the shipped rules an unsure finding never blocks on its own. Its
    `detail` is phrased as a question.
  - `unsure` appears in exactly two places:
    - `language_column`, when a short Latin-script column reads as another language, when
      the detector cannot place a column, and when a ja-JP column is mostly Latin letters but
      has some Japanese (section 5). A short column read as its own language passes;
    - `currency_code`, when the master has a currency and the translation has no currency in
      its place (`expected` the master's currencies that are missing, `found` null): "Couldn't find the
      master's price in this line. Is it written in a form the tool can't read ..., or is it
      missing?" A different currency, or one only the translation has, is `certain`.
- `detail` is a plain-language sentence built from a template; `expected` and `found` quote
  the master and translation values, or are null.
- `lines[].length`: `{ value, limit, unit }` for the line's channel and field, with `unit`
  `chars` | `ads_chars` | `sms_segments`. It is shown even when the line fits; `limit` is null
  for a channel without a limit. `length` is null for a channel/field pair that is not in the
  channel table (no length finding is made).
- `lines[].spelling_fix`: the whole line with the market-spelling replacements applied, built
  by code, or null when the line has no spelling finding. Only the visible copy changes:
  markup, links, bare domains with a path or subdomain, emails, merge tags, promo codes and
  do-not-translate terms stay byte for byte.
- `rules` is the version and effective date of `config/rules.json`. The caller shows
  "Checked against market rules v<version> (effective <date>)" in every report.

Checks and default severities (the 24 check ids; severities come from `severities` in
`config/rules.json` and can be changed there):

| Check id | Flags | Default |
|---|---|---|
| `numbers` | A number, percentage or clock time differs from the master | blocker |
| `currency_amount` | A currency amount differs (same currency) | blocker |
| `currency_code` | The currency differs from the master ("confirm local price"), or the master's price is not found (unsure) | warning |
| `dates` | A date (month, day) differs, or a weekday the master names differs | blocker |
| `weekday_date_match` | A weekday does not match its date (a date without a year: its next occurrence from the run date) | warning |
| `merge_tags` | Merge tags differ by name: missing, renamed or extra | blocker |
| `url_params` | A URL is missing, its host differs, or a query parameter differs | blocker |
| `url_path` | A URL path differs (localized path) | info |
| `promo_codes` | A promo code differs (pattern in rules) | blocker |
| `template_leftovers` | Template leftover text in the translation (section 4) | blocker |
| `length_hard` | Over a hard channel limit (e.g. ads headline 30) | blocker |
| `length_soft` | Over a soft limit (e.g. email subject 40) | warning |
| `formality` | The informal register in a formal locale (alone or mixed with formal) | warning |
| `glossary_forbidden` | A forbidden glossary term is present | blocker |
| `glossary_dnt` | A do-not-translate term in the master is missing from the translation (its approved translation counts as kept) | warning |
| `untranslated` | The line equals the master, beyond do-not-translate terms and accepted loanwords | warning |
| `language_column` | The whole column reads as another language or script (section 5) | blocker |
| `language_line` | A line reads as another language, or has the wrong script (section 5) | warning |
| `typography` | French spacing before `; : ! ?` and inside guillemets | info |
| `length_ratio` | The translation is longer than the locale's ratio to the master | info |
| `trademark_symbols` | A trademark symbol (TM, R, C) is missing or added | warning |
| `markup` | HTML tags differ from the master, or a tag is left unclosed | blocker |
| `time_zone` | A time or deadline without a time zone | warning |
| `locale_spelling` | A US spelling in en-GB, or the `ss` rule in de-CH | warning |

Behaviour (the value checks in detail: [BEHAVIOUR.md](BEHAVIOUR.md)):
- **What each check reads.** The structural checks (`url_params`, `url_path`, `merge_tags`,
  `promo_codes`, `markup`, `template_leftovers`, length) read the text as sent. The wording
  checks (language, formality, `glossary_forbidden`, `untranslated`, `time_zone`,
  `trademark_symbols`) read the visible copy: markup with its attributes, links, emails, merge
  tags, promo codes and do-not-translate terms removed, character references decoded.
  `glossary_dnt` and `typography` read it with promo codes and do-not-translate terms kept.
  The value checks (`numbers`, money, `dates`) read the text with links, merge tags, promo
  codes and do-not-translate terms taken out, references decoded and NFKC applied; markup is
  not taken out (a known limitation).
- **Locale-aware parsing:** decimal and thousands separators (`1.299,00`, `1 299,00` with a
  narrow no-break space, `1,299.00`, `1'299.50`), `20 %` vs `20%`, full-width digits, month
  and weekday names for en, de, fr and ja, and Japanese month-day dates written with kanji.
  Tokens that are only reordered (merge tags, URLs, dates) are not findings.
- **Ambiguous forms are resolved against the other side of the pair:** a yearless `11/29`, a
  plain-space group (`10 000`, `0800 123 456`), an hour without minutes (`21 h`), a time word
  (`midnight`). A numeric date with a year is read in the locale's `date_order`.
- **Dates:** rows show month and day; a weekday is shown only when the master names weekdays.
  An unchanged date is never a row. A weekday only the translation adds is judged by
  `weekday_date_match` alone.
- **Merge tags** compare by name: a `{{...}}` tag without the ASCII spaces that pad it and
  `| filter` parts; other syntaxes as written. `expected` and `found` quote the tags as
  written. Merge tags are never template leftovers in `localization_check`.
- **Promo codes:** `promo_code_pattern` (two or more capitals then 1-4 digits, or 1-4 digits
  then two or more capitals) with its `{excluded_suffixes}` place filled from
  `promo_code_excluded_suffixes` and every ISO code in `currencies`, so `512GB`, `9PM`, `1ST`
  and `50EUR` are no codes. Compared as a multiset.
- **URLs:** links pair by exact match, then the same host, path and query, then the same host
  and path, then order of appearance. Query parameters compare as a multiset of `key=value`.
- **Trademark symbols** are compared as a multiset per line, master against translation;
  `(TM)`, `(R)` and `(C)` count as the symbols.
- **Time zones:** a translation containing a time or deadline (clock times, "midnight",
  "noon", "today only" and their de, fr and ja equivalents, from `time_expressions`) and no
  token from `time_zones` is a warning. Upper-case codes match exactly, except a language's
  `time_zone_exclusions` (fr `ET`, "and"); phrases ignore case. It is checked on each
  translation, so a zone the master names but a translation drops is caught too.
- **Market spelling:** whole words only, keeping the word's case. en-GB uses the US-to-UK
  word list plus `ize_to_ise` (with its exceptions); de-CH replaces the German sharp s
  (`\u00df`) with `ss`. One warning per line lists every word found and its replacement, and
  `spelling_fix` carries the corrected line.
- **HTML tags:** a tag is `<` and a name starting with a letter, ending at a space, `/` or
  `>` (so `<help@example.com>` is no tag). Names are compared as a multiset per line; when
  they match, the translation's tags must be balanced (void tags such as `br` and `img`
  excepted). Links inside `href` are covered by the URL checks.
- **Same-language locales:** `untranslated` is not applicable when the target's language
  equals the master's (en-GB).
- **Formality** is checked by the language's pronoun and verb-form lexicon
  (`formality_markers`). It is not applicable for locales whose rule is `not_applicable`
  (en-US, ja-JP, en-GB), or on a line with no marker.
- **Length** is measured in the channel's unit with the rules in section 4. The detail names
  the unit: "The text is longer than the channel allows (characters; double-width ones count
  2)."; a soft channel says "longer than the recommended length".
- **Length ratio** applies only when the master has at least `length_ratio_min_chars` (20)
  characters and the locale has a `length_ratio_max`.

The `checks` status rules (so a check that did not run can never look like a pass):
- Every locale with `status: "checked"` lists all 24 check ids, except `master`, which lists
  only `language_column` and `language_line`.
- `verified`: the check ran on at least one line or column where it applies.
- `not_applicable`: it applied to none (e.g. `formality` for ja-JP, `untranslated` for en-GB,
  `language_line` when every Latin-script line has fewer than 20 letters or no line has letters
  left after stripping, `glossary_dnt` when no master
  line holds a do-not-translate term). A check that does not apply to a line carries no
  findings for it.
- A locale's `checks` never says `verified` for a check the service could not run.

Unsupported locale: a locale that is well-formed but missing from `locales` in
`config/rules.json` returns `status: "unsupported_locale"`, no findings, `lines: []` and
`checks: {}`. The caller must treat it as not checked, never as clean. The call still
succeeds for the other locales.

## 4. `copy_fit_check`

| Param | Type | Req | Description |
|---|---|---|---|
| `items` | object[] | yes | 1-50 entries (`max_lines`): `{ channel, field, text, master? }`. `channel` and `field` at most 40 characters; `text` and `master` at most 1000 characters (`max_cell_chars`) |

Response, one result per input item, in input order:
```
{
  status: "ok",
  items: [{ channel, field, length, limit, unit, fits, over_by, encoding,
            template_artifacts, severity }]
}
```

- `channel` and `field` should match an entry in the channel table (section 6). An unknown
  pair is counted in `chars` and returns `limit: null`, `fits: null`, `over_by: null` and
  `severity: "warning"` (unless a template artifact makes it the artifact severity). The
  results carry no `confidence`; this warning means, in effect, "can't tell".
- A known channel without a limit (email body, cta) returns `limit: null`, `fits: true`,
  `over_by: 0`.
- `length` is measured in the channel's `unit`:
  - `ads_chars`: double-width characters count 2 (CJK ideographs and symbols, Hangul,
    full-width forms, CJK Extension B and beyond); half-width katakana count 1;
  - `sms_segments`: GSM-7 vs UCS-2 detection, then segment count (160/153 for GSM-7, where an
    extension character such as the euro sign `\u20ac` or `[` counts 2; 70/67 UTF-16 units for
    UCS-2; one non-GSM character switches the whole message to UCS-2);
  - `chars` (code points) for everything else.
- `encoding` is `GSM-7` or `UCS-2` for an `sms_segments` channel, else null.
- `template_artifacts` lists leftover placeholders or prompt text found in `text`, each once,
  in order of first appearance (an artifact inside another's span is part of it):
  - `artifact_patterns` (`[[...]]`, `{skill:`, a `{0}`-style placeholder) and
    `artifact_phrases` (matched literally, in any case: prompt phrases and bracketed
    placeholders such as `[NAME]`, `[FIRST_NAME]`, `[EMAIL]`);
  - a `{{...}}` tag whose name is not in `master`; without `master`, no `{{...}}` tag counts,
    because a merge tag is legitimate copy;
  - a merge tag written with full-width characters (broken as sent), with or without
    `master`.
- `severity`:
  - `severities.template_leftovers` (`blocker`) when any template artifact is found, on
    every channel;
  - else `warning` for an unknown channel/field pair;
  - else, over the limit: `severities.length_hard` (`blocker`) on a hard channel,
    `severities.length_soft` (`warning`) on a channel marked `soft`;
  - else `null`.
- `localization_check` uses the same counting, the same choice of `length_hard` or
  `length_soft`, and the same artifact list (without the merge-tag part, which `merge_tags`
  covers), so for a known channel/field pair and ASCII merge tags the two functions agree.
  They differ on an unknown pair (copy fit warns; `localization_check` gives `length: null`
  and no finding) and on a full-width `{{tag}}` (a copy-fit artifact; `localization_check`
  sees no tag on either side).

## 5. Language check

No Mark tool or agent detects a text's language, so this service does it, deterministically
and offline. A back-translation alone cannot do it: it turns any language into clean English.

- **Stripping:** before checking, each line is reduced to its words: the visible copy
  (section 3) without accepted loanwords (`accepted_loanwords`, whole words in any case),
  digits, symbols and punctuation. An apostrophe between letters stays (`l'offre`). A line
  with no letters left (only brand terms, loanwords or numbers) is not applicable.
- **Script rules (certain):**
  - a line of a Latin-script locale with any Japanese character is a `language_line` warning
    ("This line has Japanese characters.", or "reads as Japanese" when mostly Japanese), at
    any length;
  - a ja-JP line with letters and no Japanese character is a `language_line` warning, at any
    length ("SALE", "SHOP NOW").

  The script of each locale is `script` in rules.
- **Statistics:** the `eld` library (Apache-2.0, no dependencies), "small" dataset, restricted
  to a candidate set. The candidates are the Latin-script languages of every locale in
  `config/rules.json` (`en`, `de`, `fr`), not only the file's own languages, so a file with
  two languages can still catch a third language pasted in (builder's call).
- **Single line** (`language_line`, warning, certain): a Latin-script line with
  `min_letters` (20) or more letters after stripping that the detector reads as another
  language. A shorter line, or one the detector cannot place, gets no result.
- **Whole column** (`language_column`): all of a locale's stripped lines are joined and
  checked as one text. The master column is checked the same way.
  - Latin-script column:
    - mostly Japanese letters (`japanese_share`, 0.5): a certain blocker, "reads as
      Japanese";
    - read as another language, with `min_letters` or more letters: a certain blocker ("The
      de-DE column reads as French.");
    - read as another language but shorter, or not placed by the detector: an unsure warning
      ("The de-DE column is short and reads as French. Is it German?", "Couldn't confirm the
      de-DE column's language. Is it German?"). Never silent and never a pass.
  - ja-JP column below `japanese_share` Japanese letters:
    - no line holds any Japanese: a certain blocker ("The ja-JP column is mostly not
      Japanese.");
    - some line holds Japanese: an unsure warning ("The ja-JP column is mostly in Latin
      letters. Is it Japanese?").
- The locale-to-language and script mapping, the letter threshold, the Japanese share, the
  loanwords and the severities live in `config/rules.json`.

## 6. Rules (`config/rules.json`)

The one source of market rules. The tool reads it at start-up and refuses to start if it is
invalid: the wrong shape (unknown keys included), a pattern that does not compile, a
reference to a locale or language the file does not define (from `master_locale`,
`locale_aliases`, `glossary`, `spelling` or `accepted_loanwords`), time formats whose minute
separators are not declared, or a promo pattern without its `{excluded_suffixes}` place. The
workflow's skill text is rendered from the same file, so the checks and the agents'
instructions cannot drift apart. Values are the builder's defaults and can be changed without
code changes. Non-ASCII values are written as `\uXXXX` escapes.

Top-level keys:
- `version`, `effective_date` (`YYYY-MM-DD`): returned with every `localization_check` result;
- `limits`: `max_file_bytes` (used by the workflow), `max_lines`, `max_targets`,
  `max_cell_chars`;
- `master_locale`;
- `locales`: per locale `language`, `script` (`latin` or `japanese`), `decimal`, `group`,
  `formality`, and where needed `date_order`, `dotted_dates`, `length_ratio_max`,
  `currencies` (locale-only, e.g. de-CH `Fr.`), `typography`;
- `locale_aliases`: near misses to suggest (`jp` -> `ja-JP`);
- `channels`: the channel table below;
- `severities`: one severity for each of the 24 check ids (exactly those keys);
- `unsure_severity`: the severity of every unsure finding (`warning`);
- `spelling`: per locale word lists and character rules (en-GB, de-CH);
- `trademark_symbols`, `void_tags`;
- `time_expressions` (per language), `time_zones`, `time_zone_exclusions` (per language:
  upper-case codes that are ordinary words there);
- reading numbers and times, per language: `percent_words`, `percent_range_connectors`,
  `time_formats`, `time_words`, `time_range_connectors`, `time_start_prefixes`,
  `time_split_separators`, `time_minute_separators`, `twelve_oclock`, `number_multipliers`,
  `number_multiplier_blockers`;
- `merge_tag_patterns`;
- `promo_code_pattern` (a template with an `{excluded_suffixes}` place),
  `promo_code_excluded_suffixes`;
- `artifact_patterns`, `artifact_phrases`;
- `currencies`: symbol, code or word to ISO 4217;
- `calendar`: month and weekday names for en, de, fr, ja, plus `ordinals`, `articles`,
  `date_forms`, `range_forms` and `weekday_after`;
- `date_range_connectors`: per language, the words or signs between the days of a range;
- `formality_markers`: formal and informal lexicons for de and fr;
- `glossary`: `do_not_translate`, `approved_translations`, `forbidden`;
- `accepted_loanwords`: per language, words that count as that language (de `sale`, `shop`);
- `language_check`: `min_letters`, `japanese_share`;
- `length_ratio_min_chars`.

Channel table (`channels`):

| Channel | Field | Limit | Unit | Soft |
|---|---|---|---|---|
| email | subject | 40 | chars | yes |
| email | preheader | 90 | chars | yes |
| email | body | none (`null`) | chars | yes |
| email | cta | none (`null`) | chars | yes |
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
