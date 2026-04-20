# {{PROJECT_NAME}} — 项目宪法

> 本文件是项目的"宪法"——所有 AI 代理和人类开发者在修改代码前都必须先阅读本文件。
>
> 如果修改涉及架构原则或边界，请同步更新本文件。

## 一、技术栈

- **后端**：{{BACKEND_TECH}}
- **前端**：{{FRONTEND_TECH}}
- **包管理**：{{PKG_MANAGER}}
- **Node**：>= 18.17

## 二、目录结构

```
{{DIRECTORY_TREE}}
```

## 三、架构原则

1. **分层清晰**：routes / services / models / components 职责分离，不得跨层直接调用。
2. **类型优先**：所有对外接口先写 TypeScript 类型，再写实现。
3. **单一入口**：每个子模块通过 `index.ts` 导出，避免深层 import。
4. **可测试**：关键业务逻辑必须可单元测试。

## 四、禁止事项

- ❌ 在组件内直接访问 DB / 发起跨域请求，必须通过 services 或 api 封装。
- ❌ 使用 `any` 绕过类型检查（除非有明确注释说明）。
- ❌ 在 routes 中写业务逻辑（应调用 services）。
- ❌ 向 `kb/` 目录手动写文件——由 `kb-skills run` 自动生成。

## 五、知识库使用

查看项目结构：
```bash
cat kb/{{KB_MODULE_SAMPLE}}/00_project_map.md
```

查询路由 / API / 组件：
```bash
# 后端路由
cat kb/server/{{KB_MODULE_SAMPLE}}/01_index_api.md

# 前端页面
cat kb/frontend/{{KB_MODULE_SAMPLE}}/01_index_page.md
```

## 六、代码生成规则

执行 `kb-skills run <skill>` 时：
1. 自动扫描源代码
2. 生成/更新 `kb/` 下的所有 Markdown
3. 在 `kb/progress.md` 中记录进度
4. 执行 `kb-skills verify` 可校验覆盖度

---

**最后更新**：{{TIMESTAMP}}
**生成工具**：`kb-skills init`