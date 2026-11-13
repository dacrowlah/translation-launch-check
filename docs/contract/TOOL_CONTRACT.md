# Tool contract: the launch-readiness tool (`tool/`)

The authoritative contract of this service: what each tool function takes, what it
returns, and the rules it applies. It is consumed by the Launch Readiness Check workflow
in Optimizely's Agent Platform ("Mark"). A change to a name, type or behaviour here is a
breaking change for that workflow and needs the owner's approval.

## 1. Context

A marketer submits a multi-market campaign brief. The workflow verifies the input, then
checks each market for holiday clashes, local pricing, copy fit and translation quality,
and reports a per-market status. This service supplies everything deterministic:
- live outside data: public holidays and FX rates;
- exact arithmetic and counting: price points and character limits;
- rule-based findings with severities;
- tracking links.

The platform's sandboxes have no internet access, and language models miscount characters,
so these jobs live here.

Callers:
- `markets_launch_check` and `build_tracking_links` are called from workflow code steps
  (via `opal_tms_sdk`). No model sits between this service and the result.
- `copy_fit_check` is called by an agent during its rewrite-and-recheck loop.

## 2. Service rules (all functions)

- **Discovery** at `GET /discovery` is public. Every tool call requires
  `Authorization: Bearer <TOOL_BEARER_TOKEN>`.
- **Never throw at the caller.** Every expected problem is a status on the item it
  concerns. HTTP 500 is reserved for genuine defects.
- **Statuses only, no technical diagnostics** in responses: no stack traces, upstream HTTP
  codes, latencies, URLs or request headers. The caller turns statuses into user-facing
  text.
- **Technical detail goes to the server log only:** one structured line per upstream
  failure, with source, market, status and latency. Never secrets, headers or campaign copy.
- **Outbound HTTP** goes only to the allow-listed hosts in section 6, with a 5 s timeout per
  request. User input never becomes a URL host.
- **Inputs are validated** against the parameter tables below. A malformed call returns a
  validation error and does no work.
- **Determinism:** the same inputs and the same upstream data give the same output, with
  stable ordering, in input order.

## 3. `markets_launch_check`

One call covers every market (batched).

| Param | Type | Req | Description |
|---|---|---|---|
| `markets` | string[] | yes | Country codes or common aliases as the marketer wrote them, 1-10 entries |
| `launch_date` | string | yes | `YYYY-MM-DD` |
| `base_currency` | string | yes | ISO 4217 code of the base prices, e.g. `USD` |
| `prices` | number[] | yes | Base prices, at least 1, each > 0 with at most 2 decimals |
| `window_days` | integer | no | Days before and after launch to scan for holidays. Default 3, range 0-14 |

Response:
```
{
  launch_date, weekday,
  base_currency: { code, supported: boolean },
  fx: { base, as_of, status, stale },
  markets: [{
    input, country_code, country_status, suggestion,
    currency,
    holidays: { status, reason, launch_on_holiday,
                in_window: [{ date, name, local_name, nationwide, days_from_launch }],
                periods:   [{ start, end, days, bridge_days }] },
    pricing:  { status, reason, rate,
                prices: [{ base, converted, suggested, rule }] },
    rule_findings: [{ check, severity, detail, fix }]
  }]
}
```

Field values:
- `country_status`:
  - `valid`;
  - `alias_corrected` (e.g. `UK` -> `GB`; `country_code` holds the corrected code);
  - `invalid` (`suggestion` holds the closest valid code, or null).
- Check `status`: `verified` | `unverified` | `not_needed`.
- Check `reason`:
  - `null` when verified;
  - otherwise `not_covered` (the source has no data for this market; permanent) or
    `source_unavailable` (the source failed and no usable cache exists; temporary).
- `pricing.status = not_needed` when the market's currency equals the base currency.
- `fx.stale = true` when a cached rate up to 3 days old was served during an outage. It
  still counts as `verified`, with `as_of` showing its date.
- `rule_findings[].check`: `holiday` | `pricing`. `severity`: `blocker` | `warning` | `info`.
  `detail` and `fix` are plain-language sentences built from templates (section 7).

Behaviour:
- Country codes are validated against the full ISO 3166-1 alpha-2 list plus the alias table
  in `config/rules.json`. Case and surrounding whitespace are ignored.
- An `invalid` market gets no holiday or pricing lookups. Its checks are `unverified` with
  reason `null`, and it has no findings.
- An unsupported `base_currency` sets `base_currency.supported = false`, and pricing is
  `unverified` for every market.
- Holiday lookups run in parallel, one per country; each country's failure is isolated.
- FX uses **one** upstream call for all market currencies.
- Coverage is decided by the source's list of available countries and currencies, not by
  catching errors.

## 4. `copy_fit_check`

| Param | Type | Req | Description |
|---|---|---|---|
| `items` | object[] | yes | `[{ channel, field, text }]`, 1-50 items |

