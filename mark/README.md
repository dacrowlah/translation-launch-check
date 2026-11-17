# Translation Launch Check: setup and demo (Mark side)

How to set up the Translation Launch Check in Optimizely's Agent Platform ("Mark"), run it,
and walk through the demo files. What the workflow does and how it is built:
[MARK.md](../docs/standards/MARK.md). What the tool checks:
[TOOL_CONTRACT.md](../docs/contract/TOOL_CONTRACT.md). What it does not do:
[KNOWN_LIMITATIONS.md](../docs/contract/KNOWN_LIMITATIONS.md).

Commands run from the repository root. The import steps, runs, demo results and the report
email below were verified in end-to-end runs in Mark.

## 1. Prerequisites

1. **Content Translation is installed and Active** in your Mark instance (Directory). The
   workflow reuses it for the back-translation and lists it as a required agent.
2. **The tool is deployed and registered.**
   - Deploy `tool/` to Vercel: the project's root directory is `tool/`, and the environment
     variable `TOOL_BEARER_TOKEN` holds a token of at least 32 characters
     ([TOOL.md](../docs/standards/TOOL.md) section 6).
   - In Mark: Connectors -> Registries -> **Add tool registry**. Give it a name (we use
     "Translation Launch Check Tools"), the discovery URL `https://<your-host>/discovery`
     and the same bearer token. Save may spin and seem to fail: reload the page, and the
     registry is there with both tools, `localization_check` and `copy_fit_check`.
   - After a tool is added or renamed, run Registries -> Actions -> **Sync**.
3. **The private config.** Copy `mark/local.config.example.json` to
   `mark/local.config.json` (gitignored) and fill in:
   - `allow_list`: the only addresses (`addresses`) and domains (`domains`) a report email
     may go to. A domain admits everyone at it, so never list a public mail domain;
   - `qa_inbox`: the address webhook runs report to; it must be on the allow-list;
   - `template_url`: a public HTTPS link to the CSV template (for example the raw-file URL
     of `demo/template.csv`). The corrected-file request links it; open it in a private
     window first;
   - `webhook_trigger_name`: the webhook trigger's name, `Translation Launch Check webhook`.
     Without it, no run counts as a webhook;
   - `scripts.webhook` (`url`, `auth_header`, `auth_key`): only for
     `scripts/send_package.py`; it never reaches the workflow. `auth_header` is `X-Api-Key`
     (as in the example); `url` and `auth_key` come from the webhook trigger after import
     (section 3).
4. **Python 3.12**, from the repository's `.venv`:
   ```
   python3.12 -m venv .venv && .venv/bin/pip install -r mark/requirements-dev.txt
   ```

## 2. Build

```
.venv/bin/python mark/build.py
```

This writes `mark/dist/`: `translation_launch_check.json` (the workflow, with every code
step's helpers inlined and both specialized agents bundled) and `skills/` with
`market-rules-glossary.json` and `translation-fix-playbook.json`. The build reads exactly
`mark/local.config.json` and stops (exit 2, naming no value) when it is missing or
incomplete. It also refuses a step whose code is over its size ceiling, and a webhook trigger
whose name differs from `webhook_trigger_name`. `--example` builds from the
example config into a temp folder, to check the build without private values.

## 3. Import

**Skills first** (the agents pin them):

1. Context -> Skills -> Add Skill -> **Import Skills** -> Direct upload.
2. Set "Create as" to **Organization**: only organization skills attach to agents.
3. Paste the contents of `mark/dist/skills/<name>.json`, then Import.
4. A pre-filled form opens: click Save.
5. Repeat for the second skill. (Each file's `trigger_type` is `keyword` or `tool`, which is
   what the import accepts; the build writes those.)

**Then the workflow:**

1. Agents -> Add Agent -> **Upload Agent**, paste `mark/dist/translation_launch_check.json`,
   Next. It bundles both specialized agents, Translation Review and Translation Fix
   Suggestions.
2. Choose **Reuse existing** for agents already in the instance (all three the workflow
   references, Content Translation included); the default, "Create new copy", makes
   duplicates. Use **Overwrite existing** only to update your own agent: it replaces that
   agent everywhere it is used.
3. Import Agent. The workflow imports Active, with 8 top-level steps (the loop holds the
   other three), and no duplicate agents.

**Triggers:**

- **Chat** works at once.
- **Webhook:** the import dialog has no auth-key field (its trigger page only says a new URL
  will be generated on import), so set the key after import:
  1. Open the workflow in the editor and click the webhook trigger node.
  2. Under AUTHENTICATION, set **Auth Key**, then click **Update**. The key persists (it is
     still there after a reload).
  3. Copy the webhook URL shown in the same panel into `scripts.webhook.url`, and the key
     into `scripts.webhook.auth_key`. The URL is specific to your instance: never commit it.

  Mark sends the key in the header `X-Api-Key` as the raw key (format `{token}`), whatever
  the imported JSON says. A POST with no key, a wrong key, or the key in `Authorization`
  (raw or as `Bearer`) gets `401 {"detail":"Invalid or missing authentication key"}`. The
  trigger's name must equal `webhook_trigger_name` in the config; the build refuses a
  mismatch.

## 4. Run

- **Chat:** in Mark chat, attach one localization CSV and send
  `@translation_launch_check check this`. Copy is read from the attached file, never from
  the chat text.
- **Webhook** (the call a CMP step would make):
  ```
  .venv/bin/python scripts/send_package.py demo/black-friday-launch.csv --dry-run  # the payload
  .venv/bin/python scripts/send_package.py demo/black-friday-launch.csv  # "HTTP <status>"
  ```
  The script parses the file with the workflow's own parser (a file with problems lists them
  and sends nothing), adds the package checksum, and refuses a package over the webhook's
  size budget. The run gives the same verdicts as chat, saves the canvas and emails the
  report to `qa_inbox`; the webhook caller gets only the HTTP status, no report.

