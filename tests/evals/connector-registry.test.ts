import { describe, it, expect, beforeEach } from "vitest";
import { getConnector, registerConnector, listConnectors } from "@/lib/connectors/registry";
import type { ConnectorDefinition } from "@/lib/connectors/types";

describe("connector-registry", () => {
  it("returns undefined for unknown connector type", () => {
    expect(getConnector("nonexistent")).toBeUndefined();
  });

  it("registers and retrieves a connector", () => {
    const mock: ConnectorDefinition = {
      type: "test-reg",
      displayName: "Test Connector",
      supportsSync: false,
      supportsImport: true,
    };
    registerConnector(mock);
    expect(getConnector("test-reg")).toBe(mock);
  });

  it("listConnectors returns all registered connectors", () => {
    const a: ConnectorDefinition = {
      type: "test-list-a",
      displayName: "A",
      supportsSync: true,
      supportsImport: false,
    };
    const b: ConnectorDefinition = {
      type: "test-list-b",
      displayName: "B",
      supportsSync: false,
      supportsImport: true,
    };
    registerConnector(a);
    registerConnector(b);
    const list = listConnectors();
    expect(list.find((c) => c.type === "test-list-a")).toBe(a);
    expect(list.find((c) => c.type === "test-list-b")).toBe(b);
  });

  it("overwrites existing registration for same type", () => {
    const v1: ConnectorDefinition = {
      type: "test-overwrite",
      displayName: "V1",
      supportsSync: false,
      supportsImport: false,
    };
    const v2: ConnectorDefinition = {
      type: "test-overwrite",
      displayName: "V2",
      supportsSync: true,
      supportsImport: true,
    };
    registerConnector(v1);
    registerConnector(v2);
    expect(getConnector("test-overwrite")?.displayName).toBe("V2");
  });
});
