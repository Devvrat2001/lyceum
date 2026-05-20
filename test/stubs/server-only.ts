// Vitest stub for the `server-only` npm package.
//
// The real module throws on import to prevent server-only files (db
// client, audit log, etc.) from leaking into client bundles via tree
// shaking. In tests we import those server modules directly under
// Node, which is exactly the legitimate-use path the guard exists to
// stop in production. Aliased in vitest.config.ts.
export {};
