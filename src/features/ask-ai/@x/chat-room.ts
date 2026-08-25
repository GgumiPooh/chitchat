// INFO: The FSD cross-import gate. `index.ts` is `server-only` (`api/generation-registry.ts`'s own import), so the room's streaming footer — a client component — reaches the feature's client half through here instead.
export { cancelGeneration } from "../api/cancel-generation";
export {
  useActiveGenerations,
  type ActiveGenerations,
  type GenerationEntry,
} from "../model/use-active-generations";
export {
  isSelectableMessage,
  useAiSelection,
  type AiSelectionState,
} from "../model/use-ai-selection";
export { useLlmAgentChoice, type LlmAgentChoice } from "../model/use-llm-agent-choice";