Every run's outcome is in the run log (each step's inputs, outputs and condition branch).
Mark's chat reply is the orchestrator's summary of the report and may add its own remarks;
the canvas and the report text (the last step's `message`) are the system of record.

## 5. Demo walkthrough

In chat unless noted; each 3-language file takes about 1.5-3 minutes. The files are in
`demo/`; the results below are from live runs and the tool's exact findings. The agents'
part (back-translation, review, fixes) varies a little between runs, and the chat reply may
word the report its own way: show the canvas.

1. **Clean file** (`black-friday-clean.csv`; en-US with de-DE, fr-FR, ja-JP): **No issues
   found by automated checks**, no findings in any language; the canvas is saved.
2. **Errors file** (`black-friday-launch.csv`; four cells changed): **Fix first**. de-DE and
   fr-FR each have 4 blockers and 1 warning; ja-JP has no blocker and 1 warning. The rule
   checks find:
   - de-DE L1: the discount changed, 30% -> 20% (numbers);
   - de-DE L2: the date changed, 11/29 Sun -> 11/30 Mon; the merge tag renamed,
     `{{first_name}}` -> `{{vorname}}`; informal "dir" in a formal locale;
   - fr-FR L2: the tracking parameter `utm_campaign=bf26` dropped; the forbidden claim
     "garanti";
   - ja-JP L5: the do-not-translate term "TrailPro" missing.

   Two changes no rule can see go to the reviewer: de-DE L2 promises free shipping where the
   master says free returns, and fr-FR L2 offers early access to everyone where the master
   says members. Open the canvas: findings, back-translations, and suggested fixes, each
   re-checked (the top fixes "pass the rule checks").

   The reply links the corrected file ("Corrected file (N fixes applied, re-checked)"): the
   same CSV with every fix that passed the re-check applied. Download the corrected file,
   re-upload it, and it comes back **No issues found by automated checks** (lines still left
   for a person are counted; the download needs a signed-in Mark user).

3. **Broken file** (`black-friday-vendor-export.csv`): one message lists all three problems, and no
   agent runs: "Column jp isn't a supported locale. Did you mean ja-JP?", "L4 has no fr-FR
   text." and "The id L5 is used more than once.", with a link to the template.
4. **UK and Swiss file** (`black-friday-uk-ch.csv`; en-GB and de-CH): **No blocking issues
   found by automated checks**. Market spelling fixed by code: en-GB "favourite colours" and
   "Organise"; de-CH writes the sharp s as ss, in the greeting and in "Bahnhofstrasse". The
   de-CH price in CHF, where the master says USD, is kept and flagged for a person ("confirm
   the local price").
5. **Encodings** (`demo/encodings/`, see its README). Mark converts a chat attachment that
   isn't UTF-8 to UTF-8 by decoding it as Windows-1252 before the workflow runs, so in chat
   a wrong encoding shows in the text:
   - file 3 (German Excel: semicolons and a byte-order mark) is accepted: **No issues found
     by automated checks**;
   - file 4 (Excel's default Windows-1252, the Japanese already saved as "????") is refused:
     "...mostly question marks: the file was probably saved in the wrong encoding." / "Save
     it as CSV UTF-8 and attach it again.";
   - file 5 (Windows-1252, German and French only) is accepted and checked, the umlauts and
     accents correct: Mark's conversion is the right one for it;
   - file 6 (Shift_JIS) arrives with garbled Japanese and is refused at validation, with no
     agent step, one problem per ja-JP row: "L1's ja-JP text looks garbled: the file was
     probably saved in the wrong encoding." / "Save it as CSV UTF-8 and attach it again."

   Through the webhook sender, which reads the file's raw bytes, files 4-6 are refused:
   "The file isn't UTF-8 text."

6. **Webhook:** `.venv/bin/python scripts/send_package.py demo/black-friday-launch.csv` gives
   the same verdicts as chat, a saved canvas and the report email in the QA inbox; show the
   run in the run log. The email arrives as plain text from `no-reply@mark.optimizely.com`, with a
   "generated by Mark" line on top.
7. **Optional, the catch rate:** run `demo/seeded-errors.csv` (5 target languages, 20
   planted errors: 17 rule checks and 3 claims, answer key in `seeded-errors.answers.json`).
   In the run log, copy the whole output of "Score each language" into a file, then run
   `.venv/bin/python scripts/catch_rate.py <file>` for caught, missed and extra. Live:
   **20 of 20** caught (17 by code, 3 claims by Translation Review), plus a few extra
   reviewer warnings.

## 6. Costs and limits

- **Size:** at most 50 rows, 5 target languages, 1,000 characters per cell and 64 KB per
  file; very long copy is refused earlier ([KNOWN_LIMITATIONS](../docs/contract/KNOWN_LIMITATIONS.md)
  section 1).
- **Encoding:** UTF-8 only ([section 1](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Webhook:** a package is at most about 26.8 KB, the caller gets no report back, and
  failures are silent ([section 5](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Email:** only webhook runs send the report, to the QA inbox; email can't carry the file
  yet ([section 5](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Agents:** at most 20 second opinions per language and 60 suggested fixes per run
  ([section 5](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Time:** each language is one loop iteration with two agents, and iterations run mostly
  one after another: about 1.5-3 minutes for a 3-language file.
- **Credits** (from the run logs, rounded): a refused file (broken, wrong encoding) about 6;
  a 3-language file about 40-65 (clean 54, errors about 60-64, UK/CH 40-50, the webhook run
  60); the 5-language seeded set about 92. Credits show in Agent Activity Logs.
