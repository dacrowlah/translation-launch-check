# Known limitations

What the Translation Launch Check tool does not do, or does imperfectly, on purpose. Each item
gives the situation, what happens, and why it is accepted. The tool is a screening aid: a
person still reviews every language, and the reviewer agent and the report point them at
what the code could not settle.

Most limitations of how copy is read are pinned by a test of today's behaviour: a regression
corpus group named `known_limitation_...` in `tool/test/fixtures/regression/`, or a unit test
of that name. Changing one is a visible decision, not a silent regression. Items not pinned
by a test say so.

"By design for this release" marks work that was left out on purpose: this release fixes
false blockers on mainstream copy, problems seen in the demo files and security problems,
and nothing else in that area.

How to read the examples: the same notation as the
[behaviour spec](BEHAVIOUR.md) ("How to read the examples"): `locale` `master` /
`translation` -> the findings of the value checks, `(none)` for nothing on that side, and
`(unsure)` for a finding that is a question. The repository is ASCII-only, so non-ASCII
characters are written as `\uXXXX` escapes.

---

## 1. Size, encoding and markets (by design)

- **Large files are not supported.** A file holds at most 50 rows, 5 target languages,
  1,000 characters per cell and 64 KB (`limits` in `config/rules.json`). The workflow refuses
  a larger file ("The file is larger than 64 KB." / "Split it by rows into smaller files."),
  more rows, and a longer cell ("... is longer than 1000 characters."). It also refuses a file
  whose text would overflow an agent step's input ("The file is too large to check in one
  run."). Each language's reviewer gets the master and that language's column, with room for
  the English back-translation (counted at the master's size), and that must fit 66,000 bytes
  as escaped JSON, where every non-ASCII character counts 6 bytes; the English master itself
  must fit 28,080 (what _Save the review_'s budget leaves after the largest review the
  reviewer's schema admits). In practice that is about 21,000 master characters (about 420 a line over
  50 lines) with one Latin-script target, fewer for accented text, and about 7,000
  characters of Japanese in a ja-JP column. So a 46 KB en-US + de-DE file of long email
  bodies is refused although it is under 64 KB; the 64 KB cap binds first only with two or
  more further columns. The tool refuses a call with more than 50 lines, 5 target locales or
  a 1,000-character cell as `invalid_input`, and a request body over 256 KB as
  `invalid_request`. Why: large files are out of scope, by design for this release. One call
  checks a whole campaign package, which keeps every check and the report consistent, and a
  seasonal campaign's string table fits easily; a bigger one can be split by rows. Not
  pinned as a limitation; the bounds themselves are tested.
- **UTF-8 only.** A file that isn't UTF-8 is refused with "Save it as CSV UTF-8 and attach it
  again." How it is caught depends on how it arrives. Mark converts a chat attachment that
  isn't UTF-8 to UTF-8 before the workflow runs, by decoding it as Windows-1252, so the
  workflow never sees the original bytes:
  - a Windows-1252 file with only Western text is read correctly and checked (no refusal);
  - a file whose characters were already replaced by `?` when it was saved is refused per
    cell that is mostly question marks (at least 3, and at least half its visible
    characters): "...the file was probably saved in the wrong encoding.";
  - a Shift_JIS file arrives with garbled Japanese and is refused per garbled cell: at
    least 5 characters Windows-1252 decoding makes from multibyte text, at least 30% of its
    visible characters, and one of them a character real copy doesn't use (such as U+0192
    or a C1 control): "...text looks garbled: the file was probably saved in the wrong
    encoding." Dense French or German copy (accents, guillemets, euro signs, dashes) has no
    such character and passes. Pinned by tests at the thresholds, and verified in chat: the
    Shift_JIS demo file is refused at validation, one problem per ja-JP row, before any
    agent step.

  The webhook sender reads the file's raw bytes and refuses one that isn't UTF-8: "The file
  isn't UTF-8 text." A UTF-8 byte-order mark is fine either way. The tool reads JSON request
  bodies, and a body declared in a charset that is not a UTF encoding gets
  `invalid_request`. Why: spreadsheet and TMS exports can all write UTF-8. The workflow
  makes no guess of its own, since a wrong guess garbles exactly the characters the checks
  compare (currency signs, accents, Japanese); Mark's Windows-1252 conversion of chat
  attachments happens before our code and is outside its control. The workflow's checks are
  tested; the tool's charset refusal is not pinned by a test.

