/**
 * The runtime global `fetch`, wrapped so it survives being stored as a field
 * and later invoked as a method.
 *
 * The activity clients keep their `fetch` implementation in an instance field
 * and call it as `this.fetchImpl(url)`. Using the bare global `fetch` as the
 * default would then invoke it with the client instance as its `this`, which
 * `workerd` (Cloudflare Workers) rejects at runtime with
 * "Illegal invocation: function called with incorrect `this` reference" — even
 * though the same call is fine under Node. Calling the global `fetch` as a free
 * function inside this wrapper keeps its `this` bound to the global scope, so it
 * works on every runtime regardless of how the field is invoked. The wrapper
 * also resolves `fetch` lazily (at call time), so a host that installs `fetch`
 * after this module is evaluated still works.
 */
export const defaultFetch: typeof fetch = (input, init) => fetch(input, init);
