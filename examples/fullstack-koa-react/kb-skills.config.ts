import createKoaAdapter from "@kb-skills/adapter-koa";
import createReactAdapter from "@kb-skills/adapter-react";
import createGitLogAdapter from "@kb-skills/adapter-git-log";

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
    {
      name: "git-history",
      path: ".",
      adapter: createGitLogAdapter({
        kbRoot: "./kb",
        moduleName: "fullstack-koa-react",
        sinceDays: 90,
        recentCommitsLimit: 20,
        hotFileTopN: 15,
      }),
    },
  ],
};
