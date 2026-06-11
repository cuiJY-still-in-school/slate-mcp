/**
 * AI Provider 抽象层
 *
 * MVP: Anthropic (Claude API)
 * 后续扩展: OpenAI, 本地模型
 */

// ─── 消息类型 ───────────────────────────────────────

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

export interface Message {
  role: "user" | "assistant";
  content: string | MessageContent[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ProviderResponse {
  type: "text" | "tool_use";
  text?: string;
  tool_uses?: ToolUseContent[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
}

// ─── Anthropic Provider ─────────────────────────────

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 16000;
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** 系统提示词 — 照抄 Claude Code 逻辑 */
export function buildSystemPrompt(context?: string): string {
  let prompt = `You are 石板 (Slate), an AI coding assistant.

You have access to tools that let you read, write, and execute code.
You also have Slate protocol tools for discovering and publishing reusable components.

## Core Rules
1. Before writing new code, search for existing solutions with slate_search
2. Read .slate/ context with slate_read to understand the project
3. Reuse foundations from dependencies when applicable
4. When you create reusable components, publish them with slate_publish
5. Be thorough — handle edge cases, errors, and provide complete solutions`;

  if (context) {
    prompt += `\n\n## Project Context\n${context}`;
  }

  return prompt;
}

/**
 * 调用 Anthropic API（单轮，不含工具循环）
 */
export async function callAnthropic(
  messages: Message[],
  systemPrompt: string,
  tools: ToolDefinition[],
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<ProviderResponse> {
  const body: Record<string, unknown> = {
    model: config.model || DEFAULT_MODEL,
    max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS,
    system: systemPrompt,
    messages,
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json() as {
    stop_reason: string;
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };

  const response: ProviderResponse = {
    type: data.stop_reason === "tool_use" ? "tool_use" : "text",
    stop_reason: data.stop_reason as ProviderResponse["stop_reason"],
  };

  const toolUses: ToolUseContent[] = [];
  const textParts: string[] = [];

  for (const block of data.content) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
    if (block.type === "tool_use") {
      toolUses.push({
        type: "tool_use",
        id: block.id!,
        name: block.name!,
        input: block.input || {},
      });
    }
  }

  response.text = textParts.join("");
  response.tool_uses = toolUses.length > 0 ? toolUses : undefined;

  return response;
}
