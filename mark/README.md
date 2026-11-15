# Translation Launch Check: setup and demo (Mark side)

How to set up the Translation Launch Check in Optimizely's Agent Platform ("Mark"), run it,
and walk through the demo files. What the workflow does and how it is built:
[MARK.md](../docs/standards/MARK.md). What the tool checks:
[TOOL_CONTRACT.md](../docs/contract/TOOL_CONTRACT.md). What it does not do:
[KNOWN_LIMITATIONS.md](../docs/contract/KNOWN_LIMITATIONS.md).

Commands run from the repository root. Steps marked "verified in Task 23" are filled in after
the end-to-end runs.

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
     `scripts/send_package.py`; it never reaches the workflow.
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
2. Choose **Reuse existing** for agents already in the instance; the default, "Create new
   copy", makes duplicates. Use **Overwrite existing** only to update your own agent: it
   replaces that agent everywhere it is used.
3. Import Agent. (Verified in Task 23.)

**Triggers:**

- **Chat** works at once.
- **Webhook:** set its auth key in the import dialog's trigger step, before activating the
  workflow (the key can't be edited after the trigger is saved). Then check that a POST
  without the auth header is refused; if the key couldn't be set, recreate the webhook
  trigger with its key before activating. The trigger's name must equal
  `webhook_trigger_name` in the config; the build refuses a mismatch. (Verified in Task 23.)

## 4. Run

- **Chat:** in Mark chat, attach one localization CSV and send
  `@translation_launch_check check this`. Copy is read from the attached file, never from
  the chat text.
- **Webhook** (the call a CMP step would make):
  ```
  python scripts/send_package.py demo/black-friday-errors.csv --dry-run   # prints the payload
  python scripts/send_package.py demo/black-friday-errors.csv             # prints "HTTP <status>"
  ```
  The script parses the file with the workflow's own parser (a file with problems lists them
  and sends nothing), adds the package checksum, and refuses a package over the webhook's
  size budget. The report goes to `qa_inbox` by email; the webhook caller gets only the HTTP
  status, no report. (Verified in Task 23.)

Every run's outcome is in the run log (each step's inputs, outputs and condition branch);
chat text is a summary, the run log is the record.

## 5. Demo walkthrough

About five minutes, in chat unless noted. The files are in `demo/`; the results below are
the tool's exact findings for each file. The agents' part (back-translation, review, fixes)
varies a little between runs.

1. **Clean file** (`black-friday-clean.csv`; en-US with de-DE, fr-FR, ja-JP): no rule finding
   in any language. Overall Ready unless the reviewer raises something.
2. **Errors file** (`black-friday-errors.csv`; four cells changed): de-DE and fr-FR are
   **Fix first**, ja-JP is Ready with warnings. The rule checks find:
   - de-DE L1: the discount changed, 30% -> 20% (numbers);
   - de-DE L2: the date changed, 11/29 Sun -> 11/30 Mon; the merge tag renamed,
     `{{first_name}}` -> `{{vorname}}`; informal "dir" in a formal locale;
   - fr-FR L2: the tracking parameter `utm_campaign=bf26` dropped; the forbidden claim
     "garanti";
   - ja-JP L5: the do-not-translate term "TrailPro" missing.

   Two changes no rule can see go to the reviewer: de-DE L2 promises free shipping where the
   master says free returns, and fr-FR L2 offers early access to everyone where the master
   says members. Open the canvas: findings, back-translations, and suggested fixes, each
   re-checked ("passes the rule checks").

3. **Broken file** (`black-friday-broken.csv`): one message lists all three problems, and no
   agent runs: "Column jp isn't a supported locale. Did you mean ja-JP?", "L4 has no fr-FR
   text." and "The id L5 is used more than once.", with a link to the template.
4. **UK and Swiss file** (`black-friday-uk-ch.csv`; en-GB and de-CH): no blocker, both Ready
   with warnings. Market spelling fixed by code: en-GB "favourite colours" and "Organise";
   de-CH writes the sharp s as ss, in the greeting and in "Bahnhofstrasse"; and de-CH quotes the price in CHF where the master says USD
   ("confirm the local price").
5. **Encodings** (`demo/encodings/`, see its README): files 1-3 (UTF-8, UTF-8 with a
   byte-order mark, semicolon-separated) are accepted with no finding. Files 4-6 (Excel's
   default Windows-1252 and Shift_JIS) are refused: "The file isn't UTF-8 text." / "Save it
   as CSV UTF-8 and attach it again."
6. **Webhook**: `python scripts/send_package.py demo/black-friday-errors.csv`, then show the
   run in the run log and the report email in the QA inbox. (Verified in Task 23.)
7. **Optional, the catch rate:** run `demo/seeded-errors.csv` (20 planted errors: 17 rule
   checks and 3 claims, answer key in `seeded-errors.answers.json`). In the run log, copy
   the whole output of "Score each language" into a file, then run
   `python scripts/catch_rate.py <file>` for caught, missed and extra.

## 6. Costs and limits

- **Size:** at most 50 rows, 5 target languages, 1,000 characters per cell and 64 KB per
  file; very long copy is refused earlier ([KNOWN_LIMITATIONS](../docs/contract/KNOWN_LIMITATIONS.md)
  section 1).
- **Encoding:** UTF-8 only ([section 1](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Webhook:** a package is at most about 27.8 KB, the caller gets no report back, and
  failures are silent ([section 5](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Email:** only webhook runs send the report, to the QA inbox; email can't carry the file
  yet ([section 5](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Agents:** at most 20 second opinions per language and 60 suggested fixes per run
  ([section 5](../docs/contract/KNOWN_LIMITATIONS.md)).
- **Time and credits:** each language is one loop iteration with two agents, and iterations
  run mostly one after another; every run costs credits, shown in Agent Activity Logs. Run
  time and credits per demo file: verified in Task 23.
