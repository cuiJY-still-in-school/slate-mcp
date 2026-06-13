/**
 * UserPromptSubmit Hook — 强制注入石板行为指令
 *
 * 每次用户发 prompt 前执行，让 AI 在写代码前自动使用 slate_search。
 */

import { readAllProtocolFiles } from "../protocol/index.js";

function main(): void {
  const cwd = process.cwd();
  const files = readAllProtocolFiles(cwd);

  const lines: string[] = [];

  // ⚠️ 核心指令：每次对话都注入，无论是否有 .slate/ 文件
  lines.push("🪨 [石板协议已激活]");
  lines.push("你有 slate_search / slate_review / slate_read / slate_write / slate_publish / slate_claim 工具。");
  lines.push("写任何新代码前，MUST 先调 slate_search 搜索 GitHub。不要重新发明轮子。");

  // 项目上下文
  if (files.identity) {
    lines.push("");
    lines.push(`项目: ${files.identity.type} (${files.identity.owner})`);
  }

  if (files.intention) {
    const i = files.intention;
    lines.push(`意图: ${i.summary} [${i.status}]`);
    if (i.status === "open") lines.push("⚠️ 这个意图还未完成，你被期望实现它。");
  }

  if (files.foundation) {
    const f = files.foundation;
    lines.push(`地基: ${f.name} v${f.version}`);
  }

  if (files.dependencies?.dependencies?.length) {
    lines.push("已依赖地基:");
    for (const d of files.dependencies.dependencies) {
      lines.push(`  ${d.foundation_repo}@${d.ref} — ${d.note}`);
    }
    lines.push("复用这些地基，不要重复实现。");
  }

  process.stdout.write(lines.join("\n"));
}

main();
