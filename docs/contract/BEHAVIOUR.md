# Behaviour spec: how the Translation Launch Check reads copy

How `localization_check` reads a line of copy into tokens and text spans, and how those
tokens compare between the en-US master and a translation (de-DE, de-CH, fr-FR, en-GB,
ja-JP). It is the acceptance definition for the value checks: `numbers`, `currency_amount`,
`currency_code`, `dates`, `weekday_date_match`, `merge_tags`, `url_params`, `url_path` and
`promo_codes`. Check ids, severities and the response shape are in the
[tool contract](TOOL_CONTRACT.md); locale data is in `config/rules.json`; accepted gaps are
in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

How to read the examples:

- `de-DE` `master` / `translation` -> the expected result.
- A finding is written `check: expected -> found`, with the values as the report shows them.
  `(none)` means null: nothing on that side.
- `(unsure)` after a finding means its `confidence` is `"unsure"`: the tool could not tell,
  and the finding is a question for a person (contract section 3).
- "No finding" means none of the value checks above reports anything.
- Every example was run against the tool, with the run date 2026-11-12. Hosts are written as
  `example.com` throughout; the result does not depend on the host.
- This repository is ASCII-only, so every non-ASCII character is written as a `\uXXXX`
  escape, also inside the examples. The tool reads the characters themselves: `\u00e0` in an
  example is the letter a with a grave accent.

---

## 1. Principles

1. **Resolve ambiguous forms against the other side of the pair.** A form that reads two
   ways, such as `11/29`, `21 h`, `0800 123 456`, `midnight` or `\u5348\u524d12\u6642`, takes the reading
   that the other side of the line supports. Each pair is resolved once, deterministically.
2. **Missed blockers are worse than false ones.** When two readings are both plausible and
   nothing on the other side decides, the tool takes the reading that reports. A false
   blocker costs a reviewer a look; a missed one ships a wrong price, date or link.
