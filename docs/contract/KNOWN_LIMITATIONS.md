# Known limitations

What the Translation Launch Check tool does not do, or does imperfectly, on purpose. Each item
gives the situation, what happens, and why it is accepted. The tool is a screening aid: a
person still reviews every language, and the reviewer agent and the report point them at
what the code could not settle.

Most limitations of how copy is read are pinned by a test of today's behaviour: a regression
corpus group named `known_limitation_...` in `tool/test/fixtures/regression/`, or a unit test
of that name. Changing one is a visible decision, not a silent regression. Items not pinned
by a test say so.

How to read the examples: the same notation as the
[behaviour spec](BEHAVIOUR.md) ("How to read the examples"): `locale` `master` /
`translation` -> the findings of the value checks, `(none)` for nothing on that side, and
`(unsure)` for a finding that is a question. The repository is ASCII-only, so non-ASCII
characters are written as `\uXXXX` escapes.

---

## 1. Size, encoding and markets (by design)

- **Large files are not supported.** A file holds at most 50 rows, 5 target languages and
  64 KB (`limits` in `config/rules.json`), and the workflow refuses a larger file. The tool
  refuses a call with more than 50 lines or 5 target locales as `invalid_input`, and a request
  body over 256 KB as `invalid_request`. Why: large files are out of scope for this release
  (owner decision). One call checks a whole campaign package, which keeps every check and the
  report consistent, and a seasonal campaign's string table fits easily; a bigger one can be
  split by rows. Not pinned as a limitation; the bounds themselves are tested.
- **UTF-8 only.** The workflow treats an attached file that is not UTF-8 (Windows-1252, for
  example) as unreadable and asks for it to be saved as CSV UTF-8; a UTF-8 byte-order mark is
  fine. The tool reads JSON request bodies, and a body declared in a charset that is not a UTF
  encoding gets `invalid_request`. Why: spreadsheet and TMS exports can all write UTF-8, and
  guessing a legacy encoding would garble exactly the characters the checks compare (currency
  signs, accents, Japanese). Not pinned by a test.
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
  (French `apr\u00e8s-midi` is no time, and `ET` is no zone in French); the rest was cut under
  the demo's scope rule (only false blockers on mainstream copy, demo files and security get
  fixed). What that leaves, each a warning at most and none pinned by a test:
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
  `formality_markers`; the fuller lexicon work was cut under the same scope rule, and the
  Translation Review agent judges register. What that leaves, none pinned by a test:
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
