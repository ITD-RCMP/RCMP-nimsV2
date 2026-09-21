import { chat, maxIterations } from '@tanstack/ai';
import { createServerFn } from '@tanstack/react-start';
import {
  buildAdminPromptSystemPrompt,
  parseAdminPromptScope,
  type AdminPromptScope,
} from '@shared/lib/admin-prompt-context';
import { staffMiddleware } from '@backend/server/core/auth-middleware';
import { getOpenRouterChatAdapter, isOpenRouterConfigured } from '@backend/lib/openrouter';

type PromptChatRole = 'user' | 'assistant';

type PromptChatTurn = {
  role: PromptChatRole;
  content: string;
};

function extractChatReply(reply: unknown): string {
  if (typeof reply === 'string') return reply.trim();
  if (reply && typeof reply === 'object') {
    const record = reply as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text.trim();
    if (typeof record.content === 'string') return record.content.trim();
    if (typeof record.reply === 'string') return record.reply.trim();
  }
  return String(reply ?? '').trim();
}

function formatOpsPulse(pulse: {
  generatedAt: string;
  checkedOutAssets: number;
  overdueReturns: number;
  openRepairs: number;
  activeRequests: number;
}) {
  return [
    `- Generated at: ${pulse.generatedAt}`,
    `- Assets currently checked out: ${pulse.checkedOutAssets}`,
    `- Overdue returns: ${pulse.overdueReturns}`,
    `- Open repairs: ${pulse.openRepairs}`,
    `- Active (non-rejected) requests: ${pulse.activeRequests}`,
  ].join('\n');
}

async function loadFocusedPromptRecord(scope: AdminPromptScope) {
    const { lookupRequestForPrompt, loadOpenRepairs } = await import(
    '@backend/server/admin/admin-prompt-context-repo.server'
  );

  if (scope.type === 'asset') {
    const { findAssetByAnyId } = await import('@backend/server/assets/assets-repo.server');
    const detail = await findAssetByAnyId(scope.assetId);
    const numericId = Number(scope.assetId);
    const openRepairs =
      Number.isInteger(numericId) && numericId > 0
        ? await loadOpenRepairs({ assetKind: scope.kind, assetId: numericId, limit: 5 })
        : [];
    const asset = detail
      ? {
          assetId: detail.asset.assetId,
          kind: detail.asset.kind,
          serialNum: detail.asset.serialNum,
          status: detail.asset.statusName,
          brand: detail.asset.brand,
          model: detail.asset.model,
        }
      : null;
    return JSON.stringify(
      {
        kind: scope.kind,
        assetId: scope.assetId,
        asset,
        notFound: !asset,
        openRepairs,
      },
      null,
      2,
    );
  }

  const lookup = await lookupRequestForPrompt(scope.requestId);
  return JSON.stringify(
    {
      requestId: scope.requestId,
      found: lookup.found,
      request: lookup.request,
    },
    null,
    2,
  );
}

export const adminPromptChatFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator(
    (data: {
      message: string;
      history?: PromptChatTurn[];
      customContext?: string;
      scope?: AdminPromptScope;
    }) => data,
  )
  .handler(async ({ data }) => {
    const message = data.message.trim();
    if (!message) {
      throw new Error('Enter a question before sending.');
    }

    if (!isOpenRouterConfigured()) {
      throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY to your .env file.');
    }

    const scope = parseAdminPromptScope(data.scope);
    const { buildAdminPromptOpsPulse } = await import(
      '@backend/server/admin/admin-prompt-context-repo.server'
    );
    const { createAdminPromptServerTools } = await import(
      '@backend/server/admin/admin-prompt-tools.server'
    );

    const [pulse, focusedRecord] = await Promise.all([
      scope ? Promise.resolve(null) : buildAdminPromptOpsPulse(),
      scope
        ? loadFocusedPromptRecord(scope).catch((error) => {
            console.error('[admin-prompt] Failed to load scoped record.', error);
            return JSON.stringify({
              ...scope,
              notFound: true,
              error: 'The focused record could not be loaded.',
            });
          })
        : Promise.resolve(null),
    ]);
    const history = (data.history ?? [])
      .filter((turn) => turn.content.trim())
      .slice(scope ? -6 : -8)
      .map((turn) => ({
        role: turn.role,
        content: turn.content.trim(),
      }));

    const adapter = getOpenRouterChatAdapter();
    const systemPrompts = [
      buildAdminPromptSystemPrompt(
        pulse ? formatOpsPulse(pulse) : null,
        data.customContext,
        focusedRecord,
      ),
    ];
    const messages = [...history, { role: 'user' as const, content: message }];
    const tools = createAdminPromptServerTools(scope);

    try {
      const reply = await chat({
        adapter,
        systemPrompts,
        messages,
        tools,
        stream: false,
        agentLoopStrategy: maxIterations(scope ? 2 : 6),
      });
      return { reply: extractChatReply(reply) };
    } catch (error) {
      console.error('[admin-prompt] Tool-enabled chat failed; retrying without tools.', error);
      const reply = await chat({
        adapter,
        systemPrompts,
        messages,
        stream: false,
      });
      return { reply: extractChatReply(reply) };
    }
  });