3. **Never invent a value.** A form the tool cannot read with certainty stays unread rather
   than guessed. An unread amount shows up as a missing value (an unsure `currency_code`
   question when the master's price has nothing in its place), never as a made-up price.
4. **Structure is read from the raw text; numbers and words from the normalized text.**
   Links, merge tags and promo codes are taken from the text exactly as sent. Then character
   references are decoded and the rest is NFKC-normalized for dates, times, money, numbers and
   weekdays. NFKC never repairs a broken token: a full-width `\uff5b\uff5bfirst_name\uff5d\uff5d` is not a merge
   tag, so it shows up as a missing one.
5. **Wording checks read visible copy.** HTML tags with their attributes, character
   references (decoded), links, email addresses, merge tags, promo codes and do-not-translate
   terms are protected spans. They are never rewritten by a fix, and the wording checks do not
   read them as language. The value checks still read the raw text with only some of these
   spans taken out (section 2).
6. **Locale knowledge lives in the rules file.** Month and weekday names, clock formats, time
   words, range connectors, currencies, number separators and multipliers are data in
   `config/rules.json`. Code holds only language-free forms. The tool refuses to start when a
   rules edit produces a pattern that does not compile, and it names the locale.
7. **Findings are statuses, never raised errors.** No copy can make the domain throw. An
   impossible date (`Feb 30`, `13/29`) is simply no date; an unreadable form stays text.
8. **Order does not matter; values do.** Tokens are compared as multisets per kind, so
   reordered prices, dates or links are no finding. A finding quotes normalized values:
   numbers `10000`, `9.3`, `30%`; times `21:00`; money `50.00 EUR`; dates `11/29` or
   `11/29 Sun`; link parameters `key=value`.
9. **Each stage takes what it reads.** Stages run in a fixed order (links, merge tags, promo
   codes, references, NFKC, do-not-translate terms, dates, times, money, numbers, weekdays),
   and each removes what it took. So the digits of a date or a price are never also read as
   plain numbers, and the `Friday` in `Black Friday` is never a weekday.
10. **Linear time.** Every reader is linear in the length of the text. A separate
    performance gate enforces it: four times the input may take at most eight times the CPU
    (time(4n) / time(n) under 8), and a full package of hostile cells at the contract bound
    (50 lines, 6 texts, 1000-character cells) must check in under 8 s of CPU; it takes about
    0.6 s. The gate runs with a fake language detector, so the real detector's time is not
    in those numbers.
11. **Known limitations are mostly pinned.** Most accepted limitations of the value checks
    (see section 12) are a test of today's behaviour, so changing one is a visible decision,
    not a silent regression. [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) marks the ones no
    test pins.

---

## 2. Normalization, protected spans and visible text

**References.** Character references are decoded before NFKC: named ones from the HTML
table (`&nbsp;`, `&ndash;`), and numeric ones, zero-padded included (`&#038;`, `&#x26;`,
`&#8239;`). NUL, surrogates and noncharacters decode to nothing; an unknown name stays as
written.

- `fr-FR` `Over 10,000 happy customers` / `Plus de 10&#8239;000 clients satisfaits` -> no finding
- `de-DE` `Save 20% on everything&nbsp;&ndash; ends Sunday, Nov 29!` /
  `Sparen Sie 20&nbsp;% auf alles&nbsp;&ndash; endet am Sonntag, 29. November!` -> no finding

**NFKC keeps the typographic spaces.** NFKC is applied to everything except U+00A0 (no-break
space) and U+202F (narrow no-break space), which the number and typography rules need.
Full-width digits and signs read as their ASCII forms.

- `ja-JP` `Save 20%` / `\uff12\uff10\uff05\u30aa\u30d5` -> no finding
- `ja-JP` `Save 20%` / `\uff12\uff15\uff05\u30aa\u30d5` -> numbers: `20%` -> `25%`

**Full-width structure is broken structure.** A link, merge tag or promo code written with
full-width characters is not that token. It is reported as missing by its own check, and its
digits are not read as a stray number.

- `ja-JP` `Code BF26` / `\u30b3\u30fc\u30c9\uff22\uff26\uff12\uff16` -> promo_codes: `BF26` -> (none)
- `de-DE` `Hi {{first_name}}` / `Hallo \uff5b\uff5bfirst_name\uff5d\uff5d` -> merge_tags: `{{first_name}}` -> (none)
- `ja-JP` `Visit https://example.com/bf?utm_source=email` /
  `https\uff1a//example.com/bf?utm_source=email` -> url_params:
  `https://example.com/bf?utm_source=email` -> (none)

**Protected spans.** Visible text is the copy with these spans removed: HTML tags with their
attributes, links (with a scheme or starting `www.`), bare domains with a path or a
subdomain, email addresses (Latin letters with accents included, so `stra\u00dfe@example.com` is whole),
merge tags, promo codes and do-not-translate terms (case-sensitive). Each removed span becomes
one space. Runs of ASCII whitespace collapse; U+00A0 and U+202F are kept. A fix rewrites only
the gaps between spans, byte for byte around them, and a fixed word must not touch a letter,
digit or `_` on either side (`COLOR20` stays; `colors.` at a sentence end changes). A
spelling fix never touches a protected span: markup, links, bare domains, emails, merge tags,
promo codes and do-not-translate terms stay as written, byte for byte. A bare domain without a
path or a subdomain is not a protected span (section 12).

- `en-GB` `See https://example.com/men's-colors in color` / (same) -> spelling_fix:
  `See https://example.com/men's-colors in colour`
- `en-GB` `Visit example.com/colors for every color` / (same) -> spelling_fix:
  `Visit example.com/colors for every colour`
- `en-GB` `<td align="center" style="color:#333">Our favorite colors</td>` / (same) ->
  spelling_fix: `<td align="center" style="color:#333">Our favourite colours</td>`

**What reads visible text.** The structural checks (`url_params`, `url_path`, `merge_tags`,
`markup`, `template_leftovers`, length) read the raw text. The wording checks read visible
text: language, formality, `glossary_forbidden`, time zone, trademark symbols and
`untranslated`. `glossary_dnt` and typography read it with promo codes and do-not-translate
terms kept, because they look for those terms or for a mark glued to one (`TrailPro!`).
Typography also drops a tag without a space, so `<b>Soldes</b>!` reads `Soldes!`.

The value checks (numbers, money, dates and weekdays) read the raw text with links, merge
tags, promo codes and do-not-translate terms taken out; markup is not taken out. So a number
inside an attribute is compared, and `<span>20</span> %` loses its sign (section 12).

---

## 3. Numbers

**Locale separators.** Each locale's decimal mark and group separators come from the rules:
en-US, en-GB, ja-JP group with `,` and use `.`; de-DE groups with `.` and uses `,`; fr-FR
groups with a no-break or narrow no-break space (or `.`) and uses `,`; de-CH groups with `'`
or `\u2019` and uses `.`. A no-break or narrow no-break space groups digits in every locale, also
mixed with plain spaces. Numbers compare by value (`9.30` is `9.3`).

- `fr-FR` `Win 1,000,000 points` / `Gagnez 1\u00a0000 000 points` -> no finding
- `de-CH` `Price CHF 1,299.50` / `Preis CHF 1'299.50` -> no finding
- `de-DE` `Over 1.5 million` / `\u00dcber 1,5 Millionen` -> no finding

**Plain-space groups are resolved per pair.** Digits split by plain spaces in groups of three
(`10 000`, `0800 123 456`) can be one number or several. Such a group is read whole as often
as the other side holds that value (as a number, a group or a price). Otherwise it is read as
its parts when a part stands opposite, and whole when nothing does. So a changed grouped
number reads whole.

- `fr-FR` `1,299 pieces in stock` / `1 299 pi\u00e8ces en stock` -> no finding
- `de-DE` `Call 0800 123 456` / `Rufen Sie 0800-123-456 an` -> no finding
- `de-DE` `Get 2 100-piece puzzles` / `2 Puzzles mit je 100 Teilen` -> no finding
- `fr-FR` `Over 10,000 customers` / `Plus de 10 500 clients` -> numbers: `10000` -> `10500`

**Percent stays with its number.** A percentage token keeps its sign without the space
(`20 %` is `20%`). Percent words read as `%`, case-insensitively and in compounds (en
`percent`/`per cent`, de `Prozent`/`prozentig\u2026`, fr `pour cent`, ja `\u30d1\u30fc\u30bb\u30f3\u30c8`). A dropped
sign is a finding. Percent ranges are in section 6.

- `de-DE` `Get a 20% voucher` / `Holen Sie sich einen 20-Prozent-Gutschein` -> no finding
- `de-DE` `SAVE 30 PERCENT` / `30 % SPAREN` -> no finding
- `de-DE` `Save 30% today` / `Sparen Sie heute 30 Rabatt` -> numbers: `30%` -> `30`

**Ratings.** A slash after a one-digit decimal is a rating of plain numbers, never a date.

- `de-DE` `Rated 4.5/5 by customers` / `Mit 4,5 von 5 bewertet` -> no finding

**Pairing of rows.** Inside `numbers`, a changed time pairs with a time and a changed number
with a number. Whatever each kind leaves over is paired by position.

- `fr-FR` `Top 21 deals end at 9 PM` / `Top 22 : fin \u00e0 21 h` -> numbers: `21` -> `22`
- `de-DE` `Ends 8 PM. 20 items` / `Endet 20 Uhr` -> numbers: `20` -> (none)

**Attributes are read like copy** by the value checks (section 12).

- `de-DE` `<img width="600"> Save 20%` / `<img width="580"> Sparen Sie 20 %` -> numbers: `600` -> `580`

---

## 4. Kanji multipliers (ja)

**A numeral followed by `\u4e07`, `\u5343`, `\u767e` or `\u5104` is one amount** (x10,000, x1,000, x100,
x100,000,000), wherever a numeral is read: counts, points, prefix and suffix prices, and both
ends of a range. Chains add up: each multiplier scales the numeral before it, and a trailing
plain numeral is added (`1\u4e072\u5343` = 12000, `1\u5343\u4e07` = 10,000,000, `1\u51042\u5343\u4e07` = 120,000,000,
`5\u53433\u767e` = 5300, `1\u4e072000` = 12000). Decimals are kept (`1.5\u5343` = 1500).

- `ja-JP` `First 10,000 customers` / `\u5148\u77401\u4e07\u540d\u69d8` -> no finding
- `ja-JP` `Only \u00a512,000` / `1\u4e072\u5343\u5186\u306e\u307f` -> no finding
- `ja-JP` `Up to 10,000 points` / `\u6700\u59272\u4e07\u30dd\u30a4\u30f3\u30c8` -> numbers: `10000` -> `20000`

**A bare chain before a suffix currency counts once.** `\u5343\u5186` is 1000 and `\u767e\u4e07\u5186` is
1,000,000. Without a currency, a lone kanji multiplier is copy, not a number.

- `ja-JP` `\u00a51,000 off` / `\u5343\u5186OFF` -> no finding
- `ja-JP` `The \u00a5100 shop` / `\u767e\u5186\u30b7\u30e7\u30c3\u30d7` -> no finding
- `ja-JP` `Our Chiba store` / `\u5343\u8449\u5e97` -> no finding

**Never after a kanji numeral or a vague count.** A bare chain is not read directly after a
kanji numeral (`\u3007`, `\u4e00` to `\u4e5d`, `\u5341`, and the formal `\u58f1` `\u5f10` `\u53c2` `\u62fe`) or a vague count (`\u6570`,
`\u4f55`, `\u5e7e`). The
list is `number_multiplier_blockers` in the rules. Such amounts stay unread (section 12). No
suffix amount starts inside a chain.

- `ja-JP` `Save tens of thousands of yen` / `\u6570\u4e07\u5186\u304a\u5f97` -> no finding
- `ja-JP` `\u00a520,000 gift card` / `\u4e8c\u4e07\u5186\u5206\u306e\u30ae\u30d5\u30c8\u30ab\u30fc\u30c9` -> currency_code: `JPY` -> (none) (unsure)

---

## 5. Money

**Currencies.** Symbols, codes and words map to ISO codes through `currencies` in the rules
(`$`, `US$`, `USD`, `\u20ac`, `EUR`, `\u00a3`, `GBP`, `\u00a5`, `\uffe5`, `\u5186`, `\u30c9\u30eb`, `JPY`, `CHF`, `yen`,
`yens`). A locale may add its own: `Fr.` is CHF only in de-CH. Currency words written in lower
case in the rules match in any case (`Yen`, `yens`). A currency is a prefix before an amount,
or a suffix only directly after a numeral (one space allowed); a comma or full stop alone never
makes it a suffix.

- `de-DE` `Only $20 100% guaranteed` / `Nur 20 $ \u2013 100 % garantiert` -> no finding
- `fr-FR` `Prices from 1,000 yen` / `Prix \u00e0 partir de 1 000 yens` -> no finding
- `ja-JP` `Free shipping over $50 until 9 PM` / `50\u30c9\u30eb 21\u6642\u307e\u3067\u9001\u6599\u7121\u6599` -> no finding

**Comparison.** Amounts keep every decimal place and show at least two (`50.00 EUR`).
Money compares per currency on both sides: a different set of currencies is one
`currency_code` warning per line ("confirm local price"); the same currency with a different
amount is `currency_amount`.

- `de-DE` `Black Friday - \u20ac50 off` / `Black Friday \u2013 40 \u20ac Rabatt` ->
  currency_amount: `50.00 EUR` -> `40.00 EUR`
- `en-GB` `Black Friday - $50 off` / `Black Friday - \u00a340 off` -> currency_code: `USD` -> `GBP`
- `fr-FR` `Price \u20ac9.99` / `Prix 9,99 \u20ac` -> no finding

**A master price with nothing in its place is a question.** When the master has a currency
and the translation has no currency in its place, the `currency_code` finding is unsure:
"Couldn't find the master's price in this line. Is it written in a form the tool can't read
(in words, or glued to a word), or is it missing?" (ja-JP: "(kanji numerals)"). A different
currency, or a currency only the translation has, stays a certain finding.

- `de-DE` `Only $20` / `Nur zwanzig Dollar` -> currency_code: `USD` -> (none) (unsure)
- `de-DE` `Save $20` / `Sparen Sie 20CHF` -> currency_code: `USD` -> `CHF`

**Latin letters next to a currency.** A currency written in Latin letters (a code or a word)
must not run into a Latin word, so `NurEUR10` and `20 USDT` are no prices. A non-Latin
currency (`\u00a5`, `\uffe5`, `\u5186`, `\u30c9\u30eb`) may touch Latin letters on either side, and prices between
kana are money.

- `ja-JP` `\u00a51,000 off` / `1,000\u5186OFF` -> no finding
- `ja-JP` `SALE \u00a5500` / `SALE\u00a5500` -> no finding
- `de-DE` `Only EUR 10` / `NurEUR10` -> numbers: (none) -> `10`; currency_code: `EUR` -> (none) (unsure)

**Prices and clock times.** A written clock time is never a price, after any currency
(`20 Uhr`, `20:00`, `21 h`, `20\u6642`). A bare number right after a prefix currency is money
and is never read as the start of a time range. A suffix currency belongs to the amount before it and
guards nothing after it.

- `de-CH` `Only CHF 9.50 until 8 PM` / `Nur CHF 9.50 bis 20 Uhr` -> no finding
- `ja-JP` `Free shipping over \u00a51,000 until 8 PM` / `1,000\u5186 21\u6642\u307e\u3067` -> numbers: `20:00` -> `21:00`
- `fr-FR` `From $50 until 2 PM` / `D\u00e8s 50 $ 14 h` -> no finding

**Dash decimals.** A dash in place of the decimals marks a whole amount: de-CH `Fr. 9.\u2013`
and `Fr. 20.\u2013`, de-DE `50,\u2013 \u20ac` and `50,- \u20ac`.

- `de-CH` `Only CHF 20 until 8 PM` / `Nur Fr. 20.\u2013 bis 20 Uhr` -> no finding
- `de-DE` `Price \u20ac50` / `Preis 50,\u2013 \u20ac` -> no finding
- `de-DE` `Price \u20ac50` / `Preis 60,\u2013 \u20ac` -> currency_amount: `50.00 EUR` -> `60.00 EUR`

**A currency written once on a range covers both ends**, on either side, prefix or suffix.

- `ja-JP` `\u00a510,000-30,000` / `1\u4e07\uff5e3\u4e07\u5186` -> no finding
- `ja-JP` `\u00a510,000-30,000` / `10,000\uff5e30,000\u5186` -> no finding
- `ja-JP` `\u00a510,000-30,000` / `1\u4e07\uff5e4\u4e07\u5186` -> currency_amount: `30000.00 JPY` -> `40000.00 JPY`

**Plain-space groups inside a price resolve per pair**, like plain numbers (section 3).

- `de-DE` `Price \u20ac2,000` / `Preis \u20ac 2 000` -> no finding
- `de-DE` `Price \u20ac2,000` / `Preis \u20ac 2 100` -> currency_amount: `2000.00 EUR` -> `2100.00 EUR`

**Weekday or francs.** In de-DE, `Fr.` is always Friday. In de-CH, `Fr.` is francs except
where it is clearly the weekday:

- after a weekday range (`Mo.\u2013Fr.`);
- before a clock time (`Fr. 20 Uhr`, `Fr. 20:00 Uhr`);
- before a dash range of hours (`Fr. 9\u201318 Uhr`);
- before a word range of whole hours or of times with minutes on both ends
  (`Fr. 9 bis 18 Uhr`, `Fr. 8.30 bis 18.30 Uhr`).

A price with decimals or a dash stays money (`Fr. 9.50 bis 20 Uhr`, `Fr. 9.\u2013 bis 20 Uhr`,
`Fr. 10.50\u201312.50`). Before a date written `Fr., 27.11.` (with a comma) it is the weekday.

- `de-CH` `Mon-Thu 9am-8pm, Fri 9am-6pm` / `Mo.\u2013Do. 9\u201320 Uhr, Fr. 9\u201318 Uhr` -> no finding
- `de-CH` `Fri 9am to 6pm` / `Fr. 9 bis 18 Uhr` -> no finding
- `de-CH` `Only CHF 29.90 until Fri 8 PM` / `Nur Fr. 29.90 bis Fr. 20 Uhr` -> no finding
- `de-CH` `Lunch menu CHF 12.50-14.50, served 11:30am-2pm` /
  `Mittagsmen\u00fc Fr. 12.50\u201314.50, 11.30\u201314 Uhr` -> no finding

**No date right after a currency** where the locale's decimal mark is `.`, so `$1.15.` is a
price, never January 15.

- `en-GB` `Only $1.15.` / (same) -> no finding

---

## 6. Percent ranges

**A sign written once after a range covers both ends**, when the connector is an unspaced
dash, a word connector from the rules (`to`, `bis`, `\u00e0`, `\uff5e`, `\u301c`, `\u304b\u3089`; `and`/`und`/`et`
only after `between`/`zwischen`/`entre`), and only when the start is not greater than the end.

- `de-DE` `Save 20% to 50%` / `Sparen Sie 20 bis 50 %` -> no finding
- `ja-JP` `20% to 50% off` / `20\uff5e50%\u30aa\u30d5` -> no finding
- `de-DE` `Between 20% and 50% off` / `Zwischen 20 und 50 % Rabatt` -> no finding

**A spaced dash is a separator for percentages**, never a range connector (section 12).

- `de-DE` `Save 20-50%` / `Sparen Sie 20 \u2013 50 %` -> numbers: `20%` -> `20`

**A plain count before a discount stays a count** when it is not a range.

- `fr-FR` `Pack of 3: 30% off` / `Lot de 3 -30 %` -> no finding
- `de-DE` `Buy 2 and save 20%` / `Kaufen Sie 2 und 20 % sparen` -> no finding

---

## 7. Dates

**Written dates.** Month names (full, and short forms with or without a full stop), ordinals
(`27th`, `1er`) and articles come from the rules' templates per language. Dotted numeric dates
(`29.11.`) are read only in locales with `dotted_dates` (de-DE, de-CH). Japanese reads
`11\u670829\u65e5` and `11/29`. A date compares as its month and day.

- `fr-FR` `Nov 1` / `le 1er novembre` -> no finding
- `de-DE` `Valid through Nov 29` / `G\u00fcltig bis zum 29. November` -> no finding
- `ja-JP` `Nov 29` / `11\u670829\u65e5` -> no finding

**Numeric dates with a year** are dates in the locale's `date_order` (en-US, ja-JP m/d/y;
en-GB, de-CH d/m/y). A year-first form `YYYY/M/D` is a date in every locale.

