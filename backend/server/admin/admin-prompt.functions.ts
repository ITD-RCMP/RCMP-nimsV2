import { chat, defineChatMiddleware, maxIterations } from '@tanstack/ai';
import { createServerFn } from '@tanstack/react-start';
import {
  ADMIN_PROMPT_ACTION_REFUSAL,
  ADMIN_PROMPT_UNAVAILABLE_REPLY,
  buildAdminPromptSystemPrompt,
  isAdminPromptActionRequest,
  parseAdminPromptScope,
  type AdminPromptScope,
} from '@shared/lib/admin-prompt-context';
import { staffMiddleware } from '@backend/server/core/auth-middleware';
import {
  getOpenRouterChatAdapter,
  getOpenRouterModel,
  isOpenRouterConfigured,
} from '@backend/lib/openrouter';

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

function finalizeChatReply(reply: unknown): { text: string; empty: boolean } {
  const text = extractChatReply(reply);
  if (text) return { text, empty: false };
  return { text: ADMIN_PROMPT_UNAVAILABLE_REPLY, empty: true };
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

function scopeRef(scope: AdminPromptScope | undefined) {
  if (!scope) return null;
  if (scope.type === 'asset') return `${scope.kind}:${scope.assetId}`;
  return `request:${scope.requestId}`;
}

function createToolUseTracker() {
  const names: string[] = [];
  const middleware = defineChatMiddleware({
    name: 'admin-prompt-tool-tracker',
    onAfterToolCall(_ctx, info) {
      if (info.toolName) names.push(info.toolName);
    },
  });
  return { middleware, names };
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
  .handler(async ({ data, context }) => {
    const started = Date.now();
    const message = data.message.trim();
    const scope = parseAdminPromptScope(data.scope);
    const toolsUsed: string[] = [];
    let answer = '';
    let ok = true;
    let errorMessage: string | null = null;

    const writeLog = () => {
      void import('@backend/server/admin/admin-prompt-log-repo.server')
        .then(({ insertAdminPromptLog }) =>
          insertAdminPromptLog({
            staffId: context.staffId,
            scopeType: scope?.type ?? 'global',
            scopeRef: scopeRef(scope),
            question: message,
            answer,
            toolsUsed,
            ok,
            errorMessage,
            model: getOpenRouterModel(),
            latencyMs: Date.now() - started,
          }),
        )
        .catch((error) => {
          console.error('[admin-prompt] Failed to write Ask AI log.', error);
        });
    };

    try {
      if (!message) {
        throw new Error('Enter a question before sending.');
      }

      if (isAdminPromptActionRequest(message)) {
        answer = ADMIN_PROMPT_ACTION_REFUSAL;
        return { reply: answer };
      }

      if (!isOpenRouterConfigured()) {
        ok = false;
        errorMessage = 'OpenRouter is not configured';
        answer = ADMIN_PROMPT_UNAVAILABLE_REPLY;
        return { reply: answer };
      }

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
      const tracker = createToolUseTracker();

      try {
        const reply = await chat({
          adapter,
          systemPrompts,
          messages,
          tools,
          middleware: [tracker.middleware],
          stream: false,
          agentLoopStrategy: maxIterations(scope ? 2 : 6),
        });
        toolsUsed.push(...tracker.names);
        const finalized = finalizeChatReply(reply);
        answer = finalized.text;
        if (finalized.empty) {
          ok = false;
          errorMessage = 'Empty model reply';
        }
        return { reply: answer };
      } catch (error) {
        console.error('[admin-prompt] Tool-enabled chat failed; retrying without tools.', error);
        try {
          const reply = await chat({
            adapter,
            systemPrompts,
            messages,
            stream: false,
          });
          const finalized = finalizeChatReply(reply);
          answer = finalized.text;
          if (finalized.empty) {
            ok = false;
            errorMessage = 'Empty model reply after toolless retry';
          }
          return { reply: answer };
        } catch (retryError) {
          console.error('[admin-prompt] Toolless chat retry failed.', retryError);
          ok = false;
          errorMessage =
            retryError instanceof Error
              ? retryError.message
              : error instanceof Error
                ? error.message
                : 'Ask AI failed.';
          answer = ADMIN_PROMPT_UNAVAILABLE_REPLY;
          return { reply: answer };
        }
      }
    } catch (error) {
      ok = false;
      errorMessage = error instanceof Error ? error.message : 'Ask AI failed.';
      if (errorMessage === 'Enter a question before sending.') {
        throw error;
      }
      console.error('[admin-prompt] Ask AI failed.', error);
      answer = ADMIN_PROMPT_UNAVAILABLE_REPLY;
      return { reply: answer };
    } finally {
      writeLog();
    }
  });
