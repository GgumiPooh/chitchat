// WARN: The api segment is `server-only`, so a client module imports this barrel with `import type` alone — a value import drags it into the browser bundle (REQUIREMENTS.md § 2.).
export { listGeeknewsArticles } from "./api/list-articles";
export type { GeeknewsFeedArticle } from "./model/types";