- `en-GB` `Ends 11/29/2026` / `Ends 29/11/2026` -> no finding
- `ja-JP` `Ends 11/29/2026.` / `2026/11/29\u307e\u3067\u3002` -> no finding
- `en-GB` `Ends 11/29/2026` / `Ends 30/11/2026` -> dates: `11/29` -> `11/30`

**Yearless slash forms are resolved per pair.** `n/n` without a year is read in its own
locale's order; it is a date when the other side holds that month and day, or holds a date
this side lacks (a changed date). Otherwise it is two numbers, so fractions and sizes (`3/4`,
`1/2`, `10/12`, `24/7`) stay numbers.

- `de-DE` `Ends 11/29.` / `Endet am 29.11.` -> no finding
- `de-DE` `3/4 sleeves until 11/29` / `3/4-\u00c4rmel bis 30.11.` -> dates: `11/29` -> `11/30`
- `de-DE` `Sizes 10/12 - ends Nov 29` / `Gr\u00f6\u00dfen 10/12 - endet am 30. November` ->
  dates: `11/29` -> `11/30`

**Date ranges are two dates of one month.** A range is `<month> DAY <connector> DAY`,
`DAY[.] <connector> <date>`, or Japanese `M\u6708D\u65e5 <connector> D\u65e5`, with connectors from
`date_range_connectors` (en `-`, `\u2013`, `to`, `through`, `thru`; de `-`, `\u2013`, `bis`, `bis zum`;
fr `au`, `-`, `\u2013`; ja `\uff5e`, `\u301c`, `-`, `\u304b\u3089`). A spaced dash still connects dates. A range
across months is two full dates. A percentage after a month and day is no range, and `\u65e5\u9593`
(days, a duration) never ends one.

