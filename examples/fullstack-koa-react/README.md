# fullstack-koa-react

A minimal fullstack demo showing how to use `kb-skills` on a real project.

## Project Structure

```
fullstack-koa-react/
├── server/                    # Koa 2 + Mongoose API
│   ├── src/
│   │   ├── routes/
│   │   │   └── users.ts       # GET /users, POST /users
│   │   ├── models/
│   │   │   └── user.ts        # Mongoose User model
│   │   ├── services/
│   │   │   └── userService.ts
│   │   └── index.ts
│   └── package.json
├── web/                       # React 19 + Zustand UI
│   ├── src/
│   │   ├── pages/
│   │   │   └── UserList.tsx
│   │   ├── components/
│   │   │   └── UserCard.tsx
│   │   ├── store/
│   │   │   └── userStore.ts
│   │   └── api/
│   │       └── users.ts
│   └── package.json
├── kb-skills.config.ts        # kb-skills configuration
└── kb/                        # Generated KB (run `npx kb-skills run doc-code-to-kb`)
```

## Quick Start

```bash
# 1. Install kb-skills CLI
npm install -g @kb-skills/cli

# 2. Install adapters
npm install @kb-skills/adapter-koa @kb-skills/adapter-react

# 3. Generate KB
npx kb-skills run doc-code-to-kb

# 4. Check progress
npx kb-skills status

# 5. Verify coverage
npx kb-skills verify
```

## `kb-skills.config.ts`

```ts
import createKoaAdapter from "@kb-skills/adapter-koa";
import createReactAdapter from "@kb-skills/adapter-react";

export default {
  modules: [
    {
      name: "server",
      path: "./server",
      adapter: createKoaAdapter(),
    },
    {
      name: "web",
      path: "./web",
      adapter: createReactAdapter(),
    },
  ],
};
```

## What Gets Generated

After running `npx kb-skills run doc-code-to-kb`, the `kb/` directory will contain:

```
kb/
├── 00_project_constitution.md   # Project overview
├── progress.md                  # KB completion tracker
├── server/
│   ├── 00_project_map.md        # Server module map
│   ├── 01_index_api.md          # API routes index
│   ├── 02_index_model.md        # Data models index
│   ├── 03_index_service.md      # Services index
│   ├── api/
│   │   └── users.md             # GET /users, POST /users
│   └── services/
│       └── userService.md
└── web/
    ├── 00_project_map.md        # Web module map
    ├── 01_index_page.md         # Pages index
    ├── 02_index_component.md    # Components index
    ├── 03_index_store.md        # Stores index
    └── pages/
        └── UserList.md
```