- **Six markets.** The master is en-US; the targets with rules are de-DE, de-CH, fr-FR,
  en-GB and ja-JP. Any other well-formed locale is returned as `unsupported_locale`, never
  checked, never clean. Adding a locale of a language the rules already cover (de-AT) is a
  `config/rules.json` edit. A new Latin-script language also needs its calendar, time and
  number data in the rules, and its display name in `src/domain/checks/language.ts` (without
  it, findings name the language code). A new script (Chinese, Korean) or a new spelling rule
  needs code: `script` allows only `latin` and `japanese`, and the spelling rules are per
  locale in `src/domain/checks/spelling.ts`. Why: moving the remaining market data out of
  code was cut for this release; the six markets are the campaign's.
- **Rules that point nowhere are not all caught at start-up.** The tool refuses to start
  when `config/rules.json` has the wrong shape, a pattern that does not compile, a reference
  to a locale or language it does not define (from the master, aliases, glossary, spelling or
  loanwords), undeclared minute separators, or a promo pattern without its place. Other
  entries fall back silently: a formal locale whose language has no `formality_markers` gets
  `formality: not_applicable`, and a `time_zone_exclusions` entry for an unused language is
  ignored. Why: the rules file has one editor, and the shipped rules are tested. Not pinned
  by a test.

## 2. How the value checks read copy

These follow from the reading rules in the [behaviour spec](BEHAVIOUR.md). Most are accepted
because the fix would need context the digits do not carry, or would trade them for false
or missed blockers elsewhere. The tokenizer is not changed in this release, so new tail cases
become limitations or unsure findings, not new parsing rules.

**Markup and visible text**

- **Numbers, money, dates and weekdays read the raw text.** They read the text with links,
  merge tags, promo codes and do-not-translate terms taken out, but markup left in. So a number
  in an attribute is compared, and a percent sign outside the tag that holds its number is lost.
  - `de-DE` `<img width="600"> Save 20%` / `<img width="580"> Sparen Sie 20 %` -> numbers: `600` -> `580`
  - `de-DE` `<span>20%</span> off` / `<span>20</span> % Rabatt` -> numbers: `20%` -> `20`

  Why: moving the value checks onto visible text needs a tokenizer change. The result is a
  false blocker a reviewer dismisses at a glance, never a missed change.

- **A master with an unclosed tag makes the same translation a `markup` blocker.** When copy
  split across cells leaves a tag open in the master (`<b>Save 20%`), the translation that keeps
  it gets "left unclosed" (`</b>` -> (none)). Why: the tool checks the translation's balance
  without asking whether the master shares the imbalance; split HTML in a string table is rare.
  Not pinned by a test.

**Numbers and percent**

- **Number words and idioms are not read.** `1st order` / `Erste Bestellung` -> numbers: `1` ->
  (none). `24/7 support` / `Support rund um die Uhr` -> numbers: `24` and `7` missing. French
  `24h/24 7j/7` keeps its extra numbers. A per-language number-word list was rejected as a
  heuristic.
- **`N\u5272` reads as the digit.** `ja-JP` `Save 20%` / `2\u5272\u5f15\u304d` -> numbers: `20%` -> `2`.
- **A spaced dash carries no percent sign.** `de-DE` `Save 20-50%` / `Sparen Sie 20 \u2013 50 %` ->
  numbers: `20%` -> `20`. A spaced dash is also how lists are written.
- **A count before `\u00e0` or `bis` and a discount takes the sign.** `fr-FR` `2 at 50% off` /
  `2 \u00e0 50 %` -> numbers: `2` -> `2%`. It has the shape of a percent range.
