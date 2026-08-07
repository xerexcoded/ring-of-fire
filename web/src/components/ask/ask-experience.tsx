"use client";

import { useChat } from "@ai-sdk/react";
import { useJsonRenderMessage } from "@json-render/react";
import { DefaultChatTransport, isToolUIPart, type ToolUIPart } from "ai";
import {
  Activity,
  ArrowUp,
  Clipboard,
  Layers3,
  MapPinned,
  Mountain,
  RefreshCcw,
  Square,
  Trash2,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { GenerativeBlocks, WorkspaceBlock } from "@/components/ask/generative-blocks";
import { ToolSteps } from "@/components/ask/tool-steps";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { askErrorNotice } from "@/lib/ask/errors";
import { presentGuideText } from "@/lib/ask/presentation";
import {
  clearStoredConversation,
  loadStoredConversation,
  storeConversation,
} from "@/lib/ask/storage";
import type { AskUIMessage, NormalizedResult, SourceReceipt } from "@/lib/ask/types";
import { specIncludesWorkspace, workspaceFromToolParts } from "@/lib/ask/workspaces";
import { withBasePath } from "@/lib/paths";

const starterPrompts = [
  { label: "Define the ring", prompt: "What does the Ring of Fire actually mean?", icon: Layers3 },
  { label: "Compare volcanoes", prompt: "Compare reviewed volcanoes by Pacific region", icon: Mountain },
  { label: "Read seismic depth", prompt: "Why do deep earthquakes occur near subduction zones?", icon: Activity },
  { label: "Audit the record", prompt: "What is missing from historical tsunami records?", icon: Waves },
];

function textOnlyMessages(messages: AskUIMessage[]) {
  return messages.flatMap((message) => {
    const text = message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").trim();
    return text ? [{ id: message.id, role: message.role, parts: [{ type: "text" as const, text }] }] : [];
  }).slice(-12);
}

function resultParts(messages: AskUIMessage[]) {
  return messages.flatMap((message) => message.parts.flatMap((part) =>
    part.type === "data-queryResult" ? [part.data as NormalizedResult] : [],
  ));
}

function receiptParts(message: AskUIMessage) {
  return message.parts.flatMap((part) => part.type === "data-sourceReceipt" ? [part.data as SourceReceipt] : []);
}

function TranscriptMessage({
  message,
  results,
  isStreaming,
  isLatestAssistant,
  onRetry,
}: {
  message: AskUIMessage;
  results: NormalizedResult[];
  isStreaming: boolean;
  isLatestAssistant: boolean;
  onRetry: () => void;
}) {
  const { text, spec, hasSpec } = useJsonRenderMessage(message.parts);
  const presentedText = presentGuideText(text, message.role);
  const sources = receiptParts(message);
  const toolParts = message.parts.filter(isToolUIPart) as ToolUIPart[];
  const toolWorkspace = workspaceFromToolParts(message.parts);
  const hasGeneratedWorkspace = specIncludesWorkspace(spec);
  const copy = useCallback(() => { if (presentedText) void navigator.clipboard.writeText(presentedText); }, [presentedText]);

  return (
    <Message from={message.role} data-message-id={message.id}>
      <div className="ask-message-meta" aria-hidden="true">
        <span>{message.role === "assistant" ? <MapPinned /> : null}</span>
        {message.role === "assistant" ? "Pacific field guide" : "You"}
      </div>
      <MessageContent className="ask-message-body">
        {presentedText && <MessageResponse isAnimating={isStreaming && isLatestAssistant}>{presentedText}</MessageResponse>}
        <ToolSteps parts={toolParts} isStreaming={isStreaming && isLatestAssistant} />
        {message.role === "assistant" && hasSpec && <GenerativeBlocks spec={spec} results={results} loading={isStreaming && isLatestAssistant} />}
        {message.role === "assistant" && toolWorkspace && !hasGeneratedWorkspace && !isStreaming && (
          <WorkspaceBlock resourceKey={toolWorkspace.resourceKey} title={toolWorkspace.title} />
        )}
        {sources.length > 0 && (
          <Sources>
            <SourcesTrigger count={sources.length} />
            <SourcesContent>{sources.map((source) => <Source key={source.id} href={source.url} title={`${source.authority} · ${source.version}`} />)}</SourcesContent>
          </Sources>
        )}
      </MessageContent>
      {message.role === "assistant" && presentedText && !isStreaming && (
        <MessageActions>
          <MessageAction tooltip="Copy answer" onClick={copy}><Clipboard aria-hidden="true" /></MessageAction>
          {isLatestAssistant && <MessageAction tooltip="Retry answer" onClick={onRetry}><RefreshCcw aria-hidden="true" /></MessageAction>}
        </MessageActions>
      )}
    </Message>
  );
}

function StarterPrompts({
  compact = false,
  disabled,
  onSelect,
}: {
  compact?: boolean;
  disabled: boolean;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className={compact ? "ask-quick-prompts" : "ask-starter-prompts"} aria-label="Suggested geology questions">
      {starterPrompts.map(({ label, prompt, icon: Icon }, index) => (
        <PromptSuggestion
          key={prompt}
          className={compact ? "ask-quick-prompt" : "ask-starter-prompt"}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          aria-label={prompt}
        >
          {!compact && <span className="ask-starter-index">0{index + 1}</span>}
          {!compact && <Icon aria-hidden="true" />}
          <span><small>{label}</small>{!compact && <strong>{prompt}</strong>}</span>
        </PromptSuggestion>
      ))}
    </div>
  );
}

export function AskExperience({ available, unavailableReason }: { available: boolean; unavailableReason: "disabled" | "missing-configuration" | null }) {
  const [input, setInput] = useState("");
  const hydratedRef = useRef(false);
  const transport = useMemo(() => new DefaultChatTransport<AskUIMessage>({
    api: withBasePath("/api/ask"),
    credentials: "same-origin",
    prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: textOnlyMessages(messages) } }),
  }), []);
  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    clearError,
  } = useChat<AskUIMessage>({ transport, throttle: 40 });
  const isGenerating = status === "submitted" || status === "streaming";
  const results = useMemo(() => resultParts(messages), [messages]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMessages(loadStoredConversation(window.localStorage));
      hydratedRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [setMessages]);

  useEffect(() => {
    if (hydratedRef.current) storeConversation(window.localStorage, messages);
  }, [messages]);

  const submit = useCallback((text: string) => {
    const value = text.trim();
    if (!available || !value || value.length > 2_000 || isGenerating) return;
    clearError();
    setInput("");
    void sendMessage({ text: value });
  }, [available, clearError, isGenerating, sendMessage]);

  const retry = useCallback(() => {
    if (!available || isGenerating) return;
    clearError();
    void regenerate();
  }, [available, clearError, isGenerating, regenerate]);

  const clear = useCallback(() => {
    if (isGenerating) stop();
    setMessages([]);
    clearStoredConversation(window.localStorage);
    clearError();
  }, [clearError, isGenerating, setMessages, stop]);

  const latestAssistantIndex = messages.findLastIndex((message) => message.role === "assistant");
  const errorNotice = askErrorNotice(error);
  const statusNotice = !available
    ? { message: unavailableReason === "disabled" ? "The guide is being prepared and is not enabled yet." : "The model or governed analytics connection is not configured.", tone: "error" as const }
    : status === "submitted" ? { message: "Opening the field notebook…", tone: "progress" as const }
      : status === "streaming" ? { message: "Reading evidence and composing…", tone: "progress" as const }
        : errorNotice ? { message: errorNotice.message, tone: "error" as const } : null;

  return (
    <TooltipProvider>
      <section className="ask-console" aria-label="Ask the Pacific geology guide">
        <header className="ask-console-head">
          <div className="ask-agent-identity">
            <span className="ask-agent-mark" data-active={isGenerating}><Activity aria-hidden="true" /></span>
            <div><h1>Ask the Pacific</h1><p>{available ? "Geology guide online" : "Guide unavailable"}</p></div>
          </div>
          <div className="ask-console-actions">
            <span className="ask-governed-label"><span />Governed evidence</span>
            <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!messages.length}><Trash2 aria-hidden="true" />Clear <span className="ask-clear-long">conversation</span></Button>
          </div>
        </header>

        <div className="ask-conversation-wrap">
          <ChatContainerRoot className="ask-conversation" data-prompt-kit="chat-container" aria-label="Conversation transcript">
            <ChatContainerContent className="ask-transcript" tabIndex={0}>
            {!messages.length && (
              <div className="ask-empty-state">
                <div className="ask-empty-copy">
                  <span className="ask-empty-orbit"><MapPinned aria-hidden="true" /></span>
                  <p className="eyebrow">Source-aware field guide</p>
                  <h2>Explore the restless Pacific.</h2>
                  <p>Ask for an explanation, compare the observed record, or open an interactive Data Lab view. Every analytical answer keeps its evidence attached.</p>
                </div>
                <StarterPrompts disabled={!available || isGenerating} onSelect={submit} />
                <div className="ask-capability-line" aria-label="Available evidence views">
                  <span>Maps</span><span>Series</span><span>Evidence tables</span><span>Metabase workspaces</span>
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <TranscriptMessage
                key={message.id}
                message={message}
                results={results}
                isStreaming={isGenerating}
                isLatestAssistant={index === latestAssistantIndex}
                onRetry={retry}
              />
            ))}
            {statusNotice && (
              <div className="ask-status" role="status" data-tone={statusNotice.tone}>
                <span aria-hidden="true" />
                <div className="ask-status-copy">
                  <p>{statusNotice.message}</p>
                  {errorNotice && available && (errorNotice.canRetry || errorNotice.canStartFresh) && (
                    <div className="ask-status-actions">
                      {errorNotice.canRetry && <button type="button" onClick={retry}>Retry answer</button>}
                      {errorNotice.canStartFresh && <button type="button" onClick={clear}>Start fresh conversation</button>}
                    </div>
                  )}
                </div>
              </div>
            )}
            <ChatContainerScrollAnchor />
            </ChatContainerContent>
            <div className="ask-scroll-control"><ScrollButton /></div>
          </ChatContainerRoot>
        </div>

        <div className="ask-composer-shell">
          {messages.length > 0 && <StarterPrompts compact disabled={!available || isGenerating} onSelect={submit} />}
          <PromptInput
            className="ask-prompt"
            value={input}
            onValueChange={setInput}
            onSubmit={() => submit(input)}
            maxHeight={176}
            isLoading={isGenerating}
            disabled={!available}
            data-prompt-kit="prompt-input"
          >
            <PromptInputTextarea
              placeholder={available ? "Ask about the Pacific’s restless geology…" : "Ask the Pacific is temporarily unavailable"}
              maxLength={2_000}
              aria-label="Question for Ask the Pacific"
            />
            <div className="ask-prompt-footer">
              <PromptInputActions className="ask-prompt-context">
                <span>{input.length.toLocaleString()} / 2,000</span>
                <span>Observed records stay distinct from explanation.</span>
              </PromptInputActions>
              <PromptInputActions>
                <kbd>Shift ↵</kbd>
                <Button
                  type="button"
                  size="icon-lg"
                  className="ask-send-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isGenerating) stop(); else submit(input);
                  }}
                  disabled={!available || (!input.trim() && !isGenerating)}
                  aria-label={isGenerating ? "Stop generating" : "Send question"}
                >
                  {isGenerating ? <Square aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
                </Button>
              </PromptInputActions>
            </div>
          </PromptInput>
          <p className="ask-disclaimer">Educational context only—not an alert, forecast, or emergency-response product. Conversation history remains in this browser for seven days.</p>
        </div>
      </section>
    </TooltipProvider>
  );
}
