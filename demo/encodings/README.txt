Translation Launch Check - demo files for text encodings
=========================================================

All six files hold the same small, correct campaign (3 lines: an email subject, an email
body with a merge tag and a tracking link, and a Google Ads headline) in en-US, de-DE,
fr-FR and ja-JP (file 5: en-US, de-DE and fr-FR only). Only the way the file is saved
differs. The workflow reads UTF-8 only.

How a file arrives matters:
- In Mark chat, Mark converts an attachment that isn't UTF-8 to UTF-8 before the
  workflow's code runs, by decoding it as Windows-1252. The workflow never sees the
  original bytes, so it catches a wrong encoding by what the text shows: cells made of
  question marks, or garbled Japanese.
- The webhook sender (scripts/send_package.py) reads the file from disk as raw bytes. A
  file that isn't UTF-8 is refused there: "The file isn't UTF-8 text. Save it as CSV
  UTF-8 and attach it again."

1-campaign-utf8.csv
   Plain UTF-8, comma-separated (what most tools and scripts write).
   Expected: accepted and checked.

2-campaign-excel-csv-utf8-bom.csv
   Excel "CSV UTF-8 (Comma delimited)". Starts with an invisible byte-order mark.
   Expected: accepted; the mark is stripped.

3-campaign-excel-german-semicolon-bom.csv
   Excel "CSV UTF-8" on a German-language Windows: semicolons instead of commas.
   Expected: accepted; the delimiter is detected. Verified in chat: Ready.

4-campaign-excel-default-windows-1252.csv
   Excel's default "CSV (Comma delimited)" on a Western Windows machine (Windows-1252).
   This encoding has no Japanese characters, so Excel writes every Japanese character as
   "?" when saving: the ja-JP column is already destroyed inside the file.
   Expected in chat (verified): refused, "...text is mostly question marks: the file was
   probably saved in the wrong encoding. Save it as CSV UTF-8 and attach it again."

5-campaign-western-only-windows-1252.csv
   Same Excel default, but only en-US, de-DE and fr-FR, so nothing is lost; the umlauts and
   accents are just stored the old way.
   Expected in chat (verified): accepted and checked, with the umlauts and accents
   correct, because Mark's Windows-1252 conversion is the right one for this file.
   Through the webhook sender: refused as not UTF-8.

6-campaign-excel-japanese-shift-jis.csv
   Excel's default CSV on a Japanese Windows machine (Shift_JIS). Here the German and
   French accented letters are the ones written as "?".
   Expected in chat: Mark's Windows-1252 conversion turns the Japanese into garbled
   characters; refused with the wrong-encoding message (after the mojibake rule ships).

Demo story: "A file can look perfect in Excel and still be broken on disk. Files 4 and 6
lost text the moment they were saved, and no guess at an encoding can bring it back. The
workflow asks for CSV UTF-8, which Excel offers in File > Save As."

Status: files 3, 4 and 5 were run in chat and behave as written above. File 6 is confirmed
once the mojibake rule ships. Through the webhook sender, files 4 to 6 are refused as not
UTF-8 (the parser's result is tested).