- `de-DE` `Offer valid Nov 27th-30th` / `G\u00fcltig vom 27. bis 30. November` -> no finding
- `fr-FR` `Valid May 1-3` / `Valable du 1er au 4 mai` -> dates: `5/3` -> `5/4`
- `ja-JP` `For 30 days from Nov 27` / `11\u670827\u65e5\u304b\u308930\u65e5\u9593\u9650\u5b9a` -> no finding

**Two listed days read as a range's two ends.** The list words are connectors too (en `and`,
`&`, `or`; de `und`, `&`, `oder`; fr `et`, `&`, `ou`; ja `\u3068`, `\u30fb`), so two days joined by one
of them are the two dates of a range. A list of three or more days is a known limitation
(section 12).

- `de-DE` `December 5 & 6` / `5. & 6. Dezember` -> no finding
- `ja-JP` `Delivery Dec 5 or 6` / `\u914d\u9001 12\u67085\u65e5\u30fb6\u65e5` -> no finding
- `ja-JP` `Delivery Dec 5 or 7` / `\u914d\u9001 12\u67085\u65e5\u30fb6\u65e5` -> dates: `12/7` -> `12/6`
- `de-DE` `Nov 29 or 30% off` / `29. November oder 30 % Rabatt` -> no finding

**Weekdays.** Full weekday names stand alone; short forms (`Tues`, `Sa`, `Di`) count only
where they touch a date. A Japanese weekday follows the date in brackets. A weekday written
before a range belongs to its first day, after it to its last. Weekdays inside do-not-translate
terms (`Black Friday`, `Cyber Monday`) are not weekdays.

