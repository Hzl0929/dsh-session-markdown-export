# dsh-session-markdown-export

在 DeepSeek Harness 侧栏的会话「⋯」菜单里加一项 **导出为 Markdown**，把任意一个会话导出成一份自包含、可折叠的 Markdown 文档。

Export one DSH session as a single foldable Markdown document from the sidebar session menu.

## 功能

- **一个会话一份文档**：front matter（会话 id、标题、创建/导出时间、工作目录、智能体预设、模型）+ 摘要 + 按轮次分节。
- **可折叠**：思考过程、工具调用与结果收进 `<details>`，正文保持清爽；也可以关掉折叠输出纯文本。
- **冷热一致**：通过 `sessionQuery` 直接读日志，运行中、已结束、已归档的会话导出结果一致。
- **上下文感知**：按当前模型 surface 导出，被压缩/替换掉的旧事件不会重复出现。
- **本地时区**：时间戳按浏览器所在时区渲染，可用 `tz` 覆盖。
- **双语**：界面文案跟随 DSH 语言，文档语言可单独指定。

## 安装

```sh
dsh plugin --profile <profile> add dsh-session-markdown-export
```

或从源码安装：

```sh
dsh plugin --profile <profile> add "git+https://github.com/Hzl0929/dsh-session-markdown-export.git#<commit>"
```

装好后重启 profile（或刷新 Web 页面）即可在会话菜单里看到。

## 使用

1. 侧栏找到目标会话，点「⋯」。
2. 选择 **导出为 Markdown**。
3. 浏览器下载 `<标题>_<时间>_<会话短 id>.md`。

## 导出内容

```
---
session: session-...
title: 会话标题
created: 2026-11-19T07:30:00+08:00
exported: 2026-11-19T08:12:00+08:00
cwd: C:\...
preset: standard
models: deepseek-flash
---
# 会话标题
> 12 轮对话 · 34 条消息 · 57 次工具调用 ...
## 第 1 轮
**用户** ...
**助手** ...
<details><summary>思考</summary> ... </details>
<details><summary>工具调用 read_file</summary> ... </details>
```

## 可选参数

下载路由接受查询参数，便于脚本化导出：

| 参数 | 取值 | 默认 |
|---|---|---|
| `lang` | `zh` / `en` | `zh` |
| `tz` | IANA 时区 | 浏览器时区 |
| `tools` | `names` / `details` / `off` | `names` |
| `tool` | 工具结果截断字符数 | `1500` |
| `args` | 工具参数截断字符数 | `1200` |
| `folding` | `details` / `plain` | `details` |
| `system` | `1` / `0` 是否含系统提示 | `0` |
| `usage` | `1` / `0` 是否含用量 | `1` |
| `fm` | `1` / `0` 是否含 front matter | `1` |

## 兼容性

- DSH `>=0.2.1`（`engines.dsh`）。
- 导出路由为 `/api/session.markdown-export`，与 DSH 0.2.2 起内置的 `/api/session.markdown`（`@deepseek-ai/dsh-session-log-export`）分开，两者可共存。
- Host 半依赖 `connection`、`sessionQuery`；Client 半注册在 `sidebar.workspaces.session.menu.item` 与 `shell.overlay`。

## 隐私

插件不联网：只在 Host 内读取本机会话日志并返回给当前页面。没有遥测，没有外部请求。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host：注册认证下载路由 `/api/session.markdown-export` |
| `client.js` | Client：会话菜单项 + 失败提示 |
| `lib/render.js` | 纯函数渲染器（无 Cordis / Node / 浏览器依赖） |
| `cordis.patch.yml` | bundle 的 loader 行 |

## License

MIT
