---
title: Fix Playbook
shortcut: translation-fix-playbook
tools: copy_fit_check
---
# Fix Playbook

How to rewrite a localized marketing line so it passes the launch check, and how to read
`copy_fit_check`.

## Never move these away from the master
The offer and what it applies to, the call to action, conditions, legal text and
do-not-translate terms. Fixing a problem may bring one back to the master; nothing else
may change it. Keep links, merge tags, promo codes and numbers as the current translation
writes them, unless a problem names one. Never change a price, an amount or a currency, even
when a problem names it: local prices come from the price list, so keep them as written and
name the problem in the note. Keep the locale's formality, and one register
across the line. Add no value, qualifier, claim, guarantee, superlative or urgency the
master doesn't have.

## Read the copy_fit_check result
- `status` other than "ok": the call failed. Keep the draft and report `fits` false.
- `fits` false: cut `over_by` units. `unit` is chars, ads_chars (Japanese, Chinese and
  Korean characters and full-width forms count 2 each) or sms_segments (whole messages).
- `encoding` UCS-2 (SMS): one character outside the GSM alphabet cut the segment size from
  160 to 70. Replace a curly quote, long dash or emoji with a plain one; never remove an
  accent or a letter the language needs. Otherwise shorten words.
- `template_artifacts` not empty: remove exactly the listed text. It is placeholder or
  prompt text, never copy.

## Cut in this order
1. Filler and intensifiers ("really", "ganz", "vraiment", "jetzt" where it adds nothing).
2. Words a headline can drop: articles, a repeated subject, "here", "now".
3. A shorter word with the same meaning.
4. A shorter structure: a neutral infinitive call to action ("Jetzt 30 % sparen") is short
   and fits either formality.
Stop when it fits. Cut the fewest words, from the line's least important part.

## Japanese
Each kanji and kana counts 2 in ads_chars: a 30-unit headline holds 15 full-width
characters. Half-width digits, Latin letters and % count 1. Never use half-width katakana.

## When it cannot fit
After two redrafts, return the shortest faithful draft with `fits` false and say in the
note what would have to go. Never drop a claim, a condition or legal text to make a line
fit: a person decides that.
