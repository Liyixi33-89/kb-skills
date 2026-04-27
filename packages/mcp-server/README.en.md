# @kb-skills/mcp-server

[中文](./README.md) | **English**

> Expose your kb-skills knowledge base to AI coding assistants via the **MCP (Model Context Protocol)**.  
> Compatible with **Cursor / Claude Desktop / Windsurf / Copilot Chat** and any MCP-enabled tool.

[![npm version](https://img.shields.io/npm/v/@kb-skills/mcp-server.svg)](https://www.npmjs.com/package/@kb-skills/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](#requirements)

---

## What is this?

`@kb-skills/mcp-server` is the MCP server for the `kb-skills` toolchain.

It exposes all capabilities of `@kb-skills/core` (symbol search, module overview, route details, KB file reading, Skill management, coverage verification, and re-scanning) via the standard MCP protocol, allowing AI tools to **actively query** your project knowledge base instead of passively reading static files.

```
AI Tool (Cursor / Claude Desktop)
    │  MCP Protocol
    ▼
@kb-skills/mcp-server
    │  reuses
    ▼
@kb-skills/core (scan / KB / verify / Skills)
    │  read/write
    ▼
Project source code + kb/*.md
```

---

## Prerequisites

Before using `@kb-skills/mcp-server`, your project must have completed `kb-skills` initialization:

```bash
# 1. Install CLI and adapters
npm i -D @kb-skills/cli @kb-skills/adapter-react @kb-skills/adapter-koa

# 2. Initialize (generates kb-skills.config.ts)
npx kb-skills init

# 3. Generate the knowledge base
npx kb-skills run doc-code-to-kb
```

> If your project does not have a `kb-skills.config.ts`, the MCP Server will exit with an error on startup.

---

## Installation

```bash
npm i -D @kb-skills/mcp-server
```

Or use directly with `npx` (no installation required):

```bash
npx @kb-skills/mcp-server
```

---

## Quick Setup

### Cursor

Create (or edit) `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "kb-skills": {
      "command": "npx",
      "args": ["@kb-skills/mcp-server"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

> Set `cwd` to the **absolute path** of your project (the directory containing `kb-skills.config.ts`).

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "kb-skills": {
      "command": "npx",
      "args": [
        "@kb-skills/mcp-server",
        "--cwd",
        "/path/to/your/project"
      ]
    }
  }
}
```

### Windsurf / Other MCP Clients

Same configuration as Cursor, with the following values:

| Field | Value |
|------|-----|
| command | `npx` |
| args | `["@kb-skills/mcp-server", "--cwd", "/path/to/your/project"]` |
| transport | `stdio` |

---

## CLI Options

```bash
npx @kb-skills/mcp-server [options]
```

| Option | Description | Default |
|------|------|--------|
| `--cwd <dir>` | Project root (directory containing `kb-skills.config.ts`) | `process.cwd()` |
| `--config <path>` | Path to config file | auto-detect |
| `--http` | Enable HTTP mode (instead of stdio) | disabled |
| `--port <n>` | HTTP mode port | `3456` |

### Examples

```bash
# stdio mode (for Cursor / Claude Desktop)
npx @kb-skills/mcp-server --cwd /my/project

# HTTP mode (for CI / other HTTP clients)
npx @kb-skills/mcp-server --http --port 3456 --cwd /my/project

# Specify config file
npx @kb-skills/mcp-server --config ./config/kb-skills.config.ts
```

---

## Available MCP Tools (13 total)

> **New in v1.1.0**: `search_semantic` (semantic search), incremental mode for `run_scan`, KB file YAML Front Matter metadata  
> **New in v1.5.0**: `get_dependency_graph`, `find_cross_module_relations`, `execute_skill_workflow`, `analyze_change_impact` (OAG capabilities)

### `search_symbol` — Symbol Search

Search for routes, services, components, models, and other symbols in your project with fuzzy matching.

```
Parameters:
  query   string   Search keyword (case-insensitive)
  kind?   enum     Symbol type: route / service / model / middleware /
                               page / component / store / api / type / config
  module? string   Restrict to a specific module
  limit?  number   Max results to return, default 20
```

**Example**: "Find the UserService implementation" → AI calls `search_symbol({ query: "UserService", kind: "service" })`

---

### `get_module_map` — Module Overview

Returns basic info for all modules and the `00_project_map.md` content, helping AI quickly understand the overall project structure.

```
Parameters:
  module? string   Specify a module name; omit to return all modules
```

---

### `get_route_detail` — Route Details

Look up route details by path, returning the corresponding KB document content and source file path.

```
Parameters:
  route   string   Route path, e.g. /api/users or /dashboard (fuzzy match supported)
  module? string   Restrict to a specific module
```

**Example**: "What does the /api/users endpoint do?" → AI calls `get_route_detail({ route: "/api/users" })`

---

### `get_kb_file` — Read KB File

Read the content of any file in the KB directory.

```
Parameters:
  path  string   Path relative to kbRoot
                 e.g. server/api/users.md or frontend/web/01_index_page.md
```

---

### `list_skills` — List All Skills

List the names and descriptions of all built-in Skills (no parameters).

---

### `get_skill` — Get Skill Content

Get the full `SKILL.md` content for a specified Skill, including detailed AI workflow prompts.

```
Parameters:
  name  string   Skill name, e.g. doc-code-to-kb / bug-fix / code-review
```

---

### `get_kb_status` — KB Coverage Status

Returns KB progress statistics and verification report (no parameters).

```
Returns:
  progress.total        Total file count
  progress.done         Completed file count
  progress.progressPct  Completion percentage
  verify.status         pass / fail / error
  verify.missingFiles   List of missing files
  verify.recommendation Fix suggestions
```

---

### `run_scan` — Trigger Re-scan

Re-scan project code to refresh KB files and in-memory cache. Use when significant code changes have been made.

> **Upgraded in v1.1.0**: Supports incremental mode — only re-scans changed modules, greatly improving scan speed.

```
Parameters:
  force?  boolean                    Force full re-scan, default false
  mode?   "full" | "incremental"     Scan mode, default "incremental"
```

**Example response (incremental mode)**:
```json
{
  "mode": "incremental",
  "message": "Incremental scan complete: 3 modules, 247 symbols, changed modules: server",
  "changedModules": ["server"],
  "diffSummary": {
    "added": 1,
    "modified": 2,
    "deleted": 0,
    "unchanged": 312
  }
}
```

---

### `search_semantic` — Semantic Search ✨ NEW in v1.1.0

Local semantic search based on **TF-IDF + cosine similarity** — no external API key required, runs entirely locally.

Compared to `search_symbol` (exact name matching), `search_semantic` supports **natural language queries** and understands intent rather than just matching keywords.

```
Parameters:
  query   string   Natural language query, e.g. "service that handles user login"
  topK?   number   Number of results to return, default 10
  module? string   Restrict to a specific module
```

**Example**: "Find code related to user permission verification" → AI calls `search_semantic({ query: "user permission verification" })`

**Example response**:
```json
{
  "results": [
    {
      "title": "AuthService",
      "module": "server",
      "score": 0.312,
      "summary": "Handles user authentication, JWT token generation and validation...",
      "meta": {
        "symbol": "AuthService",
        "kind": "service",
        "file": "src/services/auth.service.ts",
        "dependencies": ["UserModel", "JwtService"]
      }
    }
  ],
  "total": 3,
  "query": "user permission verification",
  "indexedFiles": 48
}
```

> **Comparison with `search_symbol`**:
> | | `search_symbol` | `search_semantic` |
> |---|---|---|
> | Matching | Exact name/type match | Natural language semantic match |
> | Use case | Know the symbol name | Describe functional intent |
> | Speed | Very fast | Fast (local vector computation) |
> | Requires API | No | No |

---

### `get_dependency_graph` — Dependency Graph ✨ NEW in v1.5.0

Query the dependency graph for a specified symbol, supporting upstream/downstream traversal and Mermaid diagram output. Ideal for answering questions like "What services will be affected if I modify UserModel?"

```
Parameters:
  symbol     string   Target symbol name, e.g. UserService, UserModel
  depth?     number   Traversal depth, default 2
  direction? enum     upstream / downstream / both (default)
  format?    enum     tree (default) / flat / mermaid
```

**Example**: "What services depend on UserModel?" → AI calls `get_dependency_graph({ symbol: "UserModel", direction: "upstream", format: "mermaid" })`

---

### `find_cross_module_relations` — Cross-Module Relations ✨ NEW in v1.5.0

Query frontend-backend cross-module associations. Answers questions like "Which frontend pages call the /api/users endpoint?" or "What backend APIs does UserList.tsx call?"

```
Parameters:
  apiRoute?      string   Backend route path, e.g. /api/users (fuzzy path param matching)
  frontendFile?  string   Frontend file path (partial match), e.g. UserList.tsx
  (at least one required)
```

**Example**: "Which frontend pages call /api/users?" → AI calls `find_cross_module_relations({ apiRoute: "/api/users" })`

---

### `execute_skill_workflow` — Skill Workflow ✨ NEW in v1.5.0

Execute a Skill workflow that automatically orchestrates multiple Tool calls to complete complex tasks. Workflows are defined in the YAML Front Matter of SKILL.md files.

```
Parameters:
  skill    string              Skill name, e.g. bug-fix, code-review
  context? Record<string,any>  Initial context variables, e.g. { bugKeyword: "UserService" }
  dryRun?  boolean             Return execution plan only, default false
```

**Example**: "Help me analyze a bug in UserService" → AI calls `execute_skill_workflow({ skill: "bug-fix", context: { bugKeyword: "UserService" } })`

---

### `analyze_change_impact` — Change Impact Analysis ✨ NEW in v1.5.0

Analyze the impact scope of modifying a specified symbol, assess risk level (🟢 low / 🟡 medium / 🔴 high), and provide fix suggestions.

```
Parameters:
  symbol        string   Symbol name to modify
  changeType    enum     signature / behavior / delete / rename
  newSignature? string   New signature (for changeType=signature)
  newName?      string   New name (for changeType=rename)
```

**Example**: "I want to delete UserService.createUser, what will be affected?" → AI calls `analyze_change_impact({ symbol: "createUser", changeType: "delete" })`

---

## Caching

The MCP Server has two built-in cache layers:

### 1. ScanResult In-Memory Cache

Avoids re-scanning on every Tool call:

- **Lazy loading**: No scan on startup; triggered on first Tool call
- **TTL**: Default 30 minutes, overridable via environment variable:
  ```bash
  KB_SKILLS_CACHE_TTL_MS=3600000 npx @kb-skills/mcp-server  # 1 hour
  ```
- **Manual refresh**: Calling the `run_scan` Tool immediately refreshes the cache

### 2. Incremental Scan Cache (New in v1.1.0)

Persisted to `.kb-skills/scan-cache.json`, recording `mtime + file size hash` for each source file:

- **First scan**: Full scan, generates cache file
- **Subsequent scans**: Only re-scans modules with hash-changed files
- **No changes**: Returns cache directly, < 200ms
- **Semantic index**: The vector index for `search_semantic` is automatically invalidated and rebuilt after `run_scan`

---

## HTTP Mode (CI / Automation)

```bash
npx @kb-skills/mcp-server --http --port 3456 --cwd /my/project
```

Provides two endpoints after startup:

| Endpoint | Description |
|------|------|
| `POST /mcp` | MCP protocol endpoint (StreamableHTTP transport) |
| `GET /health` | Health check, returns `{ "status": "ok" }` |

---

## Programmatic Usage

```ts
import { createKbSkillsServer, loadMcpContext } from "@kb-skills/mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const ctx = await loadMcpContext("/path/to/project");
const server = createKbSkillsServer(ctx);
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Requirements

- Node.js **>= 18.17**
- Project has completed `kb-skills init` and `kb-skills run doc-code-to-kb`

---

## License

[MIT](../../LICENSE)
