import type { ConnectorDefinition } from "./types";

const registry = new Map<string, ConnectorDefinition>();

export function registerConnector(def: ConnectorDefinition): void {
  registry.set(def.type, def);
}

export function getConnector(type: string): ConnectorDefinition | undefined {
  return registry.get(type);
}

export function listConnectors(): ConnectorDefinition[] {
  return [...registry.values()];
}
