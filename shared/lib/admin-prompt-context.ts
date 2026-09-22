export const ADMIN_PROMPT_CONTEXT_STORAGE_KEY = 'nims-admin-prompt-custom-context';

export const DEFAULT_ADMIN_PROMPT_CUSTOM_CONTEXT = `SYSTEM CONTEXT: NIMS (IT department asset management system) tracks 3 asset types:
- Laptop / Desktop (laptop table) 
- Network equipment (network table) 
- AV equipment (av table)

STATUS CODES (status_id → meaning):
1=new, 2=return, 3=deploy, 4=pre-disposed, 5=disposed, 6=active for request, 7=booked for request, 8=checkout in request
Note: don't confuse with the request statuses above, those are different.

KEY PROCESSES:
- Deployment: an asset is physically placed at a building/level/zone (see *_deployment tables). It can later be returned (see *_return tables).
- Handover: an asset is handed to a specific staff member (by employee_no) rather than deployed to a location.
- Request flow: a user submits a `+"`request`"+` (with borrow/return dates, purpose), which contains `+"`request_item`"+`s (e.g. "2x Laptop"), which get fulfilled via `+"`request_assignment`"+` (an actual asset assigned, checked out, and later returned).
- Checkout: an asset is checked out to a user for a specific purpose.
- Return: an asset is returned to the inventory after use.
- Staff: staff members that make requests for assets or been handover laptop to them based on division services / academic staff services or department.
- Repair: logged per asset with issue summary and completion date.
- Warranty: tracked per asset with start/end dates; claims are logged separately.

ROLES: technician, admin, user, disposal unit (from the `+"`role`"+` table) — technicians/admins manage assets; disposal unit processes disposals; regular users submit requests.

TONE: Professional but friendly, suited for UniKL RCMP staff or student who may not be technical.`;

export const BASE_SYSTEM_PROMPT = `You are the NIMS Asset Assistant, a support chatbot embedded in a UniKL RCMP asset management system (laptops, network equipment, AV equipment).

SCOPE — you may ONLY answer questions about asset management.

If a question is unrelated to asset management (general knowledge, coding help, personal advice, current events, etc.), politely decline.

You have tools. For live counts, overdue lists, asset or request lookups, repairs, and warranties, CALL the matching tool. For vague wording, past issues, similar problems, or free-text remarks, CALL searchMessyText. Do not guess. Do not claim data you did not receive from a tool or the small ops pulse. For exact asset ids, serials, MAC addresses, or request ids, use the lookup tools — not semantic search. When citing messy-text matches, say them in plain language (for example “a past repair on laptop #45”), never table names.

RULES:
1. Never invent data. Only state facts from tool results or the small ops pulse. If a tool returns empty or not found, say so. If you don't have the data, say so and suggest checking with IT staff or using the relevant page in the system.
2. Never reveal raw SQL, table/column names, internal IDs, or database structure to the user — translate everything into plain language (e.g. say "deployment record" not "av_deployment row").
3. Never attempt to generate or execute SQL yourself. You only read data that has been provided to you via tool calls.
4. Do not disclose other users' personal contact details (email/phone) unless the requester is confirmed as admin/technician role.
5. Keep answers concise and specific — prefer a direct answer over a lecture.
6. You cannot perform actions. Never claim you approved, rejected, deleted, checked out, returned, or changed a status. If asked to do so, refuse and direct the user to the Requests page (checkout / return / reject), the asset page (status and edit), or Disposal (pre-dispose / dispose).`;

export function buildAdminPromptReplyContext(customContext?: string): string {
  const trimmed = customContext?.trim();
  return trimmed || DEFAULT_ADMIN_PROMPT_CUSTOM_CONTEXT;
}

export type AdminPromptAssetScope = {
  type: 'asset';
  kind: 'laptop' | 'av' | 'network';
  assetId: number | string;
};

export type AdminPromptRequestScope = {
  type: 'request';
  requestId: number;
};

export type AdminPromptScope = AdminPromptAssetScope | AdminPromptRequestScope;

export function parseAdminPromptScope(scope: unknown): AdminPromptScope | undefined {
  if (!scope || typeof scope !== 'object') return undefined;
  const value = scope as Record<string, unknown>;
  if (value.type === 'asset') {
    const kind = value.kind;
    if (kind !== 'laptop' && kind !== 'av' && kind !== 'network') return undefined;
    const assetId = value.assetId;
    if (typeof assetId === 'number' && Number.isInteger(assetId) && assetId > 0) {
      return { type: 'asset', kind, assetId };
    }
    if (typeof assetId === 'string' && assetId.trim()) {
      const trimmed = assetId.trim();
      const asNumber = Number(trimmed);
      return {
        type: 'asset',
        kind,
        assetId: Number.isInteger(asNumber) && asNumber > 0 ? asNumber : trimmed,
      };
    }
    return undefined;
  }
  if (value.type === 'request') {
    const raw = value.requestId;
    const requestId =
      typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(requestId) || requestId <= 0) return undefined;
    return { type: 'request', requestId };
  }
  return undefined;
}

