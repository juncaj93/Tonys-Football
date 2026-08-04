/**
 * What `server-only` resolves to under Vitest.
 *
 * The real package is a file that throws unless the bundler resolved it under
 * React's `react-server` condition, which Vitest does not set — so a module
 * carrying the marker cannot be imported by a test at all. That is not the
 * protection the marker exists for: it keeps server code out of the **client
 * bundle**, Next.js enforces it at build time, and a unit test is not a bundle.
 *
 * Empty on purpose. See `vitest.config.ts` for the alias that points here.
 */

export {};
