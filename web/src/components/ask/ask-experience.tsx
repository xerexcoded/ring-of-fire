"use client";

import { useChat } from "@ai-sdk/react";
import { useJsonRenderMessage } from "@json-render/react";
import { DefaultChatTransport, isToolUIPart, type ToolUIPart } from "ai";
import { Clipboard, RefreshCcw, Trash2, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { GenerativeBlocks } from "@/components/ask/generative-blocks";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  clearStoredConversation,
  loadStoredConversation,
  storeConversation,
} from "@/lib/ask/storage";
import type { AskUIMessage, NormalizedResult, SourceReceipt } from "@/lib/ask/types";
import { withBasePath } from "@/lib/paths";

const starterPrompts = [
  "What does the Ring of Fire actually mean?",
  "Compare reviewed volcanoes by Pacific region",
  "Why do deep earthquakes occur near subduction zones?",
  "What is missing from historical tsunami records?",
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

function compactToolOutput(output: unknown) {
  if (typeof output !== "object" || output === null) return output;
  const value = output as Record<string, unknown>;
  if (typeof value.resultId === "string") {
    return { resultId: value.resultId, resource: value.resource, rowCount: value.rowCount, truncated: value.truncated, querySummary: value.querySummary };
  }
  return output;
}

function errorLabel(error: Error | undefined) {
  if (!error) return null;
  if (error.message.includes("rate-limited")) return "This session has reached its question limit. Please try again after the retry window.";
  if (error.message.includes("request-active")) return "Another answer is already active in this session.";
  if (error.message.includes("chat-unavailable")) return "The model or governed analytics service is temporarily unavailable.";
  return "The guide could not complete that answer. You can retry without losing the conversation.";
}

function ToolPartView({ part }: { part: ToolUIPart }) {
  const output = "output" in part ? compactToolOutput(part.output) : undefined;
  const errorText = "errorText" in part ? part.errorText : undefined;
  return (
    <Tool defaultOpen={part.state === "output-error"}>
      <ToolHeader type={part.type} state={part.state} />
      <ToolContent>
        {"input" in part && <ToolInput input={part.input} />}
        <ToolOutput output={output} errorText={errorText} />
      </ToolContent>
    </Tool>
  );
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
  const sources = receiptParts(message);
  const toolParts = message.parts.filter(isToolUIPart) as ToolUIPart[];
  const copy = useCallback(() => { if (text) void navigator.clipboard.writeText(text); }, [text]);

  return (
    <Message from={message.role} data-message-id={message.id}>
      <MessageContent>
        {text && <MessageResponse isAnimating={isStreaming && isLatestAssistant}>{text}</MessageResponse>}
        {toolParts.map((part) => <ToolPartView key={part.toolCallId} part={part} />)}
        {message.role === "assistant" && hasSpec && <GenerativeBlocks spec={spec} results={results} loading={isStreaming && isLatestAssistant} />}
        {sources.length > 0 && (
          <Sources>
            <SourcesTrigger count={sources.length} />
            <SourcesContent>{sources.map((source) => <Source key={source.id} href={source.url} title={`${source.authority} · ${source.version}`} />)}</SourcesContent>
          </Sources>
        )}
      </MessageContent>
      {message.role === "assistant" && text && !isStreaming && (
        <MessageActions>
          <MessageAction tooltip="Copy answer" onClick={copy}><Clipboard aria-hidden="true" /></MessageAction>
          {isLatestAssistant && <MessageAction tooltip="Retry answer" onClick={onRetry}><RefreshCcw aria-hidden="true" /></MessageAction>}
        </MessageActions>
      )}
    </Message>
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
  const statusMessage = !available
    ? unavailableReason === "disabled" ? "The guide is being prepared and is not enabled yet." : "The model or governed analytics connection is not configured."
    : status === "submitted" ? "Opening the field notebook…"
      : status === "streaming" ? "Reading evidence and composing…"
        : errorLabel(error);

  return (
    <TooltipProvider>
      <section className="ask-console" aria-label="Ask the Pacific geology guide">
        <header className="ask-console-head">
          <div><span className="ask-live-mark" data-active={isGenerating} /><p>{available ? "Geology guide online" : "Guide unavailable"}</p></div>
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!messages.length}><Trash2 aria-hidden="true" />Clear conversation</Button>
        </header>

        <Conversation className="ask-conversation">
          <ConversationContent className="ask-transcript">
            {!messages.length && (
              <ConversationEmptyState icon={<Waves />} title="Start with a place, process, or piece of evidence" description="Ask about volcanoes, earthquakes, plates, tsunamis, or how this project defines and measures the Ring of Fire.">
                <div className="ask-empty-state">
                  <Waves aria-hidden="true" />
                  <p className="eyebrow">Ask the Pacific</p>
                  <h2>Read the restless edge through its evidence.</h2>
                  <p>Questions can stay conversational or open a map, series, evidence table, definition receipt, or published Data Lab workspace.</p>
                </div>
              </ConversationEmptyState>
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
            {statusMessage && <div className="ask-status" role="status" data-error={Boolean(error) || !available}><span />{statusMessage}{error && available && <button type="button" onClick={retry}>Retry</button>}</div>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="ask-composer-shell">
          <Suggestions className="ask-suggestions">
            {starterPrompts.map((suggestion) => <Suggestion key={suggestion} suggestion={suggestion} onClick={submit} disabled={!available || isGenerating} />)}
          </Suggestions>
          <PromptInput className="ask-prompt" onSubmit={({ text }) => submit(text)}>
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder={available ? "Ask about the Pacific’s restless geology…" : "Ask the Pacific is temporarily unavailable"}
                maxLength={2_000}
                disabled={!available}
                aria-label="Question for Ask the Pacific"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools><span>{input.length.toLocaleString()} / 2,000</span><span>Observed records stay distinct from explanation.</span></PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} disabled={!available || (!input.trim() && !isGenerating)} />
            </PromptInputFooter>
          </PromptInput>
          <p className="ask-disclaimer">Educational context only—not an alert, forecast, or emergency-response product. Conversation history remains in this browser for seven days.</p>
        </div>
      </section>
    </TooltipProvider>
  );
}