- **A two-digit decimal rating reads as a slash form.** `fr-FR` `Rated 10.5/20` /
  `Not\u00e9 10,5 sur 20` -> numbers: `10` -> `10.5`, `5` -> (none). Not pinned by a test.
- **A clothing size written with digits is a number.** `de-DE` `Sizes up to 3XL` /
  `Gr\u00f6\u00dfen bis XXXL` -> numbers: `3` -> (none). `3XL` is no promo code, but its digit is still
  read.
- **A price before "to" and a count reads as a price range.** `de-DE`
  `Give $5 to 10 friends` / `Schenken Sie 10 Freunden je 5 $` -> numbers: (none) -> `10`;
  currency_amount: `10.00 USD` -> (none). The master's `$5 to 10` has the shape of a price
  range, so 10 becomes a price. Not pinned by a test.

**Dates**

- **`Top 10 May deals` reads as May 10.** `May` is both a month and a word; a homograph rule
  would break en-GB `Ends 10 May`.
- **An unchanged US slash date in en-GB reads as matching numbers** (`12/1` on both sides): no
  finding, but not as a date. Only context could tell it from `3/4 sleeves`. A slash date
  changed against a slash date (`11/29` / en-GB `30/11`) reads as changed numbers, still a
  blocker.
- **A cross-month Japanese range with weekdays is not read.** `ja-JP`
  `Fri, Nov 27 - Thu, Dec 3` / `11\u670827\u65e5(\u91d1)\uff5e3\u65e5(\u6728)` -> numbers: (none) -> `3`; dates:
  `12/3 Thu` -> `Thu`.
- **A list of three or more days reads only its ends as dates.** The days between are
  numbers, so a correct translation gets `numbers` and `dates` findings.
  - `de-DE` `Dec 5, 12 and 19` / `5., 12. und 19. Dezember` -> numbers: `12` -> `5`, `19` ->
    (none); dates: `12/5` -> `12/12`, (none) -> `12/19`
  - `ja-JP` `Dec 4, 5 and 6` / `12\u67084\u65e5\u30fb5\u65e5\u30fb6\u65e5` -> numbers: `5` -> (none); dates: (none) -> `12/5`
- **A larger number after "and" reads as a second day.** When a date's day is followed by
  and / & / or and a larger number up to 31 that is not a day, the number reads as the second
  day of a list. `de-DE` `Order by Dec 1 and 3 free gifts are yours` /
  `Bestellen Sie bis 1. Dezember und 3 Gratisgeschenke geh\u00f6ren Ihnen` -> numbers: (none) ->
  `3`; dates: `12/3` -> (none).
- **A free-standing weekday in brackets beside a range is a `dates` row** when the master
  names weekdays. `de-DE` `Nov 27 - Sunday, Nov 29` /
  `27. November (Freitag) bis Sonntag, 29. November` -> dates: (none) -> `Fri`. Not pinned by
  a test.
- **An unread date is a certain blocker, not a question.** `de-DE` `Ends Nov 29` /
  `Endet am neunundzwanzigsten November` -> dates: `11/29` -> (none). The unsure tier covers
  prices only; the tool has no signal that a date was written in a form it cannot read. Not
  pinned by a test.

**Times**

- **A ratio written with a colon is a time.** `fr-FR` `16:10 display` / `\u00e9cran 16/10` ->
  numbers: `16:10` -> `16`, (none) -> `10`.
- **A bare range without a half stays numbers.** `de-DE` `Open 9-5` / `Ge\u00f6ffnet 9-17 Uhr` ->
  numbers: `5` -> `17`.
- **Candidates of different values stay numbers.** `de-DE` `Ends at midnight` /
  `Endet um 23 Uhr` -> numbers: (none) -> `23`. Still a blocker, but it does not say
  "00:00 -> 23:00".
- **Leftover candidates are promoted in text order.** `fr-FR`
  `Ends 9 PM, delivery within a day` / `Livraison en 24 h, fin \u00e0 22 h` -> numbers: `21:00` ->
  `00:00`, (none) -> `22`. The finding is right; its pairing is not.
