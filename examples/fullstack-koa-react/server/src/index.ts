import Koa from "koa";
import { koaBody } from "koa-body";
import mongoose from "mongoose";
import usersRouter from "./routes/users";

const app = new Koa();
const PORT = process.env.PORT ?? 3001;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/kb-demo";

app.use(koaBody());
app.use(usersRouter.routes());
app.use(usersRouter.allowedMethods());

const start = async () => {
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected");
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
};

start().catch(console.error);
