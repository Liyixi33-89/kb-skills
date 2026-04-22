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
