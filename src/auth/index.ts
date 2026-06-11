/**
 * 石板登录系统
 *
 * GitHub OAuth 设备流 + PAT 回退。
 * Token 存储在 ~/.slate/auth.json
 *
 * 用法:
 *   slate login       → GitHub 设备流登录
 *   slate login --token <pat> → 直接用 Personal Access Token
 *   slate logout      → 清除登录
 *   slate whoami      → 显示当前登录用户
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ─── 配置 ───────────────────────────────────────────

const SLATE_DIR = join(homedir(), ".slate");
const AUTH_FILE = join(SLATE_DIR, "auth.json");

// GitHub OAuth App 配置
// 实际部署时需要替换为注册的 OAuth App client_id
// 用户可通过 SLATE_CLIENT_ID 环境变量覆盖
const GITHUB_CLIENT_ID = process.env.SLATE_CLIENT_ID || "Iv1.slate-placeholder";

interface AuthData {
  token: string;
  user: string;
  loginAt: string;
  method: "device_flow" | "pat" | "gh_cli";
}

// ─── 存储 ───────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(SLATE_DIR)) {
    mkdirSync(SLATE_DIR, { recursive: true });
  }
}

export function loadAuth(): AuthData | null {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    const raw = readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData): void {
  ensureDir();
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
  // 设置权限为仅 owner 可读写
  try {
    const { chmodSync } = require("node:fs");
    chmodSync(AUTH_FILE, 0o600);
  } catch { /* best effort */ }
}

export function clearAuth(): void {
  if (existsSync(AUTH_FILE)) {
    const { unlinkSync } = require("node:fs");
    unlinkSync(AUTH_FILE);
  }
}

// ─── Token 获取（分层回退）───────────────────────────

/**
 * 获取当前可用的 GitHub token
 *
 * 优先级：
 * 1. 石板登录 token (~/.slate/auth.json)
 * 2. 环境变量 GITHUB_TOKEN / GH_TOKEN
 * 3. gh CLI (gh auth token)
 */
export async function getToken(): Promise<string | null> {
  // 1. 石板自己的登录
  const auth = loadAuth();
  if (auth?.token) {
    // 验证 token 是否还有效
    if (await validateToken(auth.token)) {
      return auth.token;
    }
    // Token 失效，清除
    clearAuth();
  }

  // 2. 环境变量
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) return envToken;

  // 3. gh CLI
  try {
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    if (token) return token;
  } catch {
    // gh CLI 不可用
  }

  return null;
}

// ─── Token 验证 ─────────────────────────────────────

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "slate-protocol/0.1",
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchUser(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "slate-protocol/0.1",
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { login: string };
    return data.login || null;
  } catch {
    return null;
  }
}

// ─── 设备流登录 ─────────────────────────────────────

/**
 * GitHub OAuth 设备流
 *
 * 流程：
 * 1. POST https://github.com/login/device/code → 获取 user_code + verification_uri + device_code
 * 2. 用户打开浏览器访问 verification_uri，输入 user_code
 * 3. 轮询 POST https://github.com/login/oauth/access_token 直到授权完成
 * 4. 保存 access_token
 */
export async function deviceFlowLogin(): Promise<AuthData | null> {
  // Step 1: 请求设备码
  const deviceRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "slate-protocol/0.1",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: "repo,read:user,user:email",
    }),
  });

  if (!deviceRes.ok) {
    const err = await deviceRes.json() as { error_description?: string };
    throw new Error(
      `设备流初始化失败: ${err.error_description || deviceRes.statusText}\n` +
      `提示: 设置 SLATE_CLIENT_ID 环境变量为你注册的 GitHub OAuth App client_id\n` +
      `或使用 PAT 登录: slate login --token <personal-access-token>`
    );
  }

  const device = await deviceRes.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  // Step 2: 引导用户
  console.log(`
┌─────────────────────────────────────────────────┐
│  🔐 石板 — GitHub 登录                          │
│                                                 │
│  1. 打开浏览器: ${device.verification_uri}        │
│  2. 输入验证码: ${device.user_code}               │
│                                                 │
│  等待授权中...                                   │
└─────────────────────────────────────────────────┘
`);

  // Step 3: 轮询
  const startTime = Date.now();
  const expiresIn = device.expires_in * 1000;
  const interval = device.interval * 1000;

  while (Date.now() - startTime < expiresIn) {
    await sleep(interval);

    const tokenRes = await fetch(
      `https://github.com/login/oauth/access_token`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "slate-protocol/0.1",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }
    );

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.access_token) {
      const user = await fetchUser(tokenData.access_token);
      if (!user) {
        console.log("❌ 获取用户信息失败");
        return null;
      }

      const auth: AuthData = {
        token: tokenData.access_token,
        user,
        loginAt: new Date().toISOString(),
        method: "device_flow",
      };
      saveAuth(auth);
      console.log(`✅ 已登录 GitHub 账号: ${user}`);
      return auth;
    }

    if (tokenData.error === "authorization_pending") {
      continue; // 用户还没授权，继续等待
    }

    if (tokenData.error === "slow_down") {
      await sleep(interval * 2); // 服务端要求减速
      continue;
    }

    // 其他错误
    if (tokenData.error !== "authorization_pending") {
      throw new Error(`授权失败: ${tokenData.error}`);
    }
  }

  console.log("⏰ 授权超时，请重新运行 slate login");
  return null;
}

// ─── PAT 登录 ──────────────────────────────────────

/**
 * 用 Personal Access Token 直接登录
 */
export async function patLogin(token: string): Promise<AuthData | null> {
  console.log("验证 token...");
  const user = await fetchUser(token);
  if (!user) {
    console.log("❌ Token 无效，请检查后重试");
    return null;
  }

  const auth: AuthData = {
    token,
    user,
    loginAt: new Date().toISOString(),
    method: "pat",
  };
  saveAuth(auth);
  console.log(`✅ 已登录 GitHub 账号: ${user}`);
  return auth;
}

// ─── 退出登录 ──────────────────────────────────────

export function logout(): void {
  const auth = loadAuth();
  if (auth) {
    clearAuth();
    console.log(`✅ 已退出 GitHub 账号: ${auth.user}`);
  } else {
    console.log("未登录");
  }
}

// ─── 查看当前用户 ──────────────────────────────────

export async function whoami(): Promise<void> {
  const auth = loadAuth();
  if (!auth) {
    console.log("未登录。运行 slate login 登录。");
    return;
  }

  const valid = await validateToken(auth.token);
  if (!valid) {
    console.log(`⚠️ Token 已失效（上次登录: ${auth.loginAt}）`);
    console.log("运行 slate login 重新登录。");
    clearAuth();
    return;
  }

  console.log(`👤 ${auth.user}`);
  console.log(`   登录方式: ${auth.method}`);
  console.log(`   登录时间: ${auth.loginAt}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
