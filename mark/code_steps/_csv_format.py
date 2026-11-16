"""The localization CSV's shape: the CSV's fixed columns, which are also each package line's
naming keys (the parser, the webhook package, the check facts, the scores and the fixes'
re-check), and the UTF-8 byte order mark Excel writes (the parser and the corrected file).
Plain values only, so scripts/send_package.py can import it outside Mark."""

BOM = "\ufeff"
FIXED_COLUMNS = ("id", "channel", "field")
