# Admin Prompt AI (Ask AI)

Staff-only assistant used from Ask AI and the admin dock. The OpenRouter model is unchanged (`getOpenRouterChatAdapter()` / `OPENROUTER_MODEL` / default `poolside/laguna-xs-2.1:free`).

## How it works

Each question gets a **small ops pulse** (checked-out count, overdue count, open-repair count, active request count) plus a slim system prompt. The model must call **read-only server tools** for lists and lookups. The full inventory JSON snapshot is no longer injected into the prompt.

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

## Failure mode

If tool-calling with the current OpenRouter model fails, chat retries **without tools** but still uses the slim prompt and ops pulse. It does not fall back to dumping the full database snapshot.