- `de-DE` `Sat-Sun, Nov 28-29` / `Sa.-So., 28.-29. November` -> no finding
- `de-DE` `Ends Tues` / `Endet Di` -> no finding
- `de-DE` `Cyber Monday - \u20ac20 off` / `Cyber Monday \u2013 20 \u20ac Rabatt` -> no finding

**The dates check.** `dates` reports when the (month, day) multisets differ, or when the
master names weekdays and the weekday multisets differ. A weekday only the translation adds is
judged by `weekday_date_match` alone: the weekday must match the date's next occurrence from
the run date.

- `de-DE` `Ends Monday` / `Endet Dienstag` -> dates: `Mon` -> `Tue`
- `de-DE` `Ends Sunday, Nov 29` / `Endet Samstag, 29. November` -> dates: `11/29 Sun` ->
  `11/29 Sat`; weekday_date_match: `11/29 Sun` -> `11/29 Sat`
- `de-DE` `Ends Nov 29` / `Endet Samstag, 29. November` -> weekday_date_match: `11/29 Sun` ->
  `11/29 Sat` (with a run date before 2026-11-29)

**An unchanged date is never reported; rows use month and day when the master names no
weekday.** A weekday the translation adds to a date the master writes without one is judged
by `weekday_date_match` alone, also when the master names weekdays elsewhere.

- `de-DE` `Nov 29` / `Montag, 30. November` -> dates: `11/29` -> `11/30`
- `ja-JP` `Nov 27-30` / `11\u670827\u65e5\uff08\u91d1\uff09\uff5e29\u65e5\uff08\u65e5\uff09` -> dates: `11/30` -> `11/29`
- `ja-JP` `Ends Sunday` / `\u65e5\u66dc\u307e\u3067` -> no finding

---

## 8. Times

Clock times are their own tokens, normalized to `HH:MM`, and compared under `numbers` (no
separate check). Equal clock times in different zones match; `time_zone` watches the zone. A
zone conversion that changes the clock is a `numbers` blocker, the safe direction for
"confirm the deadline".

**Definite times.** `h:mm` in every language; en `9 PM`, `9:30pm`, `9.30pm`, `9 p.m.`; de
`20.30 Uhr`, `20:30 Uhr`; fr `21 h 30`, `21h30`; ja `\u5348\u5f8c9\u6642`, `21\u664230\u5206`, `9\u6642\u534a`. `24:00` is
`00:00`, a time without minutes is `:00`, and an impossible hour (`25:00`, `13 PM`) stays text.

