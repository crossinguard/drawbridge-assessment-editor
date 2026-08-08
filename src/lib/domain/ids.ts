/**
 * Id and timestamp generation.
 *
 * `crypto.randomUUID` is a platform global in both the browser and Node, so this stays
 * inside the "domain depends on nothing" rule. It lives in its own module anyway so
 * that tests can stub it when they need deterministic output, and so a Tauri build has
 * exactly one place to change if it ever wants a different id shape.
 */

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
