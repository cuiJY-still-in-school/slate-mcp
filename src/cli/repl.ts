/**
 * 石板 Vibecoding REPL — 照抄 Claude Code 交互体验
 *
 * 启动: slate
 * 退出: /exit, /quit, Ctrl+C, Ctrl+D
 */

import * as readline from "node:readline";
import { type Message, type ToolDefinition } from "../agent/provider.js";
import { agentLoop, ToolRegistry, type AgentConfig } from "../agent/loop.js";
import { generateContext, readAllProtocolFiles } from "../protocol/index.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import chalk from "chalk";

// ─── 工具实现 ───────────────────────────────────────

function createTools(registry: ToolRegistry): void {
  // read
  registry.register("read", async (params) => {
    const filePath = params.file_path as string;
    try {
      return readFileSync(filePath, "utf-8");
    } catch (e) {
      return `Error reading ${filePath}: ${e instanceof Error ? e.message : String(e)}`;
    }
  });

  // write
  registry.register("write", async (params) => {
    const filePath = params.file_path as string;
    const content = params.content as string;
    try {
      writeFileSync(filePath, content, "utf-8");
      return `Wrote ${filePath}`;
    } catch (e) {
      return `Error writing ${filePath}: ${e instanceof Error ? e.message : String(e)}`;
    }
  });

  // exec
  registry.register("exec", async (params) => {
    const command = params.command as string;
    try {
      const result = execSync(command, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60000,
        cwd: process.cwd(),
      });
      return result || "(executed successfully, no output)";
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return `Exit code: error\nstdout: ${err.stdout || ""}\nstderr: ${err.stderr || err.message || ""}`;
    }
  });

  // grep
  registry.register("grep", async (params) => {
    const pattern = params.pattern as string;
    const dir = (params.dir as string) || ".";
    try {
      const result = execSync(`grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md" "${pattern}" "${dir}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
        cwd: process.cwd(),
      });
      return result || "No matches found";
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      if (err.stdout) return err.stdout;
      return "No matches found";
    }
  });
}

// ─── 工具定义（传给 AI）─────────────────────────────

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "read",
      description: "Read a file from the local filesystem. Returns file content as text.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to read" },
        },
        required: ["file_path"],
      },
    },
    {
      name: "write",
      description: "Write content to a file. Overwrites existing files. Use for creating or updating files.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: { type: "string", description: "Absolute path to write to" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["file_path", "content"],
      },
    },
    {
      name: "exec",
      description: "Execute a shell command. Returns stdout and stderr. Use for running builds, tests, git commands, installing packages.",
      input_schema: {
        type: "object" as const,
        properties: {
          command: { type: "string", description: "The shell command to execute" },
        },
        required: ["command"],
      },
    },
    {
      name: "grep",
      description: "Search for a pattern in files. Returns matching lines with file paths and line numbers.",
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: { type: "string", description: "Pattern to search for" },
          dir: { type: "string", description: "Directory to search in (default: current)" },
        },
        required: ["pattern"],
      },
    },
  ];
}

// ─── REPL ───────────────────────────────────────────

export async function startRepl(config: AgentConfig): Promise<void> {
  const cwd = process.cwd();
  const protocolContext = generateContext(cwd);

  // 更新 agent 上下文
  config.context = protocolContext;

  // 注册内置工具
  createTools(config.registry);

  console.log(chalk.bold.blue("🪨 石板 (Slate) v0.1 — Vibecoding 终端"));
  console.log(chalk.gray(`   工作目录: ${cwd}`));

  if (protocolContext && !protocolContext.includes("未初始化")) {
    console.log(chalk.gray(`   ${protocolContext.split("\n")[0]}`));
  }

  console.log(chalk.gray("   输入 /help 查看帮助，/exit 退出\n"));

  const history: Message[] = [];
  let promptCount = 0;

  // Build tool definitions for AI
  const toolDefs = [
    ...getToolDefinitions(),
    // Slate protocol tools are available via the shared tool implementations
    // imported from src/tools/
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green("slate> "),
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // 斜杠命令
    if (input.startsWith("/")) {
      handleSlashCommand(input, rl, history);
      rl.prompt();
      return;
    }

    promptCount++;
    console.log(""); // 空行分隔

    try {
      const agentConfig: AgentConfig = {
        ...config,
        tools: toolDefs,
        context: generateContext(cwd),
      };

      const result = await agentLoop(
        input,
        history,
        agentConfig,
        (name, params) => {
          // 工具调用通知
          const shortParams = JSON.stringify(params).slice(0, 80);
          console.log(chalk.yellow(`  ⚙ ${name} ${shortParams}`));
        },
        (text) => {
          // 流式文本输出（简化：一次性输出）
        }
      );

      // 输出结果
      console.log(chalk.white(result.text));
      if (result.toolRounds > 0) {
        console.log(chalk.gray(`  (${result.toolRounds} 次工具调用)`));
      }

      // 更新历史
      history.push({ role: "user", content: input });
      history.push({ role: "assistant", content: result.text });

      // 限制历史长度（保留最近 50 轮）
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }
    } catch (e) {
      console.log(chalk.red(`❌ ${e instanceof Error ? e.message : String(e)}`));
    }

    console.log("");
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(chalk.gray("\n再见 👋"));
    process.exit(0);
  });
}

function handleSlashCommand(
  input: string,
  rl: readline.Interface,
  history: Message[]
): void {
  const [cmd, ...args] = input.slice(1).split(/\s+/);

  switch (cmd) {
    case "exit":
    case "quit":
      console.log(chalk.gray("再见 👋"));
      process.exit(0);
      break;
    case "help":
      console.log(`
${chalk.bold("石板 Vibecoding 命令:")}
  ${chalk.green("/help")}      显示帮助
  ${chalk.green("/exit")}      退出
  ${chalk.green("/clear")}     清除对话历史
  ${chalk.green("/context")}   显示当前协议上下文
  ${chalk.green("/tools")}     列出可用工具
  ${chalk.green("直接输入")}    与 AI 对话
`);
      break;
    case "clear":
      history.length = 0;
      console.log(chalk.gray("对话历史已清除"));
      break;
    case "context":
      const ctx = generateContext(process.cwd());
      console.log(ctx || chalk.gray("（当前项目未初始化石板协议）"));
      break;
    case "tools":
      console.log(`
${chalk.bold("可用工具:")}
  read    — 读取文件
  write   — 写入文件
  exec    — 执行命令
  grep    — 搜索代码
  slate_search  — 全球搜索意图/地基
  slate_read    — 读取协议文件
  slate_write   — 写入协议文件
  slate_claim   — 认领意图
  slate_publish — 发布意图/地基
`);
      break;
    default:
      console.log(chalk.gray(`未知命令: /${cmd}。输入 /help 查看帮助。`));
  }
}
