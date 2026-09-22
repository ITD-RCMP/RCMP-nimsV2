import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Lottie from 'lottie-react';
import { Loader2, Send, Sparkles, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { SessionUser } from '@shared/lib/auth-session';
import { cn } from '@/lib/utils';
import { adminPromptChatFn } from '@backend/server/admin/admin-prompt.functions';
import { ADMIN_PROMPT_UNAVAILABLE_REPLY } from '@shared/lib/admin-prompt-context';
import chatbotAnimation from '@/assets/talking-robot-chatbot.json';

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

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'Hi, I\'m your NIMS assistant. Ask about inventory, requests, deployments, or overdue returns and I\'ll answer using live data from the database.',
  },
];

function renderInlineMarkdown(text: string, inverted?: boolean) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong
          key={index}
          className={cn('font-semibold', inverted && 'text-primary-foreground')}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function ChatMessageContent({ content, inverted }: { content: string; inverted?: boolean }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        if (trimmed.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0">•</span>
              <span>{renderInlineMarkdown(trimmed.slice(2), inverted)}</span>
            </div>
          );
        }

        return <p key={index}>{renderInlineMarkdown(line, inverted)}</p>;
      })}
    </div>
  );
}

function AiAssistantAvatar() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-10 rounded-full bg-lavender/15" />;
  }

  return (
    <Lottie
      animationData={chatbotAnimation}
      loop
      autoplay
      className="h-[3.75rem] w-[3.75rem] shrink-0"
      aria-label="AI assistant"
    />
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {isUser ? (
        <Avatar className="mt-0.5 h-9 w-9 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender/10">
          <AiAssistantAvatar />
        </div>
      )}
      <div
        className={cn(
          'max-w-[min(100%,36rem)] rounded-[14px] px-4 py-3 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
            : 'border border-border bg-card text-foreground',
        )}
      >
        {isUser ? message.content : <ChatMessageContent content={message.content} />}
      </div>
    </div>
  );
}

const PLACEHOLDER_PROMPTS = [
  'How many laptops are currently deployed?',
  'Summarize pending asset requests this week',
  'Which assets are overdue for return?',
  'Ask about asset ID 10042...',
];

function useTypingPlaceholder(active: boolean) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!active) {
      setText('');
      return;
    }

    let promptIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer: number | undefined;

    const schedule = (delay: number) => {
      timer = window.setTimeout(tick, delay);
    };

    const tick = () => {
      const full = PLACEHOLDER_PROMPTS[promptIndex];

      if (!deleting) {
        charIndex += 1;
        setText(full.slice(0, charIndex));
        if (charIndex >= full.length) {
          deleting = true;
          schedule(1800);
          return;
        }
        schedule(42);
        return;
      }

      charIndex -= 1;
      setText(full.slice(0, charIndex));
      if (charIndex <= 0) {
        deleting = false;
        promptIndex = (promptIndex + 1) % PLACEHOLDER_PROMPTS.length;
      }
      schedule(22);
    };

    schedule(280);

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [active]);

  return text;
}

function PromptTextarea({
  value,
  onChange,
  onKeyDown,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const showTypingPlaceholder = !value && !focused && !disabled;
  const typingPlaceholder = useTypingPlaceholder(showTypingPlaceholder);

  return (
    <div className="relative min-w-0 flex-1">
      {showTypingPlaceholder ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-3 truncate text-sm text-muted-foreground md:text-sm"
        >
          {typingPlaceholder}
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-muted-foreground/70 align-middle" />
        </div>
      ) : null}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=""
        rows={1}
        disabled={disabled}
        className="min-h-[44px] max-h-32 resize-none rounded-[12px] border-border bg-background py-3"
      />
    </div>
  );
}

type PromptChatPageProps = {
  Shell: ({ children }: { children: ReactNode }) => ReactNode;
  getSession: () => SessionUser | null;
  sessionExpiredMessage: string;
};

export function PromptChatPage({ Shell, getSession, sessionExpiredMessage }: PromptChatPageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const conversationHistoryRef = useRef<{ role: ChatRole; content: string }[]>([]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      const viewport = scrollAreaRef.current?.querySelector(
        '[data-radix-scroll-area-viewport]',
      );
      if (!(viewport instanceof HTMLElement)) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  }, []);

  useLayoutEffect(() => {
    scrollToBottom('smooth');
  }, [messages, sending, scrollToBottom]);

  const handleClearChat = () => {
    if (sending) return;
    conversationHistoryRef.current = [];
    setMessages(INITIAL_MESSAGES);
    setInput('');
  };

  const canClearChat = messages.some((message) => message.role === 'user');

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const session = getSession();
    if (!session) {
      toast.error(sessionExpiredMessage);
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages([userMessage]);
    setInput('');
    setSending(true);

    try {
      const result = await adminPromptChatFn({
        data: {
          message: content,
          history: conversationHistoryRef.current,
        },
      });

      const reply = result.reply?.trim() || ADMIN_PROMPT_UNAVAILABLE_REPLY;
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
      };

      conversationHistoryRef.current = [
        ...conversationHistoryRef.current,
        { role: 'user' as const, content },
        { role: 'assistant' as const, content: reply },
      ].slice(-8);

      setMessages([userMessage, assistantMessage]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to get a response.');
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: ADMIN_PROMPT_UNAVAILABLE_REPLY,
      };
      setMessages([userMessage, assistantMessage]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Shell>
      <div className="flex min-h-[calc(100svh-7rem)] flex-col">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-lavender/15 text-[oklch(0.45_0.12_290)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Ask AI</h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                AI can only generate answers from the live NIMS database data only don't ask about other things.
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-border bg-card/80 shadow-sm backdrop-blur-sm">
          <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
            <div className="space-y-5 p-4 sm:p-6">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {sending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              ) : null}
            </div>
          </ScrollArea>

          {messages.length === 1 && messages[0]?.id === 'welcome' ? (
            <div className="border-t border-border px-4 py-3 sm:px-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void handleSend(prompt)}
                    disabled={sending}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-lavender/40 hover:bg-lavender/10 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border-t border-border p-4 sm:p-5">
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <PromptTextarea
                value={input}
                onChange={setInput}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={sending}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-[12px]"
                disabled={!canClearChat || sending}
                aria-label="Clear chat"
                title="Clear chat"
                onClick={handleClearChat}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-[12px]"
                disabled={!input.trim() || sending}
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              AI can make mistakes don't expect it to be accurate. Contact support if you think it's wrong.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
