# @kb-skills/adapter-openapi

OpenAPI / Swagger spec adapter for [kb-skills](https://github.com/your-org/kb-skills).

Parses `openapi.json` / `swagger.yaml` and injects the full API contract into the KB — request body, response schema, parameters, and component schemas — so AI knows exactly what each endpoint expects and returns.

## Installation

```bash
npm install @kb-skills/adapter-openapi
# or
pnpm add @kb-skills/adapter-openapi
```

## Usage

### Basic — auto-detect spec file

```typescript
import createOpenApiAdapter from "@kb-skills/adapter-openapi";

const adapter = createOpenApiAdapter();

// Auto-detects openapi.json / swagger.yaml in project root
const mod = await adapter.scan("/path/to/project");

console.log(mod.symbols.filter(s => s.kind === "route"));
// [
//   { kind: "route", name: "GET /api/users", framework: "openapi", ... },
//   { kind: "route", name: "POST /api/users", framework: "openapi", ... },
//   ...
// ]
```

### With KB output

```typescript
import createOpenApiAdapter from "@kb-skills/adapter-openapi";

const adapter = createOpenApiAdapter({
  kbRoot: "./kb",        // writes KB files to ./kb/openapi/openapi/
  moduleName: "my-api",  // custom module name
});

await adapter.scan("/path/to/project");
// Generates:
//   kb/openapi/my-api/00_overview.md
//   kb/openapi/my-api/01_index_paths.md
//   kb/openapi/my-api/schemas/users.md
//   kb/openapi/my-api/schemas/auth.md
//   kb/openapi/my-api/components.md
```

### Manual spec file path

```typescript
const adapter = createOpenApiAdapter({
  specFile: "docs/api-spec.yaml",  // relative to project root
  kbRoot: "./kb",
});
```

## Auto-detected file names

The adapter searches for spec files in this order:

| Path | Format |
|------|--------|
| `openapi.json` | JSON |
| `openapi.yaml` / `openapi.yml` | YAML |
| `swagger.json` | JSON |
| `swagger.yaml` / `swagger.yml` | YAML |
| `api/openapi.json` | JSON |
| `docs/openapi.yaml` | YAML |
| `src/openapi.json` | JSON |

## YAML support

YAML parsing uses `js-yaml` or `yaml` if installed in your project. For JSON specs, no extra dependencies are needed.

```bash
# Optional: install a YAML parser
pnpm add -D js-yaml
# or
pnpm add -D yaml
```

## Generated KB structure

```
kb/openapi/<moduleName>/
├── 00_overview.md        # API title, version, server URLs, stats
├── 01_index_paths.md     # Full endpoint index table
├── schemas/
│   ├── users.md          # Endpoint contracts grouped by tag
│   └── auth.md
└── components.md         # Schema component definitions
```

Each schema file contains:
- Endpoint summary, operationId, auth requirements
- Parameter table (path / query / header)
- Request body field table
- Response body field table per status code

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `specFile` | `string` | auto-detect | Path to spec file (relative or absolute) |
| `moduleName` | `string` | `"openapi"` | Module name for KB directory |
| `kbRoot` | `string` | — | If set, writes KB files automatically |

## Integration with kb-skills Skill workflows

After scanning, the KB files are picked up by `get_route_detail` and `find_cross_module_relations`, enabling the `api-diff` Skill to compare OpenAPI contracts with frontend call sites:

```
OpenAPI spec → adapter-openapi → KB files
                                    ↓
                          get_route_detail (full contract)
                                    ↓
                          api-diff Skill (frontend sync plan)
```