- **An evening range to `12am` reads as morning.** `de-DE` `Happy hour 5-12am` /
  `Happy Hour 17-24 Uhr` -> numbers: `05:00` -> `17:00`, `12:00` -> `00:00`. The cost of reading
  `11-12am` the everyday way.

**Money**

- **Currency words other than yen are not currencies.** `fr-FR` `Win $10,000` /
  `Gagnez 10 000 dollars` -> numbers: (none) -> `10000`; currency_code: `USD` -> (none)
  (unsure). The same holds for `Euro`.
- **de-CH `Fr.` before a dotted date is francs.** `de-CH` `Black Friday, Fri Nov 27` /
  `Black Friday, Fr. 27.11.` -> currency_code: (none) -> `CHF`; dates: `11/27 Fri` -> (none).
  `Fr., 27.11.` (with a comma) reads as the date.
- **A whole-franc price before a word range reads as Friday.** `de-CH` `Only CHF 9 until 8 PM` /
  `Nur Fr. 9 bis 20 Uhr` -> numbers: (none) -> `9`; currency_code: `CHF` -> (none) (unsure). The
  9 is still compared. `Fr. 9.50` and `Fr. 9.\u2013` stay money.
- **de-CH `Fr.` before split hours is francs.** `de-CH` `Fri 9am-12pm, 2-6pm` /
  `Fr. 9\u201312, 14\u201318 Uhr` -> numbers: `09:00` -> (none), `12:00` -> (none); currency_code: (none)
  -> `CHF`. A price range before hours (`Fr. 10.50\u201312.50, 14\u201318 Uhr`) has the same shape.
- **Amounts in kanji numerals are not read.** `ja-JP` `\u00a520,000 gift card` /
  `\u4e8c\u4e07\u5186\u5206\u306e\u30ae\u30d5\u30c8\u30ab\u30fc\u30c9` -> currency_code: `JPY` -> (none) (unsure). The same holds for
  `\u8cde\u91d1\u5341\u4e07\u5186`, `\u4e94\u5343\u5186\u5f15\u304d` and the formal `\u91d1\u5f10\u4e07\u5186`. The result is a question for a person,
  never an invented price; a kanji-numeral parser is out of scope.

**Links**

- **A changed fragment is no finding.** `ja-JP` `https://example.com/s#\u30bb\u30fc\u30eb` /
  `https://example.com/s#\u798f\u888b` -> no finding. The contract compares host, path and query.
- **Copy glued to a query value joins it.** `ja-JP` `https://example.com/?utm_source=email` /
  `https://example.com/?utm_source=email\u8a73\u7d30\u306f\u3053\u3061\u3089` -> url_params: `utm_source=email` ->
  `utm_source=email\u8a73\u7d30`. The cost of reading Japanese query values (a false blocker, accepted
  over a missed one).
- **Kanji glued after a path join the path.** `ja-JP` `https://example.com/sale` /
  `https://example.com/sale\u5927\u962a\u5e97` -> url_path: `/sale` -> `/sale%E5%A4%A7%E9%98%AA%E5%BA%97`
  (info).
- **A full-width `\uff1f` ends a running-text link.** `ja-JP` `Go https://example.com/sale?utm=1` /
  `https://example.com/sale\uff1futm=2` -> numbers: (none) -> `2`; url_params: `utm=1` -> (none).
- **A bare domain without a path or subdomain is no link.** `Visit colors.example` is not
  compared as a link and is not protected copy, so en-GB `Visit colors.example today` gets the
  spelling fix `Visit colours.example today`. Not pinned by a test.

**Merge tags, promo codes and placeholders**

- **A changed Liquid filter is no finding.** Merge tags compare by name, so
  `{{ price | money }}` / `{{ price }}` -> no finding. The language review reads tag defaults
  as copy. Only a changed default is pinned by a test, not a changed filter.
- **Codes without digits are not promo codes.** `de-DE` `Use code WELCOME` /
  `Code WILLKOMMEN` -> no finding. An upper-case word without digits is too often copy
  (`SALE`, `NEW`) to compare; the language review sees the line.
