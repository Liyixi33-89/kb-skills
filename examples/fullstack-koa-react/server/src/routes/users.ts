import Router from "@koa/router";
import { User } from "../models/user";

const router = new Router({ prefix: "/users" });

// GET /users — list all users
router.get("/", async (ctx) => {
  const users = await User.find().lean();
  ctx.body = { data: users };
});

// GET /users/:id — get a single user
router.get("/:id", async (ctx) => {
  const user = await User.findById(ctx.params.id).lean();
  if (!user) {
    ctx.status = 404;
    ctx.body = { error: "User not found" };
    return;
  }
  ctx.body = { data: user };
});

// POST /users — create a user
router.post("/", async (ctx) => {
  const body = ctx.request.body as { name: string; email: string; role?: string };
  const user = await User.create(body);
  ctx.status = 201;
  ctx.body = { data: user };
});

// PUT /users/:id — update a user
router.put("/:id", async (ctx) => {
  const body = ctx.request.body as Partial<{ name: string; email: string; role: string }>;
  const user = await User.findByIdAndUpdate(ctx.params.id, body, { new: true }).lean();
  if (!user) {
    ctx.status = 404;
    ctx.body = { error: "User not found" };
    return;
  }
  ctx.body = { data: user };
});

// DELETE /users/:id — delete a user
router.delete("/:id", async (ctx) => {
  await User.findByIdAndDelete(ctx.params.id);
  ctx.status = 204;
});

export default router;
