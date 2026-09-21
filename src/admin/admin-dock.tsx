import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, MoreHorizontal, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminPromptChatFn } from '@backend/server/admin/admin-prompt.functions';
import { readAdminSession } from '@shared/lib/auth-session';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ChatRole = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const STARTER_PROMPTS = [
  'How many laptops are currently deployed?',
  'Summarize pending asset requests this week',
  'Which assets are overdue for return?',
];

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

const THINKING_STATUSES = [
  'Thinking',
  'Looking through inventory',
  'Checking live requests',
  'Gathering the numbers',
  'Putting this together',
];

function ThinkingStatus() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % THINKING_STATUSES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2.5 py-1" aria-live="polite" aria-atomic="true">
      <span className="dock-thinking-dot inline-flex h-2 w-2 shrink-0 rounded-full bg-lavender" />
      <p className="dock-thinking-label text-sm font-medium tracking-tight">
        {THINKING_STATUSES[index]}
        <span aria-hidden>…</span>
      </p>
    </div>
  );
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

export function AdminDock() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showStarters, setShowStarters] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const leaveTimer = useRef<number>(undefined);
  const historyRef = useRef<{ role: ChatRole; content: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const sendingRef = useRef(false);

  const hasThread = messages.length > 0;
  const expanded = hovered || focused || menuOpen || showStarters || sending || hasThread;

  const cancelLeave = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = undefined;
  };

  const handleEnter = () => {
    cancelLeave();
    setHovered(true);
  };

  const handleLeave = () => {
    cancelLeave();
    leaveTimer.current = window.setTimeout(() => setHovered(false), 160);
  };

  useEffect(() => {
    return () => cancelLeave();
  }, []);

  useEffect(() => {
    if (!expanded || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    inputRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [expanded, messages, sending]);

  sendingRef.current = sending;

  const handleClear = useCallback(() => {
    if (sendingRef.current) return;
    historyRef.current = [];
    setMessages([]);
    setInput('');
    setShowStarters(false);
    setHovered(false);
    setFocused(false);
    setMenuOpen(false);
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dockRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest('[data-radix-popper-content-wrapper]') ||
          target.closest('[data-sonner-toaster]'))
      ) {
        return;
      }
      handleClear();
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [handleClear]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    if (!readAdminSession()) {
      toast.error('Administrator session expired. Sign in again.');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setShowStarters(false);
    setSending(true);

    try {
      const result = await adminPromptChatFn({
        data: {
          message: content,
          history: historyRef.current,
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
      ].slice(-8);

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
  }, [input, sending]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5 md:left-[15.25rem]">
      <div
        ref={dockRef}
        className="pointer-events-auto flex w-full max-w-[42rem] flex-col items-center pt-10"
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
      >
        {expanded && (hasThread || sending) ? (
          <div
            ref={transcriptRef}
            className="mb-3 max-h-[min(42vh,22rem)] w-full overflow-y-auto rounded-[22px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_40px_-18px_oklch(0.45_0.08_280/0.35)] backdrop-blur-xl"
          >
            <div className="space-y-3 text-sm leading-relaxed">
              {messages.map((message) =>
                message.role === 'assistant' && !message.content.trim() ? null : (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[92%] rounded-[16px] px-3.5 py-2.5',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-[oklch(0.96_0.012_260)] text-foreground',
                      )}
                    >
                      {message.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      ) : (
                        <MessageBody content={message.content} />
                      )}
                    </div>
                  </div>
                ),
              )}
              {sending ? <ThinkingStatus /> : null}
            </div>
          </div>
        ) : null}

        {expanded && showStarters && !hasThread ? (
          <div className="mb-3 flex w-full flex-wrap justify-center gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => void handleSend(prompt)}
                className="rounded-full border border-border/70 bg-white/90 px-3 py-1.5 text-left text-xs text-foreground shadow-sm transition-colors hover:border-lavender/40 hover:bg-lavender/10 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            'dock relative flex items-center overflow-hidden',
            expanded ? 'dock-open h-14 w-full px-2' : 'dock-closed h-11 w-[4.75rem] justify-center px-0',
          )}
        >
          {expanded ? (
            <form
              className="flex w-full items-center gap-0.5"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <button
                type="button"
                aria-label="Suggested questions"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setShowStarters((open) => !open)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <input
                ref={inputRef}
                value={input}
                disabled={sending}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask NIMS assistant..."
                aria-label="Ask NIMS"
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-[12px]">
                  <DropdownMenuItem disabled={!hasThread || sending} onSelect={handleClear}>
                    <Trash2 className="h-4 w-4" />
                    Clear conversation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="submit"
                disabled={!input.trim() || sending}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[oklch(0.88_0.04_250)] text-primary transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </form>
          ) : (
            <button
              type="button"
              title="Ask AI"
              aria-label="Ask AI"
              className="flex h-full w-full items-center justify-center text-primary"
              onClick={() => {
                focusOnOpen.current = true;
                setHovered(true);
              }}
            >
              <Sparkles className="h-5 w-5 fill-current" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
