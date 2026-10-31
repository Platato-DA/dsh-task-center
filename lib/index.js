// Stable Host entry: the implementation is imported with a per-load query so a
// rebuild is picked up on the next load without restarting DSH (Node's ESM
// registry caches modules by URL). Keep this file's exports stable.
export const name = 'dsh-task-center'
export { inject } from './impl.js'

const impl = await import(new URL(`./impl.js?v=${Date.now()}`, import.meta.url).href)

export const apply = impl.apply
