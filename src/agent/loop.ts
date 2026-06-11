/**
 * AI Agent Loop — 照抄 Claude Code 逻辑
 *
 * 核心循环:
 *   send messages → receive response → if tool_use: execute → feed back → repeat
 *   直到 AI 返回 end_turn（最终文本回答）
 */

import {
  callAnthropic, buildSystemPrompt,
  type Message, type MessageContent, type ToolDefinition, type ProviderConfig,
} from "./provider.js";
// ToolRegistry is defined below — no separate import needed

// ─── 配置 ───────────────────────────────────────────

const MAX_TOOL_ROUNDS = 25; // 防无限循环

export interface AgentConfig {
  provider: ProviderConfig;
  tools: ToolDefinition[];
  registry: ToolRegistry;
  context?: string;
  maxRounds?: number;
}

// ─── 工具注册表 ─────────────────────────────────────

export type ToolHandler = (params: Record<string, unknown>) => Promise<string>;

export class ToolRegistry {
  private handlers = new Map<string, ToolHandler>();

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async execute(name: string, params: Record<string, unknown>): Promise<string> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return `Unknown tool: ${name}`;
    }
    try {
      return await handler(params);
    } catch (e) {
      return `Tool error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }
}

// ─── Agent Loop ─────────────────────────────────────

export interface AgentResult {
  text: string;
  toolRounds: number;
}

/**
 * 执行一次完整的 Agent 对话
 *
 * 1. 构建消息：系统提示词 + 上下文 + 历史 + 用户输入
 * 2. 调用 AI
 * 3. 处理响应：文本 → 返回；工具调用 → 执行 → 回到步骤 2
 *
 * @param userInput - 用户输入
 * @param history - 之前的对话历史
 * @param config - Agent 配置
 * @param onToolCall - 工具调用回调（用于 UI 展示）
 * @param onText - 流式文本回调
 */
export async function agentLoop(
  userInput: string,
  history: Message[],
  config: AgentConfig,
  onToolCall?: (name: string, params: Record<string, unknown>) => void,
  onText?: (text: string) => void
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt(config.context);
  const maxRounds = config.maxRounds || MAX_TOOL_ROUNDS;

  // 构建消息列表
  const messages: Message[] = [
    ...history,
    { role: "user", content: userInput },
  ];

  let toolRounds = 0;

  while (toolRounds < maxRounds) {
    const response = await callAnthropic(
      messages,
      systemPrompt,
      config.tools,
      config.provider
    );

    // 文本响应 → 返回给用户
    if (response.type === "text") {
      if (response.text && onText) {
        onText(response.text);
      }
      return {
        text: response.text || "",
        toolRounds,
      };
    }

    // 工具调用 → 执行 → 继续循环
    if (response.type === "tool_use" && response.tool_uses) {
      // 构建 assistant 消息（包含 tool_use blocks）
      const assistantContent: MessageContent[] = [];

      // 如果有文本也加上
      if (response.text) {
        assistantContent.push({ type: "text", text: response.text });
      }

      const toolResults: MessageContent[] = [];

      for (const tool of response.tool_uses) {
        if (onToolCall) {
          onToolCall(tool.name, tool.input);
        }

        // 执行工具
        const result = await config.registry.execute(tool.name, tool.input);
        toolRounds++;

        assistantContent.push({
          type: "tool_use",
          id: tool.id,
          name: tool.name,
          input: tool.input,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: result,
        });
      }

      // 添加 assistant 消息
      messages.push({ role: "assistant", content: assistantContent });

      // 添加 tool_result 消息
      messages.push({ role: "user", content: toolResults });
    }
  }

  return {
    text: `已达到最大工具调用轮数 (${maxRounds})。请简化你的请求。`,
    toolRounds,
  };
}