Response: `[{ channel, field, length, limit, unit, fits, over_by, encoding, template_artifacts, severity }]`.

- `channel` and `field` must match an entry in the channel limits table (section 7). An
  unknown pair returns `limit: null`, `fits: null`, `severity: "warning"`.
- `length` is measured in the channel's `unit`:
  - `ads_chars`: double-width (CJK) characters count 2;
  - `sms_segments`: GSM-7 vs UCS-2 detection, then segment count (160/153 for GSM-7, 70/67
    for UCS-2; one non-GSM character switches the whole message to UCS-2);
  - `chars` for everything else.
- `template_artifacts` lists leftover placeholders or prompt text found in `text`: `[[...]]`,
  `{{...}}`, `{skill:...}`, and the phrases in the artifact list in `config/rules.json`.
- `severity`:
  - `blocker` when any template artifact is found;
  - else `warning` when over the limit;
  - else `null`.
  - Exception: channels marked `soft` in the limits table (e.g. email subject) never exceed
    `warning`.

## 5. `build_tracking_links`

| Param | Type | Req | Description |
|---|---|---|---|
| `campaign_name` | string | yes | Used for `utm_campaign` (kebab-cased) |
| `landing_page_url_template` | string | yes | `https://...` containing `{market}`, replaced with the lowercase market code |
| `markets` | string[] | yes | Verified country codes |
| `channels` | string[] | yes | Channel ids from the channel convention table |

Response: `[{ market, channel, url }]`, ordered by market then channel.
- The convention comes from `config/rules.json`:
  - `utm_source` = platform;
  - `utm_medium` = channel type;
  - `utm_campaign` = kebab-case campaign name;
  - `utm_content` = lowercase market code.
- Existing query parameters on the template are kept. Values are URL-encoded.

## 6. Data sources (keyless)

| Source | Endpoint | Use |
|---|---|---|
| Frankfurter (ECB rates) | `GET https://api.frankfurter.dev/v1/latest?base=<B>&symbols=<C1,C2,...>` and `/v1/currencies` | FX for all currencies in one call; supported currencies |
| Nager.Date | `GET https://date.nager.at/api/v3/PublicHolidays/<year>/<CC>` | Public holidays |
| Nager.Date | `GET https://date.nager.at/api/v3/LongWeekend/<year>/<CC>` | Holiday periods and bridge days |
| Nager.Date | `GET https://date.nager.at/api/v3/AvailableCountries` | Coverage list |

Caching:
- FX: 6 h.
- Holidays, periods, coverage and currency lists: 7 days.
- On upstream failure, serve stale cache when present: FX up to 3 days old, other data up to
  30 days.

Known coverage gaps (verified 2026-11-12):
- Nager.Date has no holiday data for IN, AE, SA, TW, TH, MY, IL.
- Frankfurter has no AED or SAR rates.

## 7. Rules (`config/rules.json`), illustrative defaults

**Holiday severities:**

| Condition | Severity |
|---|---|
| Launch date is a nationwide public holiday | blocker |
| Within 1 day of a nationwide holiday | warning |
| Inside a holiday period (`periods`) | warning |
| A regional (non-nationwide) holiday on the launch date | warning |
| Any other holiday in the window | info |

**Pricing:**

| Condition | Severity |
|---|---|
| Converted price is not already a local price point | warning, with the suggestion |
| FX rate is stale | info |

Price-point rules per currency, for example:
- EUR, GBP, USD: x.99;
- JPY: whole yen, ending in 80 or 00, rounding to the nearest;
- BRL: x,90.

A currency without a rule rounds to 2 decimals and adds no warning.

**Channel limits:**

| Channel | Field | Limit | Unit | Soft |
|---|---|---|---|---|
| google_ads | headline | 30 | ads_chars | no |
| google_ads | description | 90 | ads_chars | no |
| email | subject | 50 | chars | yes |
| email | preheader | 90 | chars | yes |
| sms | body | 1 | sms_segments | no |
| web | meta_title | 60 | chars | yes |
| web | meta_description | 155 | chars | yes |

Sources:
- [Google Ads help](https://support.google.com/google-ads/answer/7653455): double-width
  characters count 2.
- [Twilio](https://twilio.com/docs/glossary/what-sms-character-limit) and
  [Plivo](https://plivo.com/docs/sms/concepts/encoding-and-concatenation): SMS encoding and
  segments.
- [Typecount](https://typecount.com/blog/email-subject-line-length): email subjects have no
  hard limit, so their limit is soft.

**Template artifact phrases:** "(at least one needed)", "(mindestens eines erforderlich)",
plus the bracket patterns in section 4.

**Tracking convention:** a channel table mapping each channel id to `utm_source` and
`utm_medium` (e.g. `google_ads` -> `google` / `cpc`; `email` -> `newsletter` / `email`).

**Aliases:** UK -> GB, EL -> GR, plus common English country names (e.g. "Germany" -> DE).