- `de-DE` `Sale ends Nov 27 - 11:59 PM PT` / `Endet am 27. Nov. - 23:59 Uhr PT` -> no finding
- `ja-JP` `Ends 9:30 PM` / `\u5348\u5f8c9\u6642\u534a\u307e\u3067` -> no finding
- `en-GB` `Only 9.30 left` / `Only 9:30 left` -> numbers: `9.3` -> `09:30`

**Candidates.** An hour without minutes or a half of the day (de `20 Uhr`, fr `21 h`, ja
`21\u6642`) and every time word (`midnight`, `noon`, `midday`, `Mitternacht`, `Mittag`, `minuit`,
`midi`, `\u6b63\u5348`; `12 noon` is one candidate) may be a time or not: `24 h` can be a duration,
`Midnight Blue` a colour. Candidates are resolved per pair:

- a candidate stays its plain number when the other side holds that number more often and
  does not write that time as a definite time (`24 h` opposite `24 hours`);
- then a candidate becomes a time when the other side holds the same time;
- then leftover candidates become times, in text order, only against the other side's
  unpaired definite times;
- whatever is left is its digits, or nothing for a word.
- `fr-FR` `Ends 9 PM` / `Fin \u00e0 21 h` -> no finding
- `fr-FR` `24-hour flash sale ends at 9 PM` / `Vente flash de 24 h : fin \u00e0 21 h` -> no finding
- `de-DE` `Midnight Blue jacket - order by noon` /
  `Jacke in Midnight Blue - bestellen bis 12 Uhr` -> no finding
- `de-DE` `Ends 9 PM. Only 21 left` / `Endet um 21 Uhr` -> numbers: `21` -> (none)

**Durations are not times.** `24\u6642\u9593` is 24 hours, not 24:00; `\u65e5\u9593` likewise never makes a
date.

- `ja-JP` `Order within 24 hours` / `24\u6642\u9593\u4ee5\u5185\u306b\u3054\u6ce8\u6587` -> no finding

**Time words as names.** A time word that touches a Latin letter or a hyphen is no time
(`apr\u00e8s-midi`, `Midi-Pyr\u00e9n\u00e9es`, `Mitternachts-Sale`). A time word in a name is resolved like
any candidate, so it never takes the slot of a real time.

- `fr-FR` `Delivery in the south of France` / `Livraison dans le Midi` -> no finding
- `de-DE` `Midnight Sale starts now` / `Mitternachts-Sale startet jetzt` -> no finding
- `ja-JP` `Midnight Blue jacket` / `\u30df\u30c3\u30c9\u30ca\u30a4\u30c8\u30d6\u30eb\u30fc\u306e\u30b8\u30e3\u30b1\u30c3\u30c8` -> no finding

**A clock time may end before `:`** (not `:digit`).

- `de-DE` `Ends 8 PM: shop now` / `Endet 20 Uhr: jetzt shoppen` -> no finding

---

## 9. Time ranges and twelve o'clock

**Halves of the day in a range.**

- A bare start takes the end's half, or the other half when that would put it after the end:
  `10-12pm` is 10:00-12:00, `12-6pm` is 12:00-18:00.
- A bare start of 1-11 ending in `12am` runs to noon: `11-12am` is 11:00-12:00 (the
  everyday reading).
- An explicit am start ending in `12am` runs to midnight: `11am-12am` is 11:00-24:00 (the
  literal reading).
- `12-6am` and a lone `12am` are 00:00.
- A half written once at the start covers the end unless the end would then come before the
  start: `\u5348\u524d11\u6642\uff5e1\u6642` is 11:00-13:00; `\u5348\u5f8c1\uff5e5\u6642` is 13:00-17:00.
- A time word may end a range after a hyphen (`10am-noon`).
- `de-DE` `Open 11-12am` / `Ge\u00f6ffnet 11-12 Uhr` -> no finding
- `de-DE` `Open 11am-12am` / `Ge\u00f6ffnet 11-24 Uhr` -> no finding
- `de-DE` `Open 11am-12am` / `Ge\u00f6ffnet 11-12 Uhr` -> numbers: `00:00` -> `12:00`
- `ja-JP` `Open 11am-1pm` / `\u5348\u524d11\u6642\uff5e1\u6642` -> no finding

**Range starts.** A range whose start is no valid time (`50`, `29.99`, a 12-hour `13`) does
not swallow the time after it: the end is read alone and the start stays a number.

- `de-DE` `Save 30 until 8 PM` / `Sparen Sie 30 bis 20 Uhr` -> no finding
- `de-CH` `Only 29.99 until 8 PM` / `Nur 29.99 bis 20 Uhr` -> no finding

**Split hours.** In split opening hours, the bare end of the first range takes the unit of
the range after it. Separators come from `time_split_separators` (`,`; ja also `\u3001`) or a
range connector (`und`).

- `de-DE` `Mon-Fri 9am-12pm, 2-6pm` / `Mo.\u2013Fr. 9\u201312, 14\u201318 Uhr` -> no finding
- `ja-JP` `Open 9am-12pm, 2-6pm` / `\u55b6\u696d9\uff5e12\u300114\uff5e18\u6642` -> no finding
- `de-DE` `Mon-Fri 9am-12pm, 2-6pm` / `Mo.\u2013Fr. 9\u201313, 14\u201318 Uhr` -> numbers: `12:00` -> `13:00`

**Japanese twelve o'clock.** `\u5348\u524d12\u6642` and `\u5348\u5f8c12\u6642` are written under two conventions
(`\u5348\u524d12\u6642` as noon or as midnight). The rules give the default (`\u5348\u524d12\u6642` noon, `\u5348\u5f8c12\u6642`
midnight) and the alternative.

- A side's twelves are read under either convention, and all twelves of one side share one
  convention.
