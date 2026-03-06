import type { OwnerScope } from "@/lib/auth/session";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";

type FactsReadScope = {
  factsReadId: string;
  factsReadKeys: string[] | undefined;
};

export function getFactsReadScope(scope: OwnerScope): FactsReadScope {
  if (PROFILE_ID_CANONICAL) {
    return {
      factsReadId: scope.cognitiveOwnerKey,
      factsReadKeys: undefined,
    };
  }

  return {
    factsReadId: scope.knowledgePrimaryKey,
    factsReadKeys: scope.knowledgeReadKeys,
  };
}
