import { chat, maxIterations } from '@tanstack/ai';
import { createServerFn } from '@tanstack/react-start';
import { buildAdminPromptSystemPrompt } from '@shared/lib/admin-prompt-context';
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

export const adminPromptChatFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator(
    (data: {
      message: string;
      history?: PromptChatTurn[];
      customContext?: string;
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

    const { buildAdminPromptOpsPulse } = await import(
      '@backend/server/admin/admin-prompt-context-repo.server'
    );
    const { createAdminPromptServerTools } = await import(
      '@backend/server/admin/admin-prompt-tools.server'
    );

    const pulse = await buildAdminPromptOpsPulse();
    const history = (data.history ?? [])
      .filter((turn) => turn.content.trim())
      .slice(-8)
      .map((turn) => ({
        role: turn.role,
        content: turn.content.trim(),
      }));

    const adapter = getOpenRouterChatAdapter();
    const systemPrompts = [
      buildAdminPromptSystemPrompt(formatOpsPulse(pulse), data.customContext),
    ];
    const messages = [...history, { role: 'user' as const, content: message }];
    const tools = createAdminPromptServerTools();

    try {
      const reply = await chat({
        adapter,
        systemPrompts,
        messages,
        tools,
        stream: false,
        agentLoopStrategy: maxIterations(6),
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
