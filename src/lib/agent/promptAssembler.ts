export type PromptMode = "onboarding" | "steady_state" | "heartbeat";

export type PromptBlock = {
  id: string;
  version: number;
  content: string;
};

export type PromptContext = {
  mode: PromptMode;
  agentIdentity: string;
  safetyPolicy: string;
  toolPolicy: string;
  outputContract: string;
  retrievedFacts: string;
  historySummary: string;
  pageConfigContext: string;
  connectorContext: string;
};

export type AssembledPrompt = {
  text: string;
  blocks: Array<{ id: string; version: number }>;
};

function block(id: string, version: number, content: string): PromptBlock {
  return { id, version, content };
}

export function assembleSystemPrompt(ctx: PromptContext): AssembledPrompt {
  const blocks: PromptBlock[] = [
    block("core-charter", 1, `Mode: ${ctx.mode}\n${ctx.agentIdentity}`),
    block("safety-policy", 1, ctx.safetyPolicy),
    block("tool-policy", 1, ctx.toolPolicy),
    block("output-contract", 1, ctx.outputContract),
    block("retrieved-facts", 1, ctx.retrievedFacts),
    block("history-summary", 1, ctx.historySummary),
  ];

  if (ctx.pageConfigContext.trim().length > 0) {
    blocks.push(block("page-config-context", 1, ctx.pageConfigContext));
  }

  if (ctx.connectorContext.trim().length > 0) {
    blocks.push(block("connector-context", 1, ctx.connectorContext));
  }

  const text = blocks
    .map((b) => `### ${b.id}@v${b.version}\n${b.content}`)
    .join("\n\n");

  return {
    text,
    blocks: blocks.map((b) => ({ id: b.id, version: b.version })),
  };
}
