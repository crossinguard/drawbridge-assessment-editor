/**
 * Converts a rune-backed value into a plain object before it goes to storage.
 *
 * This is not optional bookkeeping. `$state` hands out a Proxy, and IndexedDB writes
 * through structured clone, which throws on a Proxy — so every value crossing from a
 * component into the repository has to come through here first. The failure is a
 * `DataCloneError` at write time, which reads as a storage problem and sends you
 * looking in entirely the wrong place.
 *
 * Centralised so components never have to remember it.
 */
export function plain<T>(value: T): T {
  return $state.snapshot(value) as T;
}