- **Bracketed placeholders are recognized from a list.** `[NAME]`, `[FIRST NAME]`,
  `[FIRSTNAME]`, `[FIRST_NAME]`, `[LAST NAME]`, `[LAST_NAME]`, `[EMAIL]` and `[COMPANY]`
  (`artifact_phrases`, any case) are template leftovers; other bracketed words, such as a
  `[SALE]` subject prefix, are copy.
- **`copy_fit_check` folds full-width merge tags only where each character keeps its
  length.** A tag typed with full-width ASCII forms (what a Japanese input method types) is
  listed as broken; other compatibility characters inside a tag are not folded. Not pinned
  by a test.

## 3. Wording checks

- **Alt text and other attributes are not read** by the wording checks (language, formality,
  spelling, glossary, trademarks). `en-GB` `<img alt="Our favorite colors">` gets no spelling
  finding. Why: attributes are not visible copy, and alt text is short and seen in the email
  preview. Not pinned by a test.
- **French all-caps `CET` ("this") counts as the CET time zone.** `fr-FR`
  `OFFRE VALABLE CET HIVER JUSQU'\u00c0 18 H` gives no `time_zone` finding. CET is also France's
  real zone, so excluding it would miss real deadlines; `ET` ("and") is excluded for French
  (`time_zone_exclusions`). Not pinned by a test.
- **A Japanese line in Latin letters only is a `language_line` warning.** `SALE`,
  `SHOP NOW` and `Black Friday SALE` in a ja-JP column each get a warning (do-not-translate
  terms do not count as Japanese). A ja-JP column with no Japanese at all is a `language_column`
  blocker; one that is mostly Latin letters but has some Japanese gets an unsure question. Why:
  the script rule is certain and costs nothing to check; Latin retail words beside Japanese
  in the same line never trigger it.
- **A short column read as another language gets a question, not a verdict.** A Latin-script
  column with fewer than 20 letters after stripping (`min_letters`) that the detector reads
  as another language, or any column the detector cannot place, gets an unsure
  `language_column` warning ("The de-DE column is short and reads as French. Is it German?")
  instead of a blocker. A short column read as its own language passes (`fr-FR`
  `Bons plans shopping`). The master column is checked the same way, so a master of one short
  CTA the detector cannot place gets the question too. A Latin-script line under 20 letters gets no
  `language_line` result, unless it holds Japanese characters.
- **A column made only of accepted loanwords is not checked for language.** `de-DE` `Sale` /
  `Sale` -> `language_column: not_applicable`. The loanwords (`accepted_loanwords`) are
  stripped before detection.
- **Time zones are matched by simple patterns.** The time-zone check was kept to two fixes
  (French `apr\u00e8s-midi` is no time, and `ET` is no zone in French); the rest was left out,
  by design for this release. What that leaves, each a warning at most and none pinned by a
  test:
  - a time written with full-width digits is not seen as a time, so a deadline without a zone
    gets no warning: `ja-JP` `\uff08\u65e5\uff09\uff19\u6642\u958b\u59cb\u3002`;
  - `aujourd'hui seulement` matches only with a straight apostrophe, so
    `Aujourd\u2019hui seulement` (curly) is not seen as a deadline;
  - a duration reads as a time: `ja-JP` `24\u6642\u9593\u9650\u5b9a` gets a warning with found
    `24\u6642` (the value checks do know `24\u6642\u9593` is a duration);
  - zone phrases outside the list are not zones: `midnight UK time` and
    `\u00e0 21 h, heure de New York` get a warning;
  - the French cue word stays in `found` (`\u00e0 21 h`, not `21 h`).
- **Formality is a word list.** `formality` looks for the pronouns and verb forms in
  `formality_markers`; the fuller lexicon work was left out, by design for this release, and
  the Translation Review agent judges register. What that leaves, none pinned by a test:
  - a noun that spells like an informal verb is flagged:
    `Die Schau beginnt jetzt. Besuchen Sie uns.` -> formality `formal` -> `Schau`;
  - the plural informal `Ihr bekommt 20 % Rabatt.` is not flagged (`Ihr` is also the formal
    "your");
  - French elided `t'` is not a marker: `Un cadeau pour t\u2019offrir du style.` is not
    flagged (`toi` is).
