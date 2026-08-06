export const methods = ["delete", "get", "patch", "post", "put"] as const;
export type Method = (typeof methods)[number];
