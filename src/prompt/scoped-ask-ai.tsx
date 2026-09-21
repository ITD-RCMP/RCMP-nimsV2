import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminPromptChatFn } from '@backend/server/admin/admin-prompt.functions';
import type { AdminPromptScope } from '@shared/lib/admin-prompt-context';
import { ASSET_KIND_LABEL, type AssetId, type AssetKind } from '@shared/lib/inventory-schema';
import { readTechnicianSession } from '@shared/lib/auth-session';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type ChatRole = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type ScopedAskAiTarget =
  | {
      type: 'asset';
      kind: AssetKind;
      assetId: AssetId;
      serialNum?: string | null;
    }
  | {
      type: 'request';
      requestId: number;
      requesterName?: string;
    };

function toScope(target: ScopedAskAiTarget): AdminPromptScope {
  if (target.type === 'asset') {
    return { type: 'asset', kind: target.kind, assetId: target.assetId };
  }
  return { type: 'request', requestId: target.requestId };
}

function bannerText(target: ScopedAskAiTarget) {
  if (target.type === 'asset') {
    const serial = target.serialNum?.trim();
    const serialLabel = serial && serial !== '-' ? serial : '';
    return serialLabel
      ? `Asking about ${ASSET_KIND_LABEL[target.kind]} asset #${target.assetId} (serial ${serialLabel})`
      : `Asking about ${ASSET_KIND_LABEL[target.kind]} asset #${target.assetId}`;
  }
  return target.requesterName
    ? `Asking about request #${target.requestId} (${target.requesterName})`
    : `Asking about request #${target.requestId}`;
}

function startersFor(target: ScopedAskAiTarget) {
  if (target.type === 'asset') {
    return ['What is the current status?', 'Are there any open repairs?'];
  }
  return ['Summarize this request', 'Which assets are still out?'];
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function MessageBody({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        if (trimmed.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0">•</span>
              <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={index}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

export function ScopedAskAiButton({
  target,
  label,
  className,
}: {
  target: ScopedAskAiTarget;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('gap-1.5 rounded-[8px]', className)}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Sparkles className="h-3.5 w-3.5 text-lavender" />
        <span className="ask-ai-link-text text-lavender">{label ?? 'Ask about this'}</span>
      </Button>
      <ScopedAskAiSheet open={open} onOpenChange={setOpen} target={target} />
    </>
  );
}

export function ScopedAskAiSheet({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ScopedAskAiTarget;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const historyRef = useRef<{ role: ChatRole; content: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const scope = toScope(target);
  const banner = bannerText(target);
  const starters = startersFor(target);

  sendingRef.current = sending;

  useEffect(() => {
    if (open) return;
    historyRef.current = [];
    setMessages([]);
    setInput('');
    setSending(false);
  }, [open, target]);

  useEffect(() => {
    if (!open || !transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [open, messages, sending]);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    if (!readTechnicianSession()) {
      toast.error('Your session expired. Sign in again.');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const result = await adminPromptChatFn({
        data: {
          message: content,
          history: historyRef.current,
          scope,
        },
      });
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
      };
      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const, content },
        { role: 'assistant' as const, content: result.reply },
      ].slice(-6);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get a response.';
      toast.error(message);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Sorry, I could not answer that. ${message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-lavender" />
            Ask AI
          </SheetTitle>
          <SheetDescription>{banner}</SheetDescription>
        </SheetHeader>

        <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 && !sending ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask a short question about this record. Answers stay scoped here.
              </p>
              <div className="flex flex-col gap-2">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    className="rounded-[10px] border border-border px-3 py-2 text-left text-sm hover:bg-secondary/50"
                    onClick={() => void handleSend(starter)}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm leading-relaxed">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'rounded-[12px] px-3 py-2',
                    message.role === 'user'
                      ? 'ml-6 bg-lavender/10 text-foreground'
                      : 'mr-4 bg-secondary/60',
                  )}
                >
                  <MessageBody content={message.content} />
                </div>
              ))}
              {sending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Looking this up…
                </p>
              ) : null}
            </div>
          )}
        </div>

        <form
          className="border-t border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about this…"
              disabled={sending}
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={sending || !input.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              disabled={sending || messages.length === 0}
              onClick={() => {
                if (sendingRef.current) return;
                historyRef.current = [];
                setMessages([]);
                setInput('');
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Clear</span>
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
