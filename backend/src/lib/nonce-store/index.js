// backend/src/lib/nonce-store/index.js
// Mendukung NONCE_TTL_SECONDS (detik) & NONCE_TTL_MS (ms). Default 5 menit.
const SEC = Number(process.env.NONCE_TTL_SECONDS || 0)
const MS  = Number(process.env.NONCE_TTL_MS || 0)
const TTL_MS = MS > 0 ? MS : (SEC > 0 ? SEC * 1000 : 5 * 60 * 1000)

const _store = new Map()

export async function setNonce(address, nonce) {
  _store.set(address, { nonce, exp: Date.now() + TTL_MS })
  return true
}
export async function getNonce(address) {
  const rec = _store.get(address)
  if (!rec) return null
  if (rec.exp && rec.exp < Date.now()) { _store.delete(address); return null }
  return rec.nonce
}
export async function deleteNonce(address) {
  _store.delete(address)
  return true
}
