# 发布到插件市场

这份文件是操作手册，不需要提交进 npm 包（`files` 没列它）。

## 0. 前置（只做一次）

1. **建公开仓库**（仓库名建议 `dsh-session-markdown-export`）：

   ```powershell
   cd C:\Users\11203\Documents\deepseek-harness\default-workspace\dsh-session-markdown-export
   git remote add origin https://github.com/Hzl0929/dsh-session-markdown-export.git
   git push -u origin main
   ```

2. 在仓库页面加上 **`dsh-plugin`** topic（About 右侧齿轮 → Topics）。
3. 等仓库**满 1 天**再提收录 PR —— 精选目录的 CI 会拒绝刚建几分钟的仓库。
4. 注册 npm 账号（`npm adduser`），用户名建议与 GitHub 一致，邮箱已写在 `author` 里。

## 1. 发布 npm

```powershell
npm pack --dry-run        # 确认 index.js / client.js / lib / locale / cordis.patch.yml 都在包里
npm publish               # 名字已被占用时改用 @hzl0929/dsh-session-markdown-export（见下）
npm view dsh-session-markdown-export version
```

目前 `dsh-session-markdown-export` 在 npm 上未被占用（`npm view` 返回 404），可以直接用短名。

**如果以后要迁到 scope**：把 `package.json` 的 `name` 改成 `@hzl0929/dsh-session-markdown-export`，`npm publish --access public`；市场索引和目录条目里的 `name` 也要同步。scope 就是 npm 上一块属于你的命名空间。

验证安装（建议新开一个临时 profile，别动日常的 desktop）：

```powershell
dsh plugin --profile test add dsh-session-markdown-export@1.0.1
```

## 2. 收录进精选目录（dshmarket 与索引都会出现）

市场本身没有"提交入口"，`dshmarket`（你已装）和 `realguan/dsh-plugin-market` 这份索引都读 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的目录，所以：

1. Fork 该仓库，新建一个文件 `data/plugins/Hzl0929__dsh-session-markdown-export.yml`。
2. 内容直接用 [`market/catalog-entry.yml`](market/catalog-entry.yml)（`url` 必须与仓库地址完全一致）。
3. 提 PR，标题类似 `Add Hzl0929/dsh-session-markdown-export`。
4. 维护者合并后，dshmarket / 索引在下一次重建时出现（`realguan` 索引每天 03:17 UTC 重建）。

收录要求（详见仓库 `contributing.md`）：`dsh.bundle` 清单 ✅、真实代码 ✅、仓库公开且活跃 ✅、描述不含营销词且与代码相符 ✅。分类用 `session`。

## 3. 可选：自己托管一份索引（即时生效，无需审核）

```powershell
node scripts/build-index.mjs      # 生成 market/index.json（发布后重跑一次可拿到真实 npm 时间）
git add market && git commit -m "chore: refresh market index" && git push
```

在 GitHub 仓库 Settings → Pages 里选 `main` / `(root)` 发布，索引 URL 就是：

```
https://hzl0929.github.io/dsh-session-markdown-export/market/index.json
```

使用者在 **插件 → 发现 → 添加索引源** 里粘贴这个 URL 即可看到并安装（需要先在「实验性插件」里打开**自定义插件索引**）。

## 4. 发新版本

```powershell
# 1) 改 package.json 的 version，例如 1.0.2
npm publish
# 2) 如果托管了自建索引，刷新它
node scripts/build-index.mjs
git add market && git commit -m "chore: release 1.0.2" && git push
```

## 5. 把本机从本地链接切到 npm 版

现在 profile 里装的是 `link:C:\Users\...\dsh-session-markdown-export`，发布后应换成正式版本，否则本机永远是本地代码：

```powershell
dsh plugin --profile desktop remove dsh-session-markdown-export
dsh plugin --profile desktop add dsh-session-markdown-export@1.0.1
```

（终端里没有 `dsh` 命令时，用桌面端的插件页卸载再装一次。）

## 检查清单

- [ ] `package.json`：无 `private`、有 `license` / `repository` / `homepage` / `engines.dsh` / `dsh.bundle`
- [ ] `npm pack --dry-run` 内容正确
- [ ] `cordis.patch.yml` 与 `dsh.bundle.patch` 指向一致
- [ ] README 写清安装命令与功能，LICENSE 存在
- [ ] GitHub 仓库公开、带 `dsh-plugin` topic、创建满 1 天
- [ ] `npm publish` 成功，`npm view` 能查到版本
- [ ] 临时 profile 里 `dsh plugin add` 安装成功
- [ ] 精选目录 PR 的 `url` / `name` / `category` / `description` 正确
