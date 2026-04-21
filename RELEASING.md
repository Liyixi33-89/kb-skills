# 📦 kb-skills 版本发布流程（RELEASING）

> 本文档是 `@kb-skills/*` 系列 npm 包的**权威发版指南**，每次发新版本请严格按顺序执行。
>
> - 包管理器：`pnpm 9.15.0`（严格遵守 `packageManager` 字段）
> - 版本工具：[Changesets](https://github.com/changesets/changesets)
> - 语义化版本：[SemVer](https://semver.org/lang/zh-CN/)
> - 默认分支：`main`
> - 所有包：`access: public`

---

## 🗺️ TL;DR — 发版 60 秒速查卡

```powershell
# ① 开发阶段（每个 PR 带一个）
pnpm changeset                                  # 交互式勾选包 + 选择 bump 类型

# ② 发版日（本地手动发，推荐）
pnpm version:packages                           # 消费 changeset → bump 版本 + 写 CHANGELOG
pnpm typecheck && pnpm test && pnpm build       # 三连校验
pnpm release:npm:dry                            # 预演发布（不会真传）
git add . && git commit -m "chore(release): version packages"
git tag v<版本号>                                # 例：git tag v0.1.0（取 bump 后最大版本）
pnpm release:npm --otp=<6位验证码>               # 真发！OTP 必须在 30 秒内输完
git push origin main --tags
```

> **不想手动？** 推 `.changeset/*.md` 到 `main` 分支后，CI 会自动开 "Version Packages" PR；
> 合并该 PR 后，CI 会自动发布到 npm（详见 [§6 方式 B：CI 自动化发版](#6-方式-b--ci-自动化发版推荐)）。

---

## 1. 前置条件（一次性配置）

### 1.1 npm 账号与权限
- 必须加入 `@kb-skills` scope 的 maintainer 列表（当前发布者：`lyx-i`）
- 账号必须启用 **2FA**（auth-and-writes 级别）
- 本机执行 `npm whoami` 应返回你的用户名

### 1.2 npm 认证 token
有两种方式（任选其一）：

#### 方式 A — 交互式 OTP（推荐给个人偶尔发版）
不配置任何 token，每次发版时 npm 会提示输入 2FA 验证码。

#### 方式 B — Granular Access Token 带 `bypass-2fa`
适合 CI / 频繁发版。在 `https://www.npmjs.com/settings/<你的用户名>/tokens` 创建：
- Type：**Granular Access Token**
- Packages and scopes：勾选 `@kb-skills`
- **Allowed IP ranges**：可留空或填公司出口 IP
- **⚠️ 必须勾选**：`Allow this token to bypass my 2FA settings when publishing`

然后在**用户级**（不是仓库 `.npmrc`）写入 token：
```powershell
# Windows PowerShell
echo "//registry.npmjs.org/:_authToken=npm_你的token" | Out-File -Append -Encoding ascii $HOME\.npmrc
npm whoami   # 验证
```

> ⚠️ **绝对不要**把 token 写进仓库 `.npmrc`（已被 `.gitignore` 忽略也别写），永远放 `~/.npmrc`。

### 1.3 Git 配置
- 本地 `main` 分支必须与远端同步：`git fetch && git status` 应显示 `up to date`
- 没有未提交的改动：`git status` 应显示 clean
- 有 push 权限到 `Liyixi33-89/kb-skills`

### 1.4 CI Secrets（仅 CI 自动发版需要）
在仓库 `Settings → Secrets and variables → Actions` 配置：
- `NPM_TOKEN`：同上 1.2 方式 B 创建的 token

---

## 2. 版本号策略（SemVer 速查）

| 改动类型 | 示例 | bump |
|---|---|---|
| 🐞 修复 bug、不影响 API | 修复 `stack-detector` 误判 vue3 为 vue2 | **patch**（0.1.0 → 0.1.1） |
| ✨ 新增能力、向后兼容 | 新增 Prisma/MySQL 支持、新增 skill | **minor**（0.1.0 → 0.2.0） |
| 💥 破坏性变更 | 删除/重命名公共 API、改签名 | **major**（0.1.0 → 1.0.0） |

### 特别约定
- **0.x.x 阶段**：minor 也视为可能破坏；发到 1.0.0 之前，API 不做强承诺
- **updateInternalDependencies: patch**：当 `core` bump 时，依赖它的 `adapter-*` / `cli` 会**自动 patch**
  - 也就是说：**只有你真正改了某个包的源码，才需要给它写 changeset**
  - 上游被动 patch 是 Changesets 自动做的，无需手工处理

---

## 3. 开发阶段 — 写 Changeset

### 3.1 什么时候写
**原则**：每个含有"用户可感知变更"的 PR，都必须附带一个 `.changeset/*.md`。

**不需要**写 changeset 的 PR：
- 纯文档（README、注释）
- 纯测试
- CI 配置
- 依赖锁文件更新

### 3.2 怎么写

```powershell
pnpm changeset
```

会进入交互式问答：

1. **Which packages would you like to include?**
   - 用空格勾选**被直接修改的包**（不要勾被动 patch 的下游，它们会自动处理）
2. **Which packages should have a major bump?** → 勾选有破坏性变更的包
3. **Which packages should have a minor bump?** → 勾选新增功能的包
4. 剩下未勾的包默认 **patch**
5. **Please enter a summary** → 一句话描述（这句会进 CHANGELOG 标题）

完成后会在 `.changeset/` 下生成一个随机文件名的 md，手动编辑补充详细内容：

```markdown
---
"@kb-skills/core": minor
"@kb-skills/adapter-koa": minor
---

Added Prisma / MySQL support.

**`@kb-skills/core`**
- 新增 `OrmKind` 类型。
- 新增 `ModelField` 统一字段描述。

**`@kb-skills/adapter-koa`**
- `scanServer` 自动识别 Prisma schema。
```

> 💡 **命名建议**：不使用自动随机名，改为语义文件名更好追溯：
> `.changeset/add-prisma-mysql-support.md` / `.changeset/fix-stack-detector-vue3.md`

### 3.3 提交
```powershell
git add .changeset/<文件名>.md
git commit -m "feat(adapter-koa): add prisma/mysql support"
git push
```
走 PR → review → merge 到 `main`。

---

## 4. 发版阶段 — 方式 A：本地手动发版

> 适用场景：你是当前 maintainer、在本机有 token/OTP、想要完全掌控。

### Step 1 / 8 — 同步最新 main
```powershell
git checkout main
git pull origin main
git status           # 必须 clean
```

### Step 2 / 8 — 预检三连（阻断式）
```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```
任意一项失败 → **停止**，修复后重来。

### Step 3 / 8 — 消费 changeset，生成新版本号
```powershell
pnpm version:packages
```
这一步会：
- 删除 `.changeset/*.md`（除了 `config.json`）
- 修改所有受影响包的 `package.json` 里的 `version`
- 更新每个变更包的 `CHANGELOG.md`

### Step 4 / 8 — 人工复核
打开以下文件，**逐一确认**：
```powershell
# 确认版本号全部符合预期
cat packages/core/package.json            | Select-String version
cat packages/cli/package.json             | Select-String version
cat packages/adapter-koa/package.json     | Select-String version
cat packages/adapter-express/package.json | Select-String version
cat packages/adapter-react/package.json   | Select-String version

# 确认 CHANGELOG 条目已生成
cat packages/core/CHANGELOG.md            | Select-Object -First 20
```

### Step 5 / 8 — Dry-run 预演
```powershell
pnpm release:npm:dry
```
输出应包含每个包的 `Tarball Contents` 和 `+ @kb-skills/<pkg>@<version>`（带 `dry-run` 标记）。

**❗ 若 dry-run 报错**：参考 [§8 FAQ](#8-faq--历史踩坑速查) 修复后重来。

### Step 6 / 8 — 提交 & 打 tag
```powershell
git add .
git commit -m "chore(release): version packages"

# 选"带头包"的新版本号做 git tag（通常选版本号最大的那个，例如 cli）
git tag v0.1.0      # ← 替换为实际版本
```

### Step 7 / 8 — 真发布到 npm
```powershell
# 如果你的 token 带 bypass-2fa：
pnpm release:npm

# 否则：打开 npm 认证器 app，等新 OTP 刷出来的瞬间立即执行
pnpm release:npm --otp=<6位验证码>
```

**⚠️ 关键注意**：
- OTP 有效期通常只有 **30 秒**，从生成到执行命令要快
- 如果过程中有任何一个包发布失败（已发一半卡住），**不要**直接重跑 —— 先去 [npmjs.com](https://www.npmjs.com/~lyx-i) 确认哪些已发、哪些没发，只对没发的包手动 `pnpm --filter @kb-skills/<pkg> publish --access public --otp=<新的OTP>`

### Step 8 / 8 — 推送 & 验证
```powershell
git push origin main --tags

# 在另一个目录验证
cd $env:TEMP
npm view @kb-skills/cli version          # 应该返回刚发的版本
npx @kb-skills/cli@latest --help         # 应该能正常执行
```

**🎉 发版完成！** 可以去 [GitHub Releases](https://github.com/Liyixi33-89/kb-skills/releases) 手工创建一条 release note（可选，但推荐）。

---

## 5. 发版阶段 — 方式 B：CI 自动化发版（推荐）

> 适用场景：只要 PR 带了 changeset，剩下的交给 CI。无需本机配 token/OTP。

### 流程图

```
你的 PR（带 .changeset/xxx.md）
        │ merge to main
        ▼
┌──────────────────────────────────┐
│ CI: .github/workflows/release.yml │
└──────────────────────────────────┘
        │
        ├─ 场景 ①：检测到有未消费的 changeset
        │         → 自动开/更新一个 PR："chore(release): version packages"
        │         → 你 review → merge 这个 PR
        │                     │
        │                     ▼
        └─ 场景 ②：main 上已无 changeset（刚 merge 了上面那个 PR）
                  → CI 自动跑 `pnpm release`（= build + changeset publish）
                  → tarball 自动发到 npm（用 NPM_TOKEN）
                  → 自动打 git tag 推送
```

### 你要做的事
1. 写代码 + 写 `pnpm changeset` → 推 PR → merge
2. 等 **几分钟**后，CI 会自动开一个 **Version Packages PR**
3. Review 这个 PR（它会展示 CHANGELOG diff、版本号 diff）
4. Merge 这个 PR
5. 再等几分钟，CI 自动发布完毕 ✅

### CI 不会做的事
- ❌ 不会自动写 release note 到 GitHub Releases（需手动去补）
- ❌ 不会跳过 `NPM_TOKEN` 校验失败（token 过期必须在仓库 Secrets 里更新）

---

## 6. 回滚预案

### 6.1 发现刚发的版本有严重 bug（< 72 小时）
```powershell
# ① 先 unpublish（npm 规定 72 小时内可 unpublish）
npm unpublish @kb-skills/<pkg>@<version> --otp=<6位验证码>

# ② 在本地回滚 git
git revert <release-commit-sha>
git push origin main

# ③ 删 tag
git tag -d v<version>
git push origin :refs/tags/v<version>
```

### 6.2 超过 72 小时只能 deprecate
```powershell
npm deprecate @kb-skills/<pkg>@<version> "Contains critical bug, please upgrade to <新版本>" --otp=<OTP>
```
用户安装该版本时会看到警告。然后**尽快**发一个修复版本。

### 6.3 本地发版中途失败（已发一半）
1. 打开 `https://www.npmjs.com/~lyx-i` 看哪些包发了哪些没发
2. 只对未发的包单独发：
   ```powershell
   pnpm --filter @kb-skills/<pkg> publish --access public --otp=<新OTP> --no-git-checks
   ```
3. **不要**重跑 `pnpm release:npm`（会对已发的包报 `EPUBLISHCONFLICT`）

---

## 7. 常见问题（FAQ）

### Q1 — `EPRIVATE: This package has been marked as private`
- 原因：某个包的 `package.json` 里写了 `"private": true`
- 解决：删除那一行。**生产包必须可发布**。

### Q2 — `E403 Forbidden: Two-factor authentication or granular access token with bypass 2fa enabled is required`
- 原因：账号开了 2FA 但发布时没带 OTP，且 token 不是 bypass-2fa
- 解决：二选一
  - 加 `--otp=<6位>`
  - 重新申请带 `bypass-2fa` 的 granular token

### Q3 — `EOTP: This operation requires a one-time password`
- 原因：OTP 过期（通常超过 30 秒）或输错
- 解决：等**下一个** OTP 刷出来的瞬间立即执行命令（别等了再复制粘贴）

### Q4 — `EPUBLISHCONFLICT: cannot publish over the previously published versions`
- 原因：这个版本号在 npm 上已经存在
- 解决：
  - 如果是误发 → 按 §6.1 unpublish
  - 如果是发了一半卡住 → 按 §6.3 只补发未成功的包

### Q5 — `changeset version` 什么也没改
- 原因：`.changeset/` 下除了 `config.json` 之外没有 md 文件
- 解决：先跑 `pnpm changeset` 创建一个

### Q6 — CI 的 Version Packages PR 为什么没自动开？
- 检查 `.changeset/` 下有没有未消费的 md 文件
- 检查 CI 日志，是不是 `NPM_TOKEN` / `GITHUB_TOKEN` 权限不足
- 检查 workflow 是不是只在 `main` 分支触发（`.github/workflows/release.yml` 里的 `branches: [main]`）

### Q7 — `pnpm release:npm` 卡在某个包无响应
- 通常是网络问题或 npm registry 抖动
- `Ctrl+C` 终止 → 按 §6.3 查漏补缺

### Q8 — `npm config set //registry.npmjs.org/:_authToke=xxx` 报错
- 拼写错误：`authToke` → 应为 `_authToken`（注意前面 `_`、结尾 `n`）
- 正确写法：直接手动编辑 `~/.npmrc` 追加一行

---

## 8. 附录

### A. 仓库脚本命令参考

| 命令 | 作用 |
|---|---|
| `pnpm changeset` | 交互式创建 changeset 文件 |
| `pnpm version:packages` | 消费 changeset → bump 版本 + 写 CHANGELOG |
| `pnpm release` | build + `changeset publish`（CI 用） |
| `pnpm release:npm` | build + pnpm 原生 publish（本地用，支持 `--otp`） |
| `pnpm release:npm:dry` | 同上但只预演、不真传 |
| `pnpm build` | 编译所有包到 `dist/` |
| `pnpm typecheck` | 全仓 `tsc -b` 类型检查 |
| `pnpm test` | 跑全部 vitest |

### B. 当前包版本关系（2026-04-21）

```
@kb-skills/core ───────┬─> @kb-skills/cli
                       ├─> @kb-skills/adapter-koa
                       ├─> @kb-skills/adapter-express
                       └─> @kb-skills/adapter-react
```

- `core` 是被依赖者；core bump 时下游 `adapter-*` / `cli` 会**自动 patch**（`updateInternalDependencies: patch`）
- 首次发布：**v0.0.1**（2026-04-20）
- 当前最新：参见各包 `CHANGELOG.md`

### C. Changeset 模板

创建 `.changeset/<语义化文件名>.md`：

```markdown
---
"@kb-skills/core": minor
"@kb-skills/adapter-koa": patch
---

一句话摘要（会进 CHANGELOG 顶部）。

**`@kb-skills/core`**
- 细节 1
- 细节 2

**`@kb-skills/adapter-koa`**
- 细节 1
```

### D. 相关配置文件索引

| 文件 | 作用 |
|---|---|
| `.changeset/config.json` | Changesets 全局配置（`access: public`、`baseBranch: main`） |
| `.github/workflows/release.yml` | CI 自动化发版流水线 |
| `.npmrc` | 仓库级 pnpm 配置（**不含** token） |
| `~/.npmrc` | 用户级 npm 认证（**放 token 的地方**） |
| `pnpm-workspace.yaml` | workspace 成员声明 |
| `package.json` | scripts: `release*` / `version:packages` |
| `CHANGELOG.md`（根） | 手工维护的**首次发布里程碑**（之后由子包 CHANGELOG 接管） |
| `packages/*/CHANGELOG.md` | Changesets 自动生成的子包变更日志 |

### E. 参考资料
- [Changesets 官方文档](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
- [SemVer 中文版](https://semver.org/lang/zh-CN/)
- [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- [pnpm publish 文档](https://pnpm.io/cli/publish)

---

> **最后一条建议**：每次发完版，花 2 分钟去 [GitHub Releases](https://github.com/Liyixi33-89/kb-skills/releases) 基于 tag 创建一条 Release note，贴上本次的 CHANGELOG 摘要。这对用户（和未来的你）非常友好。
