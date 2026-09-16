# @pipeworx/crs-reports

Congressional Research Service reports — Congress's own nonpartisan analysis of
statutes, federal programmes and policy options — searchable by subject and
readable in full, with each report's authority, citations, licence and age
stated on every response.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1576+ live data sources.

## Tools

- `crs_search(query?, topic?, product_class?, author?, published_since?, published_before?, limit?)`
  — ranked search over report titles and the summaries CRS publishes with them.
  Returns titles, report numbers, CRS subject topics, authors, publication dates
  and a summary snippet. **Ranks titles and summaries, not report bodies** — that
  boundary is stated in every response as `searched`, because a miss otherwise
  reads as "CRS has never written about this".
- `crs_report(report_id, include_text?, max_chars?)` — one report in full by its
  number (`R43255`, `IF13006`, `LSB10123`). Returns the complete current-version
  text plus authors, topics, the bills and public laws it cites, and its age.
- `crs_recent(days?, topic?, product_class?, limit?)` — what CRS has published or
  revised lately, newest first. The change feed, for tracking the analysis that
  follows a bill or a rule.
- `crs_topics(facet?, limit?)` — CRS's own subject taxonomy with per-term counts,
  plus analysts and product families. Call it before filtering: CRS writes
  `U.S. Trade Policy`, and a guessed `Trade` matches nothing.

## Auth

**On the Pipeworx gateway: keyless.** The gateway injects the corpus — the
report index and the extracted report text — so a gateway call needs nothing
from the caller.

**Standalone (`npm i @pipeworx/mcp-crs-reports`): bring an api.data.gov key.** A
standalone install has neither half of the corpus, so the pack falls back to the
Library of Congress's own API and needs a key for it. Pass it as `_apiKey` on any
tool call; keys are free at <https://api.data.gov/signup/> and one key works
across every api.data.gov-fronted API. With no corpus and no key every tool
returns `{found: false, reason: "corpus_unavailable"}` and says so.

### The two modes are labelled, because they are not the same answer

Every response carries `mode`: `corpus` (hosted) or `live_api` (standalone with a
key). What live mode cannot do — stated on the response rather than silently
degraded:

| | `mode: "corpus"` | `mode: "live_api"` |
|---|---|---|
| `crs_report` text | full extracted report text, checksum-verified | CRS's own `summary` only, never under the name `text`; the body stays in the PDF at `pdf_url` |
| `crs_search` scope | every title **and** summary, ranked | titles only, scanned from the newest-updated end (the list endpoint has no query parameter at all); the response states how many it read against the corpus total |
| `topic` / `author` filters | yes | **refused by name** — they exist only on the per-report record, so honouring one would cost a request per report across 14,000 reports |
| `crs_topics` | full vocabulary with per-term counts | `product_class` only, without counts |

The refusals are deliberate. An unfiltered list returned under a filtered
question is the wrong answer wearing the right label, and a 3,700-character
summary sitting in the field where a 61,000-character report belongs is the one
substitution a caller would never notice.

If the corpus fails mid-call and the caller supplied `_apiKey`, the answer
comes from the live API instead and carries `degraded_from_corpus` saying so.

## Data sources

- <https://api.congress.gov/v3/crsreport> — the Library of Congress's record for
  each report: title, publication date, current version, authors, CRS subject
  topics, related bills and public laws, and CRS's own summary. api.data.gov
  fronted.
- <https://www.congress.gov/crs_external_products/> — the report PDFs the API
  points at; the text comes from the current version of each.

## What the data does and does not say

**CRS analysis is persuasive, never binding.** It is not law, it binds no court
and no agency, and it is cited as background and legislative context. Every
response carries `authority.binding_status: "persuasive"` and a `binding_note`
saying this in words, so a downstream agent cannot mistake a CRS explanation of
a statute for the statute.

**The set is the currently-active one, 2018 to today** — 14,115 reports at the
time of writing, which is what CRS presently lists as active rather than the
full historical archive. A report withdrawn or superseded by CRS leaves the set.

**Licence: none needed.** CRS reports are works of the US federal government and
17 U.S.C. §105 puts them outside copyright, so `license_terms.encumbered` is
false and no attribution is required. The one caveat, which CRS prints itself and
this pack repeats in `license_caveat`: an individual report may reproduce a
third-party chart or photograph, and §105 does not reach those.

## Traps, measured 2026-09-15

Worth knowing before touching the ingest (`scripts/ingest-crs-reports.mjs`):

- **`sort` is accepted and ignored.** `sort=updateDate+asc`, `sort=updateDate+desc`
  and a nonsense parameter all return the same first row. The list is always
  newest-first by `updateDate`. Nothing errors, so ordering built on `sort` is
  wrong and looks right.
- **`fromDateTime` / `toDateTime` do work**, and they filter on `updateDate` —
  14,115 unfiltered against 585 for `fromDateTime=2026-09-01`. That pair is the
  change feed that keeps the daily pass incremental.
- **`updateDate` is an America/New_York wall time wearing a `Z`.** Fourteen
  sampled reports each had a PDF `Last-Modified` exactly 4h (EDT) or 5h (EST)
  after their `updateDate`, to the second; the DST correlation is what rules out
  a fixed publishing lag. The PDF's header is the same event in real UTC and is
  what gets stored.
- **One walk of the list does not see the whole corpus.** It returns exactly the
  14,115 rows it claims and 14,097 distinct ids: 18 come back twice, every
  duplicate pair sharing one `updateDate` (2025-09-08T11:20:24Z). That is an
  unstable tiebreak — ordering is by `updateDate` alone and thousands of rows
  share a stamp from one bulk republication — so about as many reports are
  skipped as repeated while the count looks perfect. The ingest collapses
  duplicates and walks again.
- **The list row lags its own detail record.** Seconds apart for IF12988:
  `list.version` 1 / `list.updateDate` 22:09:04 against `currentVersion` 6 /
  `updateDate` 22:38:57. Enumerate from the list; take every value from the
  detail record.
- **The HTML rendition is unreachable and the PDF is fine.** The
  `/crs_external_products/<T>/HTML/<id>.html` path answers 403 with
  `Cf-Mitigated: challenge` from Worker egress and from a laptop, with and
  without a full browser header set. The PDF path answers 200 from both. A bare
  `HEAD` on the PDF gets 403 where `GET` gets 200, so a HEAD-only probe condemns
  the working path.
- **`summary` is the whole document for short products and only the summary for
  long ones.** R43255 is 3,754 characters of summary against 61,691 of report.
  `text_source` on every response says which rendition the text came from.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "crs-reports": {
      "url": "https://gateway.pipeworx.io/crs-reports/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/crs-reports/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1576+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "crs-reports": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-crs-reports"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-crs-reports
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Crs Reports data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
