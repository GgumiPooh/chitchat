// INFO: `next.config.ts` turns on `experimental.viewTransition`, which swaps the app-router React for the canary build — `@types/react` only declares `ViewTransition` behind this reference.
// WARN: A triple-slash reference and not `import {} from "react/canary"`. `verbatimModuleSyntax` keeps that import in the emitted module, and the specifier has no runtime counterpart.
/// <reference types="react/canary" />
