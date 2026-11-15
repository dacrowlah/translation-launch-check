Translation Launch Check - demo files for text encodings
=========================================================

All six files hold the same small, correct campaign (3 lines: an email subject, an email
body with a merge tag and a tracking link, and a Google Ads headline) in en-US, de-DE,
fr-FR and ja-JP (file 5: en-US, de-DE and fr-FR only). Only the way the file is saved
differs. The tool accepts UTF-8 only.

1-campaign-utf8.csv
   Plain UTF-8, comma-separated (what most tools and scripts write).
   Expected: accepted and checked.

2-campaign-excel-csv-utf8-bom.csv
   Excel "CSV UTF-8 (Comma delimited)". Starts with an invisible byte-order mark.
   Expected: accepted; the mark is stripped.

3-campaign-excel-german-semicolon-bom.csv
   Excel "CSV UTF-8" on a German-language Windows: semicolons instead of commas.
   Expected: accepted; the delimiter is detected.

4-campaign-excel-default-windows-1252.csv
   Excel's default "CSV (Comma delimited)" on a Western Windows machine (Windows-1252).
   This encoding has no Japanese characters, so Excel writes every Japanese character as
   "?" when saving: the ja-JP column is already destroyed inside the file.
   Expected: rejected with "The file isn't UTF-8 text. Save it as CSV UTF-8 and attach it
   again."

5-campaign-western-only-windows-1252.csv
   Same Excel default, but only en-US, de-DE and fr-FR, so nothing is lost; the umlauts and
   accents are just stored the old way.
   Expected: rejected with the same message (UTF-8 only, one rule for every file).

6-campaign-excel-japanese-shift-jis.csv
   Excel's default CSV on a Japanese Windows machine (Shift_JIS). Here the German and
   French accented letters are the ones written as "?".
   Expected: rejected with the same message.

Demo story: "A file can look perfect in Excel and still be broken on disk. Files 4 and 6
lost text the moment they were saved, so the tool doesn't guess at an encoding. It asks for
CSV UTF-8, which Excel offers in File > Save As."

Status: the expected results are the design. They get confirmed by sending each file
through chat and email in the end-to-end rehearsal (email decoding is done by the platform
and is not yet verified for files 4 to 6).