- **Forbidden terms match their listed form only.** `garantiert` is caught; an inflected form
  (`garantierte`) is not. The Translation Review agent reports inflected forbidden claims.
- **Typography is basic.** fr-FR spacing before `; : ! ?` and inside guillemets only. The
  suggested space is always the narrow no-break space (U+202F), though French also uses the
  no-break space (U+00A0) before `:` and inside guillemets, and a clock time is masked before
  checking, which hides `9:30!`. Severity info. Not pinned by a test.

## 4. The tool interface

- **`copy_fit_check` has no confidence field.** Its results carry a severity only. Its warning
  for a channel/field pair that is not in the channel table means, in effect, "can't tell".
- **An unauthenticated malformed body gets `invalid_request`, not 401.** The body is parsed
  before the SDK checks the bearer token, so malformed JSON or a body over 256 KB is refused
  with `invalid_request` whatever the token. Either reply carries no data, and a second token
  check before parsing would duplicate the SDK's auth. Pinned by a test.

## 5. The workflow (Mark side)

- **Only chat attachments and webhook packages are read; email can't carry the file yet.**
  An email run gets "Email can't carry the file yet." / "Attach the file in Mark chat
  instead." Why: the email source was deferred for this release.
- **Only webhook runs send the report email, and only to the configured QA inbox.** A chat run
  emails nobody: the chat payload carries no verified identity to send to. The recipient is
  checked against the allow-list in code twice, before and inside `send_email`.
- **Webhook failures are silent.** A webhook run that ends in "Ask for a corrected file", an
  unreadable report, the report step's fallback, or a report whose email failed answers only
  in the run's chat reply and run log, which no one reads on a webhook run: the QA inbox gets
  no email and the sender gets nothing back (webhook calls are asynchronous). A failed send
  adds "The report email to the QA inbox couldn't be sent." to that unread reply. Why: the
  report email is sent only by the report step on a successful run; emailing the QA inbox on
  every webhook failure is a possible next step. Not pinned by a test.
- **A model-filled webhook gate.** A payload counts only on a run whose `trigger_name`
  equals the configured `webhook_trigger_name` (without it, no run counts as a webhook), and
  its checksum must verify. Both inputs are filled by the orchestrator model, so a chat user
  who gets the model to fill both, with the exact name and a correctly checksummed package,
  still gets a "webhook" run. The worst case is one extra report to the fixed, allow-listed
  QA inbox, as plain text (see "The email is sent as plain text" below). Why: model-filled
  inputs can't authenticate; the webhook's auth key is the real sender gate. Not pinned by a
  test.
- **The reused Content Translation agent can browse the web.** The prebuilt agent that
  writes the back-translation has the platform tool `browse_web`, and it reads the copy,
  which is untrusted. Copy written to steer it could make it open a web page, and the
  request could carry text from the lines it was given. What reaches it is one locale's
  lines per call; its answer is stored as text for the report only; verdicts, routing and
  the email recipient stay in code. Our own agents have no side-effecting tools
  (Translation Review: none; Translation Fix Suggestions: `copy_fit_check` only). Why: the
  prebuilt agent is reused as it is installed; a copy of it without `browse_web` is a
  possible next step. Not pinned by a test.
- **Instructions planted in copy can hide model-judged findings.** The agents read the copy,
  and their prompts tell them to ignore any instruction inside it, but a model can still be
  steered: planted text could drop or soften the findings only a model makes (claims,
  meaning, tone), or skew the back-translation. A dropped model finding can leave a language
  with a better verdict than it deserves. Rule findings, the verdict rules and routing are
  code and are unaffected: planted text can't remove a rule finding or call a language ready
  over one. Why: judging meaning needs a model to read the copy; the report is a screening
  aid, and a person still reviews every language. Not pinned by a test.
- **A fallback after a sent email.** The report step saves the canvas, builds the message,
  sends the email and only then builds its answer. If that answer were over `run_safely`'s
  250,000-byte cap, or building it raised, the step would return its fallback ("re-run") while
  the QA inbox already had the report. The answer is bounded well below the cap and is built
  from plain values, so this is theoretical; and since email goes only on webhook runs, the
  "re-run" would land in the unread run log. Not pinned by a test.
