/**
 * GitHub API 层
 *
 * 全球石板网络的所有搜索、读取、写入都走这一层。
 * Token 获取委托给 auth 模块（石板登录 > 环境变量 > gh CLI）。
 */

import { execSync } from "node:child_process";
import { getToken } from "../auth/index.js";

// ─── 凭据 ───────────────────────────────────────────

/** 获取 GitHub 认证 token（委托给 auth 模块） */
export async function getGitHubToken(): Promise<string | null> {
  return getToken();
}

/** 获取当前 GitHub 用户名 */
export async function getGitHubUsername(): Promise<string | null> {
  try {
    const apiResult = await githubApi("/user");
    return (apiResult?.login as string) || null;
  } catch {
    try {
      // fallback: gh CLI
      const user = execSync("gh api user --jq .login", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      }).trim();
      return user || null;
    } catch {
      return null;
    }
  }
}

// ─── REST API ───────────────────────────────────────

const GITHUB_API = "https://api.github.com";

/** 调 GitHub REST API（自动带认证） */
async function githubApi(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<Record<string, unknown> | null> {
  const token = await getGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "slate-protocol/0.1",
    ...opts.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const init: RequestInit = { method: opts.method || "GET", headers };
  if (opts.body) {
    init.body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ─── 搜索 ───────────────────────────────────────────

export interface SearchResult {
  repo: string;       // "owner/name" or npm package name
  owner: string;
  name: string;
  description: string;
  stars: number;
  type: "intention" | "foundation";
  source: "github" | "npm";
  url: string;
  updatedAt: string;
  // 质量信号
  openIssues?: number;
  license?: string;
  lastCommitAt?: string;
  npmDownloads?: number;
  qualityScore?: number;  // 0-100 composite
  suitableFor?: string[];  // 适合做什么——从issues/README/topics提炼
  painPoints?: string[];   // 不适合做什么——从issue抱怨中提炼
}

/**
 * 全球搜索——不限于石板协议，搜 GitHub + npm 的全部公开资源。
 *
 * 三大渠道：
 * 1. GitHub Repo Search — 匹配 name/description/readme/topics，按 stars 排序
 * 2. GitHub Code Search — 搜 .slate/ 协议文件，精确匹配（加权）
 * 3. npm Registry — 搜索 npm 包（description/keywords）
 *
 * 每个 GitHub 仓库和 npm 包本身就是"地基"——AI 自己会判断是否可复用。
 * .slate/ 协议文件是锦上添花的结构化元数据。
 */
export async function searchGlobal(
  query: string,
  _type: "intention" | "foundation" | "both" = "both",
  limit = 20
): Promise<SearchResult[]> {
  const results: Map<string, SearchResult> = new Map();

  const addResult = (r: SearchResult) => {
    if (!results.has(r.repo)) results.set(r.repo, r);
  };

  // 渠道1: GitHub Repo Search（主渠道——搜所有仓库，不设协议门槛）
  try {
    const data = await githubApi(
      `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=${Math.min(limit, 10)}`
    );
    const items = (data?.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      const itemTopics = (item.topics as string[]) || [];
      const hasSlate = itemTopics.some((t: string) => t.startsWith("slate-"));
      addResult({
        repo: item.full_name as string,
        owner: (item.owner as Record<string, string>)?.login || "",
        name: item.name as string,
        description: (item.description as string) || "",
        stars: (item.stargazers_count as number) || 0,
        source: "github",
        type: hasSlate ? (itemTopics.includes("slate-foundation") ? "foundation" : "intention") : "foundation",
        url: item.html_url as string,
        updatedAt: item.updated_at as string,
      });
    }
  } catch (e) { /* GitHub search 失败不影响其他渠道 */ }

  // 渠道2: GitHub Code Search — .slate/ 协议文件（加权补充）
  try {
    const q = `path:.slate/ ${query}`;
    const data = await githubApi(
      `/search/code?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 5)}`
    );
    const items = (data?.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      const repo = item.repository as Record<string, unknown> | undefined;
      if (!repo) continue;
      const fileName = (item.name as string) || "";
      addResult({
        repo: repo.full_name as string,
        owner: (repo.owner as Record<string, string>)?.login || "",
        name: repo.name as string,
        description: (repo.description as string) || "",
        stars: ((repo.stargazers_count as number) || 0) + 1000, // 协议文件加权
        source: "github",
        type: fileName.includes("intention") ? "intention" : "foundation",
        url: repo.html_url as string,
        updatedAt: repo.updated_at as string,
      });
    }
  } catch (e) { /* code search 失败不影响 */ }

  // 渠道3: npm Registry（搜所有包，不限 slate keywords）
  try {
    const npmUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
    const res = await fetch(npmUrl, { headers: { "User-Agent": "slate-protocol/0.1" } });
    if (res.ok) {
      const data = await res.json() as {
        objects?: Array<{
          package: { name: string; description?: string; version: string; date: string; links: { npm: string } };
          score: { final: number };
        }>;
      };
      for (const obj of data.objects || []) {
        const pkg = obj.package;
        const owner = pkg.name.startsWith("@") ? pkg.name.split("/")[0].slice(1) : "npm";
        addResult({
          repo: `npm:${pkg.name}`,
          owner,
          name: pkg.name,
          description: pkg.description || "",
          stars: Math.round(obj.score.final * 1000),
          type: "foundation",
          source: "npm",
          url: pkg.links.npm,
          updatedAt: pkg.date,
        });
      }
    }
  } catch (e) { /* npm 搜索失败不影响 */ }

  return [...results.values()].sort((a, b) => b.stars - a.stars).slice(0, limit);
}

// ─── 专有逻辑：适合做什么分析 ──────────────────────

/** 从 repo topics、README、最近 issues 提炼"适合做什么"和"痛点" */
export async function analyzeSuitability(result: SearchResult): Promise<SearchResult> {
  if (result.source !== "github") return result;

  const suitable: Set<string> = new Set();
  const pains: Set<string> = new Set();

  try {
    // 1. 从 topics 推断适用场景
    const repoData = await githubApi(`/repos/${result.repo}`);
    if (repoData) {
      const topics = (repoData.topics as string[]) || [];
      const desc = (repoData.description as string) || "";

      // topic → 中文场景映射
      const topicMap: Record<string, string> = {
        "payment": "支付集成", "stripe": "Stripe支付", "react": "React项目",
        "api": "API开发", "cli": "命令行工具", "ui": "界面组件",
        "database": "数据库", "auth": "认证授权", "testing": "自动化测试",
        "typescript": "TypeScript项目", "docker": "容器化部署", "aws": "AWS云服务",
        "ai": "AI/ML", "machine-learning": "机器学习", "css": "样式组件",
        "form": "表单处理", "button": "按钮组件", "table": "表格组件",
        "chart": "图表可视化", "markdown": "Markdown渲染", "pdf": "PDF生成",
        "email": "邮件处理", "queue": "消息队列", "cache": "缓存",
        "logging": "日志记录", "monitoring": "监控", "security": "安全",
        "ssr": "SSR服务端渲染", "static-site": "静态网站", "mobile": "移动端",
        "desktop": "桌面应用", "serverless": "Serverless", "webhook": "Webhook",
      };

      for (const topic of topics) {
        const mapped = topicMap[topic];
        if (mapped) suitable.add(mapped);
      }

      // 从 description 提取常见模式
      if (desc.match(/framework|library|sdk|toolkit/i)) suitable.add("快速集成");
      if (desc.match(/plugin|extension|middleware/i)) suitable.add("插件扩展");
      if (desc.match(/lightweight|minimal|simple/i)) suitable.add("轻量级项目");
      if (desc.match(/enterprise|production|scalable/i)) suitable.add("企业级应用");
    }

    // 2. 从最近 Issues 推断真实使用场景和痛点
    const issuesData = await githubApi(
      `/repos/${result.repo}/issues?state=all&sort=created&direction=desc&per_page=20`
    );
    const issues = Array.isArray(issuesData)
      ? issuesData as Array<{ title: string; body?: string; labels?: Array<{ name: string }> }>
      : [];

    const issueTexts = issues.map(i => `${i.title} ${i.body || ""}`).join(" ").toLowerCase();

    // issue 关键词 → 真实使用场景
    if (issueTexts.match(/\bpayment\b|\bstripe\b|\bcheckout\b/)) suitable.add("支付流程");
    if (issueTexts.match(/\bsubscription\b|\brecurring\b|\bbilling\b/)) suitable.add("订阅计费");
    if (issueTexts.match(/\bwebhook\b|\bcallback\b|\bevent\b/)) suitable.add("事件驱动");
    if (issueTexts.match(/\bform\b|\binput\b|\bvalidation\b/)) suitable.add("表单验证");
    if (issueTexts.match(/\bupload\b|\bdownload\b|\bfile\b/)) suitable.add("文件处理");
    if (issueTexts.match(/\bexport\b|\bimport\b|\bcsv\b|\bjson\b/)) suitable.add("数据导入导出");
    if (issueTexts.match(/\berror\b|\bexception\b|\bcrash\b/)) pains.add("错误处理需加强");
    if (issueTexts.match(/\btypescript\b|\btype\b|\binterface\b/)) suitable.add("TypeScript类型安全");
    if (issueTexts.match(/\bssr\b|\bnext\.?js\b|\bnuxt\b/)) suitable.add("Next.js/Nuxt SSR");
    if (issueTexts.match(/\b100\b|\blarge\b|\bslow\b|\bperformance\b|\bmemory\b/)) pains.add("大数据量场景可能性能不足");
    if (issueTexts.match(/\bwindows\b|\bedge\b|\bsafari\b|\bie\b/)) pains.add("跨平台兼容性注意");
    if (issueTexts.match(/\bdocumentation\b|\bdoc\b|\bexample\b|\bguide\b/))
      suitable.add("文档完善");
    else
      pains.add("文档可能缺乏");

    // 3. issues 的 label 分析
    const labels = issues.flatMap(i => (i.labels || []).map(l => l.name.toLowerCase()));
    if (labels.some(l => l.includes("bug"))) pains.add("有已知bug");
    if (labels.some(l => l.includes("enhancement") || l.includes("feature"))) suitable.add("活跃开发中");
    if (labels.some(l => l.includes("help wanted") || l.includes("good first issue"))) suitable.add("社区友好");

  } catch { /* best effort */ }

  result.suitableFor = [...suitable].slice(0, 5);
  result.painPoints = [...pains].slice(0, 3);
  return result;
}

// ─── 质量信号 ───────────────────────────────────────

/** 为搜索结果补充质量信号（GitHub issues、commit、npm 下载量） */
export async function enrichQuality(result: SearchResult): Promise<SearchResult> {
  try {
    if (result.source === "github") {
      const repoData = await githubApi(`/repos/${result.repo}`);
      if (repoData) {
        result.openIssues = repoData.open_issues_count as number;
        result.license = (repoData.license as { spdx_id?: string })?.spdx_id;
        result.lastCommitAt = repoData.pushed_at as string;
        // 质量评分: stars 信号 + 维护活跃度 + issue 健康度
        const stars = result.stars || 0;
        const issues = result.openIssues || 0;
        const pushedAt = result.lastCommitAt ? Date.parse(result.lastCommitAt) : 0;
        const daysSincePush = (Date.now() - pushedAt) / 86400000;
        const activityScore = Math.max(0, 100 - daysSincePush * 2); // 2个月内活跃=满分
        const issueScore = stars > 0 ? Math.max(0, 100 - (issues / stars) * 100) : 50;
        result.qualityScore = Math.round(stars > 1000 ? 80 + Math.min(20, stars / 500) :
          Math.round((activityScore * 0.5 + issueScore * 0.3 + Math.min(100, stars / 10) * 0.2)));
      }
    }
    if (result.source === "npm") {
      const pkgName = result.repo.replace("npm:", "");
      const npmData = await fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkgName)}`, {
        headers: { "User-Agent": "slate-protocol/0.1" },
      });
      if (npmData.ok) {
        const dl = await npmData.json() as { downloads?: number };
        result.npmDownloads = dl.downloads || 0;
        // npm 质量评分: 下载量为主
        const d = result.npmDownloads;
        result.qualityScore = Math.round(d > 1000000 ? 95 : d > 100000 ? 80 : d > 10000 ? 60 : d > 1000 ? 40 : 20);
        result.stars = result.npmDownloads; // 用下载量覆盖 stars
      }
    }
  } catch { /* enrichment is best-effort */ }
  // 专有逻辑：适合做什么分析
  return analyzeSuitability(result);
}

/** 获取仓库的 Issues + PR 活跃度摘要 */
export interface RepoActivity {
  openIssues: number;
  closedIssues: number;
  openPRs: number;
  recentIssueTitles: string[];
  healthLabel: "healthy" | "moderate" | "neglected" | "unknown";
}

export async function getRepoActivity(repo: string): Promise<RepoActivity | null> {
  try {
    // 并行获取 open/closed issues
    const [openData, closedData] = await Promise.all([
      githubApi(`/search/issues?q=repo:${repo}+type:issue+state:open&per_page=1`),
      githubApi(`/search/issues?q=repo:${repo}+type:issue+state:closed&per_page=1`),
    ]);
    const openIssues = (openData?.total_count as number) || 0;
    const closedIssues = (closedData?.total_count as number) || 0;

    // 最近的 issue 标题
    const recentData = await githubApi(`/repos/${repo}/issues?state=all&sort=updated&per_page=5`);
    const recentDataArr = recentData && !Array.isArray(recentData) ? (recentData as Record<string, unknown>).items : recentData;
    const recentItems = Array.isArray(recentDataArr) ? recentDataArr as Array<{ title: string; state: string; updated_at: string }> : [];
    const recentIssueTitles = (recentItems || []).map(i => i.title);

    // PRs
    const prData = await githubApi(`/search/issues?q=repo:${repo}+type:pr+state:open&per_page=1`);
    const openPRs = (prData?.total_count as number) || 0;

    // 健康度: issue 关闭率
    const total = openIssues + closedIssues;
    const closeRate = total > 0 ? closedIssues / total : 0;
    let healthLabel: RepoActivity["healthLabel"] = "unknown";
    if (total > 0) {
      if (closeRate > 0.7) healthLabel = "healthy";
      else if (closeRate > 0.3) healthLabel = "moderate";
      else healthLabel = "neglected";
    }

    return { openIssues, closedIssues, openPRs, recentIssueTitles, healthLabel };
  } catch {
    return null;
  }
}

// ─── 文件读取 ───────────────────────────────────────

/**
 * 从仓库读取 .slate/ 下的协议文件内容
 * 使用 GitHub Contents API，返回原始 JSON 文本
 */
export async function readProtocolFile(
  repo: string,
  file: "identity" | "intention" | "foundation" | "dependencies"
): Promise<string | null> {
  try {
    // 优先用 raw 路径（免 base64 解码）
    const rawUrl = `https://raw.githubusercontent.com/${repo}/refs/heads/main/.slate/${file}.json`;
    const res = await fetch(rawUrl, { headers: { "User-Agent": "slate-protocol/0.1" } });
    if (res.ok) {
      return await res.text();
    }
    // fallback: 试 master 分支
    const masterUrl = `https://raw.githubusercontent.com/${repo}/refs/heads/master/.slate/${file}.json`;
    const res2 = await fetch(masterUrl, { headers: { "User-Agent": "slate-protocol/0.1" } });
    if (res2.ok) {
      return await res2.text();
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Fork ──────────────────────────────────────────

/** Fork 一个仓库到当前用户 */
export async function forkRepo(repo: string): Promise<{ cloneUrl: string; owner: string } | null> {
  try {
    const result = execSync(
      `gh repo fork "${repo}" --clone=false --fork-name "${repo.split('/')[1]}" --json url,owner`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }
    );
    const parsed = JSON.parse(result.trim());
    return {
      cloneUrl: parsed.url || parsed.clone_url || `https://github.com/${parsed.owner?.login}/${repo.split("/")[1]}`,
      owner: parsed.owner?.login || "",
    };
  } catch (e) {
    console.error("Fork failed:", e);
    return null;
  }
}

// ─── 导出 ───────────────────────────────────────────

export { githubApi };
