---
title: Market Rules and Glossary
shortcut: market-rules-glossary
keywords: localization QA, formality, German copy, French copy, Japanese copy, glossary, do-not-translate
---
# Market Rules and Glossary

Rules for marketing copy (email, ads, SMS, web) translated from one en-US master for
a seasonal campaign. The market rules below come from the same rules file the launch
check's code runs on, so they always agree with it. Follow them in every line you write.
Never report a breach the code finds (the listed forms): the code has already reported it.

<!-- RULES -->

## Judgment rubric

What only a language reviewer can see. Judge each line against its master; quote the
words behind every judgment.

### Claims (a blocker when changed, added or dropped)
A claim is anything the reader is promised:
- the offer: what is discounted, by how much, on what ("first order", "selected items");
- eligibility: who gets it ("members", "new customers", "everyone");
- dates and deadlines, and conditions ("while stocks last", "minimum spend", "online only");
- guarantees, superlatives and comparisons ("lowest price", "best", "free returns").

The code compares values only. The words around a value are yours: a qualifier ("up to"),
a direction or deadline ("until" became "from"), a day or time word ("tonight" became
"tomorrow"), scope or eligibility, an added or dropped guarantee. A boundary nuance only
("over 50" became "ab 50", from 50) is a warning. A value that differs is the code's
finding, never yours.

Forbidden terms in any inflected, compound or paraphrased form are claims too:
"garantierte", "Bestpreisgarantie", "garantis" are the forbidden "garantiert" and
"garanti". The exact listed form is the code's finding.

### Meaning, tone, idiom, untranslated (warning)
- meaning: the line says something else that is not a claim (a CTA that now says "learn
  more" instead of "shop now", a product described differently).
- tone: the register is wrong for the market or the brand, or changes between lines of one
  asset; slang or stiffness the master doesn't have. The code checks formality pronouns
  only; register beyond pronouns is yours. A pronoun choice or a mix of pronouns is never a
  tone finding. Japanese uses the polite (desu/masu) style;
  headlines and CTAs may be noun phrases.
- idiom: an idiom or wordplay translated word for word, so it reads oddly or means
  something else.
- untranslated: a whole English phrase or clause left in that a reader would notice. It
  never applies to an English locale.
- info: only a concrete, actionable style improvement a native copywriter would make.

### Not a problem
- The locale's required formality ("Sie" in de-DE, "vous" in fr-FR) is correct, not stiff.
- A do-not-translate term or event name kept in English ("Black Friday") is correct.
  Report a seasonal term only when the translation changes which event or season it names
  ("Christmas" became "winter").
- Marketing loanwords and anglicisms normal in the market are correct: Sale, Bestseller,
  Highlights, Outdoor-Equipment, week-end, and SALE or 30%OFF in Japanese.
- A natural adaptation with the same meaning ("Shop the collection" as "Entdecken Sie die
  Kollektion") is correct.
- Different number, date, currency or time notation for the same value is correct.
- A missing time zone is the code's check. Never report it.

### Ambiguous values
- "Fr." in de-CH: Swiss francs next to an amount ("Fr. 49.-"), Friday next to a date or a
  weekday list ("Fr., 28.11."). A bare "Fr." with neither cannot be told.
- A bare 12 o'clock ("12 Uhr", "12h") can be noon or midnight. In German and
  French it usually reads as noon; midnight is "24 Uhr", "Mitternacht" or "minuit".
- What these rules don't cover cannot be told. Never invent a rule, and never guess.

### What an empty result means
No findings means "no issues found by this review". It never means approved, compliant or
safe to launch: people sign off, not this check.