- **The email is sent as plain text; chat and canvas escape for Markdown.** Untrusted text
  (copy, campaign name, the tool's and the agents' text) is backslash-escaped for Markdown
  in the chat reply and the canvas. The QA-inbox email is built from the same templates as
  plain text: markup in copy is kept literally (a `[link](url)` or `**bold**` reads as
  typed), control and bidi characters are dropped and route tokens defused (also when an
  invisible character hides inside the prefix), and links are written as "Label: url".
  Verified in the instance: the platform sends the body as `text/plain; charset=UTF-8`, so
  neither Markdown nor an HTML tag in copy renders, and line breaks are kept; the mail
  client links bare URLs. In chat and the canvas, a link in copy can be cut short: escaping
  a `_` or `&` inside a URL ends a renderer's autolink there (the visible text is intact).
  Pinned by a test (the exact plain body, and hostile copy arriving as inert text).
- **Format characters are removed from displayed copy.** Chat, canvas and email drop control
  and format characters, to stop bidi overrides and invisible text. That also drops the
  zero-width joiner, so an emoji sequence (woman, ZWJ, laptop) shows as two emoji, and the
  soft hyphen German headlines sometimes carry. It changes only what the report shows,
  including the suggested fixes a marketer may copy; the checks read the copy as sent. Not
  pinned as a limitation.
- **An unmatched reviewer note doesn't count.** When a Translation Review finding names a line
  id that matches no line (even after `[L1]` and `L1, L2` are normalised), it is dropped and
  only noted ("1 reviewer note couldn't be matched to a line" in the chat reply, a count in the
  canvas). Its severity, even a blocker, does not affect the verdict. Why: the rest of the
  review is kept instead of dropping the whole language; a structurally broken finding still
  makes the language `check_incomplete`. Pinned by a test.
- **The neutral "we couldn't check" reply depends on verbatim relay.** "Ask for a corrected
  file" recognises a failure on our side (the tool or the platform) by the exact template text
  of the problems it receives, which the orchestrator model passes on. If the model changes
  that text (drops the final full stop), the marketer gets the ordinary corrected-file request
  with the template link, worded as if the file were at fault. Not pinned by a test.
- **The fix re-check fails open on an unknown severity.** A suggested fix is "passes the rule
  checks" unless its re-checked line has a `blocker` or `warning` finding, so a finding with
  any other severity would read as passing. The shipped tool returns only `blocker`,
  `warning` and `info`, so this is unreachable today, and fixes never change verdicts. Not
  pinned by a test.
