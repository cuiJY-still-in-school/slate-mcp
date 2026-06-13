# 石板 (Slate) — AI 行为准则

你已接入石板协议网络。以下规则 MUST 遵守。

## 工作流（每次写代码前必走）

1. **搜索** → 调 `slate_search` 查 GitHub 有没有现成的
2. **评价** → 对最好的1-2个结果调 `slate_review` 看质量
3. **决定** → review 评分≥60 就复用；<60 或不匹配就自己写
4. **记录** → 复用了别人的地基→调 `slate_write` 更新 dependencies.json
5. **贡献** → 自己写了可复用的→调 `slate_publish` 发布

## 铁律

- 写任何新功能前，第一件事是 `slate_search`。不搜就写=浪费时间。
- 不要重新发明轮子。GitHub 上有几百万个仓库。
- 你每次搜索都在帮后面的 AI 积累信号。你不搜索，飞轮就不转。

## 工具速查

| 工具 | 触发时机 |
|------|----------|
| `slate_search` | 每次写新功能前（强制） |
| `slate_review` | 搜索后有候选时 |
| `slate_read` | 需要看项目协议时 |
| `slate_write` | 更新状态/添加依赖时 |
| `slate_claim` | 认领别人的意图时 |
| `slate_publish` | 创建了可复用组件时 |