- The convention under which more of the side's values fit the other side wins. On a tie, the
  convention whose unmatched values lie nearer the other side's open values wins. When that
  ties too, or the other side has no time, the default holds.
- In en, `12 AM` is 00:00 and `12 PM` is 12:00.
- `ja-JP` `Ends 12 PM` / `\u5348\u524d12\u6642\u307e\u3067` -> no finding
- `ja-JP` `Ends 12 AM` / `\u5348\u524d12\u6642\u307e\u3067` -> no finding
- `ja-JP` `12 PM and 12 AM` / `\u5348\u5f8c12\u6642\u3068\u5348\u5f8c12\u6642` -> numbers: `12:00` -> `00:00`
- `ja-JP` `Ends 1 PM` / `\u5348\u524d12\u6642\u307e\u3067` -> numbers: `13:00` -> `12:00`

---

## 10. Links

**Where a link ends.** One URL pattern serves every reader. A link starts at a scheme (any
case) or `www.`.

- Inside a quoted `href="..."` or `href='...'`, the link runs to the closing quote, whatever
  the characters.
- In running text, the host runs to the first `/`. The path runs through printable ASCII
  (no quotes or angle brackets), Latin letters and marks, an apostrophe inside a word,
  katakana, kanji and percent-escapes. It stops at whitespace, hiragana and CJK punctuation.
- Trailing `.,;:!?` is copy. A closing `)`, `]` or `}` is stripped only while unbalanced in the
  link.
- `&amp;`, `&#38;`, `&#038;`, `&#x26;` and `&#x0026;` are `&`; any other character reference
  ends the link.
- `ja-JP` `Visit https://example.com/\u30bb\u30fc\u30eb` / `\u8a73\u3057\u304f\u306fhttps://example.com/\u30bb\u30fc\u30eb\u3092\u3054\u89a7\u304f\u3060\u3055\u3044` -> no finding
- `de-DE` `Shop https://example.com/?a=1&b=2` / `Shop https://example.com/?a=1&#38;b=2` -> no finding
- `de-DE` `Shop https://example.com/sale` / `Shop https://example.com/sale&nbsp;heute` -> no finding
- `de-DE` `(see https://example.com/a_(b))` / `(siehe https://example.com/a_(b))` -> no finding

**Dashes.** In running text, only an ASCII hyphen continues a link. An en or em dash ends it,
except inside a path, where it continues when the dashed word (with a letter) runs on to `/`,
`?` or `#` followed by a letter, digit or `%`. A dash never continues a host. A `?` followed by
a space never continues a path.

- `de-DE` `Go https://example.com/sale\u2013deals?utm_source=email` /
  `Los https://example.com/sale\u2013deals?utm_source=mail` -> url_params: `utm_source=email` ->
  `utm_source=mail`
- `de-DE` `Visit https://example.com\u2014our new store` / `https://example.com \u2013 unser neuer Shop`
  -> no finding
- `de-DE` `Shop https://example.com/sale\u2013today? Yes` / `Shop https://example.com/sale \u2013 heute? Ja`
  -> no finding

**Japanese query values.** A query value continues through katakana and kanji, and may start
with hiragana, so a changed Japanese search term is caught. A space, or hiragana after a
katakana or kanji run, ends it.

- `ja-JP` `https://example.com/s?q=\u30bb\u30fc\u30eb` / `https://example.com/s?q=\u30d0\u30c3\u30b0` -> url_params:
  `q=\u30bb\u30fc\u30eb` -> `q=\u30d0\u30c3\u30b0`
- `ja-JP` `https://example.com/s?kw=\u304a\u305b\u3061` / `https://example.com/s?kw=\u798f\u888b` -> url_params:
  `kw=\u304a\u305b\u3061` -> `kw=\u798f\u888b`
- `ja-JP` `Search https://example.com/search?q=%E3%82%BB%E3%83%BC%E3%83%AB` /
  `https://example.com/search?q=\u30bb\u30fc\u30eb\u3092\u691c\u7d22` -> no finding

**Percent-escapes.** Query keys and values are decoded as strict UTF-8, one run of escapes at
a time, before comparing, so an encoded value equals the same value written out. `+` and
`%20` are a space. A run that is not valid UTF-8 is compared as written (hex case ignored),
never as a replacement character. A decoded `%` is escaped again, so `%2541` is not `%41`.
Paths compare in their percent-encoded form.

- `ja-JP` `https://example.com/s?kw=%E3%81%8A%E3%81%9B%E3%81%A1` / `https://example.com/s?kw=\u304a\u305b\u3061`
  -> no finding
- `de-DE` `https://example.com/?q=a+b` / `https://example.com/?q=a%20b` -> no finding
- `de-DE` `https://example.com/?utm_campaign=%FCbersicht` /
  `https://example.com/?utm_campaign=%E4bersicht` -> url_params: `utm_campaign=%FCbersicht` ->
  `utm_campaign=%E4bersicht`

**Comparison.** Links pair in passes: the same link, then the same host, path and query, then
the same host and path, then order of appearance. So reordered links are no finding.

- A missing link, a different host, or a different query (compared as a multiset of
  `key=value`, keys case-sensitive, extra parameters included) is `url_params`.
- A different path is `url_path` (info), shown percent-encoded.
- Links are never rewritten by a fix. Merge tags inside a link stay part of the link.
- `de-DE` `Visit https://example.com/a and https://example.com/b` /
  `https://example.com/b und https://example.com/a` -> no finding
- `de-DE` `Shop https://example.com/sale?utm_source=email` /
  `Shop https://example.com/sale?utm_source=email&utm_medium=de` -> url_params: (none) ->
  `utm_medium=de`
- `de-DE` `Shop https://shop.example.com/de/kitchen?utm_source=email` /
  `Shop https://shop.example.com/de/k\u00fcche?utm_source=email` -> url_path: `/de/kitchen` ->
  `/de/k%C3%BCche`

