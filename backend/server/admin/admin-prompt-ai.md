# Admin Prompt AI (Ask AI)

Staff-only assistant used from Ask AI, the admin dock, and scoped “Ask about this” sheets on asset/request detail.

## Models

- **Chat** is unchanged: `getOpenRouterChatAdapter()` / `OPENROUTER_MODEL` / default `poolside/laguna-xs-2.1:free`.
- **Embeddings** are separate: set `OPENROUTER_EMBEDDING_MODEL` (suggested `openai/text-embedding-3-small`). Reuses `OPENROUTER_API_KEY` unless `OPENROUTER_EMBEDDING_API_KEY` is set.

If the embedding model is missing or 404s, Ask AI still works with Slices 1–2 tools. `searchMessyText` returns a short “not configured” / empty result instead of crashing.

## How it works

Global Ask AI: each question gets a **small ops pulse** plus a slim system prompt. The model calls **read-only server tools** for lists, lookups, and messy-text search.

Scoped Ask AI (`scope` on `adminPromptChatFn`): pre-loads **one** asset or request, skips the fleet ops pulse, and registers a smaller tool set (max 2 tool-loop iterations). Closing the sheet clears that panel’s history.

The full inventory JSON snapshot is never injected into the prompt. Embedding vectors never enter the prompt — only short snippets from `searchMessyText`.

Tools run only inside `adminPromptChatFn` behind `staffMiddleware`. They never create, update, or delete records.

## Tools

| Tool | Purpose |
| --- | --- |
| `getInventorySummary` | Inventory by kind and status (optional year/month) |
| `getRequestSummary` | Active request totals, pool availability, recent highlights |
| `listOverdueReturns` | Overdue requests still holding assets |
| `lookupAsset` | Asset by id, serial, or MAC |
| `lookupRequest` | Request header and assignment summary |
| `listOpenRepairs` | Open repairs (optional kind / asset id) |
| `listExpiringWarranties` | Warranties ending within N days (default 90) |
| `getStatusReference` | Asset status_id meanings (request statuses are separate) |
| `searchMessyText` | Semantic search over repair remarks, warranty claims, request remarks, and FAQ notes |

Use lookup tools for exact ids/serials. Use `searchMessyText` for vague history (“have we had HDMI issues before?”). Cite matches as “a past repair on laptop #…” — never table names.

## Messy-text index

MySQL stays the source of truth. Vectors live in a **side SQLite file** (`backend/data/ai-embeddings.sqlite`, gitignored). Rebuild anytime:

```bash
npm run ai:reindex
```

Indexed text only: repair issue/remarks, warranty claim issue/remarks, request remarks, and markdown under `backend/data/ai-faq/`. Asset master fields (serial, status, location) are not embedded.

The script is idempotent (content hash skip). Printout includes scanned / embedded / skipped / removed / errors.

## Failure mode

If tool-calling with the current OpenRouter chat model fails, chat retries **without tools** but still uses the slim prompt (and focused record when scoped). It does not fall back to dumping the full database snapshot.

## Scoped entry points

- Asset detail (`/admin/asset/$kind/$assetId` and `/technician/asset/$kind/$assetId`)
- Technician requests expand panel
- Technician request log detail dialog

## Guardrails

Ask AI is read-only. Imperative requests to approve, reject, checkout, delete, dispose, or change status are blocked on the server before the model runs, and the system prompt repeats the same rule. “How do I approve…?” still goes to the model so it can point at the UI.

## Turn log

Each `adminPromptChatFn` call writes one row to MySQL `admin_prompt_log` (created on first use): staff, scope, question, answer, tools used, ok/error, chat model, latency. Log failures never fail the chat reply. Secrets are not stored.

## Golden questions

Print the 10-question smoke checklist (and run guardrail unit checks):

```bash
npm run ai:golden
```

Work through the printed questions in staff Ask AI before calling the feature done. Question 7 needs `npm run ai:reindex` if you want messy-text search.