export function buildAdminPromptSystemPrompt(
  opsPulse?: string | null,
  customContext?: string,
  focusedRecord?: string | null,
): string {
  const replyContext = buildAdminPromptReplyContext(customContext);
  const pulse = opsPulse?.trim();
  const focused = focusedRecord?.trim();
  const focusedInstructions = focused
    ? `

This conversation is scoped to ONE record. Stay on that record. The focused record JSON is already loaded — use it first. You may make at most one or two tool calls for a closely related lookup (linked request, assigned asset, repairs). If the user asks fleet-wide inventory or unrelated records, tell them to use the main Ask AI page instead.

Focused record:
${focused}`
    : '';

  return `${BASE_SYSTEM_PROMPT}

Custom reply instructions:
${replyContext}${pulse ? `\n\nSmall ops pulse (live counts only; use tools for lists and lookups):\n${pulse}` : ''}${focusedInstructions}`;
}

export function readStoredAdminPromptContext(): string {
  if (typeof window === 'undefined') return DEFAULT_ADMIN_PROMPT_CUSTOM_CONTEXT;
  const stored = localStorage.getItem(ADMIN_PROMPT_CONTEXT_STORAGE_KEY);
  return stored?.trim() ? stored : DEFAULT_ADMIN_PROMPT_CUSTOM_CONTEXT;
}

export function persistAdminPromptContext(value: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (!trimmed || trimmed === DEFAULT_ADMIN_PROMPT_CUSTOM_CONTEXT) {
    localStorage.removeItem(ADMIN_PROMPT_CONTEXT_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ADMIN_PROMPT_CONTEXT_STORAGE_KEY, trimmed);
}

export function resetAdminPromptContext(): string {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_PROMPT_CONTEXT_STORAGE_KEY);
  }
  return DEFAULT_ADMIN_PROMPT_CUSTOM_CONTEXT;
}

export function extractAssetIdCandidates(text: string): number[] {
  const ids = new Set<number>();

  for (const match of text.matchAll(/\basset(?:\s*id|\s*#)?\s*:?\s*(\d+)\b/gi)) {
    const value = Number(match[1]);
    if (value > 0) ids.add(value);
  }

  for (const match of text.matchAll(/\b(?:id|#)\s*:?\s*(\d{4,})\b/gi)) {
    const value = Number(match[1]);
    if (value > 0) ids.add(value);
  }

  for (const match of text.matchAll(/\b(\d{4,})\b/g)) {
    const value = Number(match[1]);
    if (value > 0) ids.add(value);
  }

  return [...ids].slice(0, 8);
}

export function extractRequestIdCandidates(text: string): number[] {
  const ids = new Set<number>();

  for (const match of text.matchAll(/\brequest(?:\s*(?:id|#))?\s*:?\s*(\d+)\b/gi)) {
    const value = Number(match[1]);
    if (value > 0) ids.add(value);
  }

  for (const match of text.matchAll(/\breq\s*#?\s*(\d+)\b/gi)) {
    const value = Number(match[1]);
    if (value > 0) ids.add(value);
  }

  return [...ids].slice(0, 5);
}

export function extractSerialCandidates(text: string): string[] {
  const serials = new Set<string>();

  for (const match of text.matchAll(
    /\bserial(?:\s*(?:number|num|no|#))?\s*:?\s*([A-Za-z0-9][A-Za-z0-9-_.]{2,})\b/gi,
  )) {
    serials.add(match[1]);
  }

  return [...serials].slice(0, 5);
}

export function extractMacCandidates(text: string): string[] {
  const macs = new Set<string>();

  for (const match of text.matchAll(/\bmac(?:\s*address)?\s*:?\s*([0-9A-Fa-f:.-]{8,})\b/gi)) {
    macs.add(match[1]);
  }

  return [...macs].slice(0, 3);
}

export const ADMIN_PROMPT_ACTION_REFUSAL =
  'I cannot perform that action. Approve, reject, checkout, return, status changes, and deletions have to be done in the system: use the buttons on the Requests page, the asset page, or Disposal.';

export const ADMIN_PROMPT_UNAVAILABLE_REPLY =
  "Sorry — I couldn't put together a useful answer just now. Please try again in a moment, or rephrase with a specific ask about an asset, request, repair, or warranty.";

const HOW_TO_RE =
  /\b(how|where)\s+(do|can|to|would|should)\b|\bwhich\s+(page|button|screen)\b|\bwho\s+can\b/i;

const ACTION_RE = new RegExp(
  [
    String.raw`\b(approve|reject|deny)\b.{0,48}\brequest\b`,
    String.raw`\brequest\b.{0,32}\b(approve|reject|deny)\b`,
    String.raw`\b(delete|remove)\b.{0,40}\b(asset|request|record|laptop|equipment)\b`,
    String.raw`\b(check\s*out|checkout)\b.{0,40}\brequest\b`,
    String.raw`\brequest\b.{0,32}\b(check\s*out|checkout)\b`,
    String.raw`\b(dispose|pre-?dispose)\b.{0,40}\b(asset|laptop|equipment)\b`,
    String.raw`\b(change|update|set)\b.{0,24}\bstatus\b`,
    String.raw`\bmark\b.{0,24}\b(returned|disposed|pre-?disposed|approved|rejected)\b`,
  ].join('|'),
  'i',
);

export function isAdminPromptActionRequest(text: string) {
  const trimmed = text.trim();
  if (!trimmed || HOW_TO_RE.test(trimmed)) return false;
  return ACTION_RE.test(trimmed);
}