**Bare domains and emails** are protected copy, not compared links. A bare domain needs a path
or a subdomain; without a path, every label has two or more characters (`z.B.bei` is copy).

- `en-GB` `Visit example.com/colors` / (same) -> no finding

---

## 11. Merge tags and promo codes

**Merge tags.** The patterns are `{{...}}`, `*|NAME|*` (capitals only) and `%%name%%`, from
`merge_tag_patterns`, matched case-sensitively on the raw text. Links are read first, so a
tag inside a link is part of the link. Tags compare as a multiset of names: missing, renamed
or extra is a `merge_tags` blocker. A `{{...}}` tag's name drops the ASCII spaces that pad it
and any `| filter` part (`{{first name}}` and `{{firstname}}` still differ); other syntaxes compare as written, case included. `expected` and `found`
quote the tags as written. A translated Liquid default is copy for the language review, not a
broken tag, and a renamed tag is reported by `merge_tags` only, never also as a template
leftover.

- `ja-JP` `Hi {{first_name}}, shop https://example.com/?n={{first_name}}` /
  `{{first_name}}\u69d8 https://example.com/?n={{first_name}}` -> no finding
- `de-DE` `Hi {{first_name}}` / `Hallo {{vorname}}` -> merge_tags: `{{first_name}}` -> `{{vorname}}`
- `de-DE` `Hi *|FNAME|*` / `Hallo *|fname|*` -> merge_tags: `*|FNAME|*` -> (none)
- `de-DE` `{{ first_name | default: "you" }}` / `{{first_name | default: "du"}}` -> no finding

**Promo codes.** A code is two or more capitals followed by one to four digits (`BF26`), or one
to four digits followed by two or more capitals (`20OFF`), not followed by `:digit` or
`.digit` (`promo_code_pattern`). After digits, a unit, size, ordinal or clock word from
`promo_code_excluded_suffixes`, or any currency code from `currencies`, makes no code
(`512GB`, `3XL`, `1ST`, `9PM`, `50EUR`). Codes are read from the raw text and compared as a
multiset. An upper-case word without digits (`WELCOME`, `SALE NOW`) is never a code.

- `de-DE` `Code BF26` / `Code BF27` -> promo_codes: `BF26` -> `BF27`
- `de-DE` `Code BF26: 20% off` / `Code BF26 : 20 % Rabatt` -> no finding
- `de-DE` `Use code 20OFF` / `Code 20RABATT` -> promo_codes: `20OFF` -> `20RABATT`
- `de-DE` `Galaxy S24 512GB` / `Galaxy S24 512 GB` -> no finding

---

## 12. Known limitations

The accepted gaps in how the value checks read copy (number words, `Top 10 May deals`, kanji
numerals, glued link copy, attributes read as copy, and the rest) are listed, with examples,
in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), section 2. Most are pinned by a regression
row or unit test of today's behaviour; the list marks those that are not.

---

## 13. Decisions where we chose a side

- **Times live under `numbers`.** No new check id; a changed deadline is a blocker like any
  changed number, and a zone conversion that changes the clock is one too.
- **Yearless slash dates resolve by pairing.** Correct dotted, kanji and month-name dates stay
  quiet, and fractions stay numbers; an unchanged `12/1` in en-GB is read as numbers.
- **Plain-space groups resolve by pairing**, not by locale. Phone numbers and typed
  thousands both read correctly; a changed grouped number reads whole.
- **`11-12am` is 11:00-12:00, `11am-12am` ends at midnight.** The bare form follows everyday
  use; the explicit form is literal. The cost is `5-12am` reading as morning.
- **Japanese twelve o'clock accepts either convention**, one per side, the best fit first,
  then the nearer values, then the default (`\u5348\u524d12\u6642` noon). Copy uses both conventions.
- **`Nur Fr. 9 bis 20 Uhr` reads as Friday.** Swiss opening hours are far more common than
  whole-franc prices before a word range, and the 9 is still compared.
- **de-CH `Fr.` before split hours stays francs.** A price range before hours has the same
  shape, and a missed price change is worse.
- **de-CH `Fr. 27.11.` is francs; `Fr., 27.11.` is the date.** The shape is ambiguous; the
  comma decides.
- **A written clock time is never a price**, after any currency (`EUR 20 Uhr` is 20:00, no
  price).
- **Japanese query values continue through kana and kanji.** Glued copy then joins the value
  (a false blocker), accepted over missing a changed search term.
- **Only an ASCII hyphen continues a running-text link**, plus a dash inside a path before
  more path. Em and en dashes are how copy follows a link.
- **Full-width links, tags and codes are broken**, reported as missing, even though some
  systems would normalize them.
- **Kanji-numeral amounts stay unread** (an unsure currency question) rather than parsed.
- **Number words, idioms and `May` stay limitations.** No heuristics.
- **A currency written once on a range covers both ends**, like a percent sign, so
  `\u00a510,000-30,000` matches `1\u4e07\uff5e3\u4e07\u5186`.
- **Merge tags compare by name**: a translated Liquid default is copy for the language
  review, not a broken tag.
- **Digit-first promo codes, with exclusions as data.** `20OFF` is a code; units, sizes,
  ordinals, clock words and currency codes after digits are not (`512GB`, `9PM`, `50EUR`).
  Codes without digits are not read.
- **A price the tool cannot find is a question, not a guess.** An unread master price is an
  unsure `currency_code` finding for a person to look at; with the shipped rules it never
  blocks on its own.
- **The value checks still read attribute values.** Moving them onto visible text needs a
  tokenizer change, which this release does not make, so this stays a known limitation.

---

## 14. Open questions

None open. Every rule this spec states is built; the gaps are in
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
