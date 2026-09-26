// WARN: The api segment is `server-only`, so a client module imports this barrel with `import type` alone — a value import drags it into the browser bundle (REQUIREMENTS.md § 2.).
export { listGeeknewsArticles, type ListGeeknewsArticlesParams } from "./api/list-articles";
export {
  syncBatchArticles,
  type IngestArticleInput,
  type SyncArticlesResult,
} from "./api/sync-batch-articles";
export type { GeeknewsFeedArticle } from "./model/types";
