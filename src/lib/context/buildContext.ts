export type Turn = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export type RetrievedFact = {
  id: string;
  category: string;
  key: string;
  value: unknown;
  score: number;
};

export type BuildContextInput = {
  recentTurns: Turn[];
  historySummary: string;
  retrievedFacts: RetrievedFact[];
  pageConfigJson?: string;
  connectorStatusJson?: string;
  includePageConfig: boolean;
  includeConnectorStatus: boolean;
  maxRecentTurns?: number;
  maxFacts?: number;
};

export type BuiltContext = {
  recentTurns: Turn[];
  historySummary: string;
  facts: RetrievedFact[];
  pageConfigJson?: string;
  connectorStatusJson?: string;
};

export function buildContext(input: BuildContextInput): BuiltContext {
  const maxRecentTurns = input.maxRecentTurns ?? 12;
  const maxFacts = input.maxFacts ?? 40;

  const recentTurns = input.recentTurns.slice(-maxRecentTurns);
  const facts = [...input.retrievedFacts]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFacts);

  return {
    recentTurns,
    historySummary: input.historySummary,
    facts,
    pageConfigJson: input.includePageConfig ? input.pageConfigJson : undefined,
    connectorStatusJson: input.includeConnectorStatus
      ? input.connectorStatusJson
      : undefined,
  };
}
