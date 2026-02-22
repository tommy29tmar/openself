import { db } from "@/lib/db";
import { agentEvents } from "@/lib/db/schema";
import { randomUUID } from "crypto";

export type Actor = "user" | "assistant" | "worker" | "connector" | "system";

export type LogEventInput = {
  eventType: string;
  actor: Actor;
  payload: Record<string, unknown>;
  source?: string;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
};

export function logEvent(input: LogEventInput): void {
  db.insert(agentEvents)
    .values({
      id: randomUUID(),
      eventType: input.eventType,
      actor: input.actor,
      payload: input.payload,
      source: input.source ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      correlationId: input.correlationId ?? null,
    })
    .run();
}
