export const nodeEnvironments = ["development", "test", "production"] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