- **A fix that reads as a note.** A suggested fix that explains itself instead of being copy
  ("TrailPro (statt Trail-Pro-Jacke)") can pass the rule re-check, because the term or
  wording it looks for is present. Two shapes get the status "reads as a note, not copy -
  needs a person" and are never applied to the corrected file: an untranslated line whose
  fix still quotes the old line, and a line whose only problems are do-not-translate terms
  whose fix grew by more than each term's length plus one. Notes it misses: a note on a
  mixed line (a do-not-translate term together with a trademark symbol, merge tag or
  formality problem), and, on a line where a do-not-translate term replaces a translation, a
  short note that fits the allowance (about the term's length) gets through. Correct fixes
  it flags, failing safe ("needs a person"): a do-not-translate fix that needs an extra word
  or particle, such as a Japanese line that dropped the name and needs it back with its
  particle (the name followed by "nara"). Each miss needs a reviewer's own file; none is in
  a demo file. Why: the two shapes are what the fixer was seen to produce; a wider rule
  would refuse correct fixes. Pinned by a test (test_fix_notes.py).
- **Formula-like fixes.** A suggested fix that starts with `=`, `+`, `-`, `@`, a tab or a
  carriage return, also after leading whitespace or invisible characters (` =1+1`, a
  zero-width space before `=`), gets the status "starts like a spreadsheet formula - needs a
  person" and is not applied to the corrected file, unless the original cell starts with the
  same character. What that leaves:
  - a fix that keeps the cell's own leading `-` or `+` passes even if the rest is
    formula-like: the source cell already started that way;
  - false positives on the safe side: a fix that adds a leading "-30 %", "+49" or "@", or
    drops the space before a cell's own "-" (` -20 %` -> `-30 %`), goes to a person;
  - cells from the submitted file are written back unchanged, even ones starting with `=`,
    because they are the user's own.

  Why: the corrected file is opened in a spreadsheet, and a model-written fix must not
  become a live formula (`=HYPERLINK(...)`); German copy can legitimately start with
  "-30 %". Pinned by a test (test_formula_fixes.py), except the last point.
- **Very short copy of question marks trips the wrong-encoding advice.** A cell with at least
  3 `?` making up at least half its visible characters, such as a `Why???` teaser, gets "...is
  mostly question marks: the file was probably saved in the wrong encoding." Why: that is the
  shape a file takes when an editor replaced every non-ASCII character with `?`; such teasers
  are rare in campaign copy. Not pinned by a test.
- **A real "or" before the translation-leak marker goes with it.** Content Translation appends
  "or [[file]] (at least one needed)" to its last line; _Save the review_ strips that marker
  and the one "or" before it. A back-translation that really ends in "or" right before the
  marker loses that word too. Why: the two can't be told apart, and the back-translation is
  only a reading aid for the reviewer. Pinned by a test.
- **Unsure findings on the master's language are ignored.** A certain finding that the en-US
  master isn't English makes the file a problem to fix; an unsure one (a short master the
  detector can't place) is neither a problem nor reported. Why: the master is the marketer's
  own English. Pinned by a test.
- **The CSV checks are basic beyond the essentials.** A cell holding only a blank lookalike
  (a Hangul filler, the Braille blank) counts as filled, control characters other than NUL are
  allowed in cells, and an id need not start with a letter. Why: by design for this release;
  the essential checks (UTF-8, delimiter, header, known locales, unique ids, known
  channels, non-empty cells, size caps, the reserved route prefix) all run. Not pinned by a
  test.
- **Lines past the fixer's caps get no suggestion.** The fixer gets the lines to fix in file
  order until one of three caps is reached: 60 lines (its output schema admits 60 fixes), a
  50,000-byte input, or about 24,800 bytes of expected answers (what the report step's code
  leaves for them). Lines beyond get no suggested fix, and the chat reply says "N more lines
  need a fix but got no suggestion (too many for one run)." Why: one agent call per run keeps
  the run's time and cost bounded, and its answer must fit the report step's input. With 50
  rows and several languages, the 60-line cap can bind. Pinned by a test.
- **Findings past 20 per language get no second opinion.** Translation Review answers at most
  20 rule findings per language (its schema's `rule_checks` bound). When more need a second
  opinion (unsure findings and blockers on numbers, prices and dates), unsure findings go
  first and the rest are sent in line order up to 20; the others keep their verdict effect
  but get no opinion, and the chat reply says "N more findings weren't sent for a second
  opinion (too many for one run)." Why: the review's answer must fit _Save the review_'s
  input. Pinned by a test.
- **A webhook package is at most about 26.8 KB.** The package must fit _Read and check the
  file_'s input next to its code: 26,800 bytes as escaped JSON, where every non-ASCII
  character counts 6 bytes. `scripts/send_package.py` refuses a larger package before
  sending. A CMP that posts directly and goes over it gets no answer: the platform fails the
  step before any code runs, and the webhook caller is not told. Why: the step's code shares
  the platform's 75,776-byte event cap with its input. A larger campaign goes through chat
  as a file. Not pinned as a limitation (the sender's refusal is tested).
- **A back-translation that isn't text leaves its language unchecked.** _Save the review_
  expects Content Translation's answer as text; any other shape is stored as null, and that
  language becomes `check_incomplete` ("re-run"). Seen live as text, or as the agent's
  execution record whose response is text; both are read. Pinned by a test (an object is
  stored as null).
