// backend/src/lib/jwt.js
// ESM, tanpa dependensi eksternal (HS256 via crypto)

import crypto from 'node:crypto'

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  // Untuk dev masih jalan, tapi sangat disarankan set JWT_SECRET di .env
  // throw new Error('JWT_SECRET belum diset di environment')
  console.warn('[jwt] Peringatan: JWT_SECRET belum diset. Set di .env untuk keamanan.')
}

// ---- util base64url ----
function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}
function b64urlEncodeJSON(obj) {
  return b64urlEncode(JSON.stringify(obj))
}
function b64urlDecodeToString(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64').toString('utf8')
}

// ---- HMAC-SHA256 ----
function hmacSha256(data, secret) {
  return b64urlEncode(crypto.createHmac('sha256', secret || '').update(data).digest())
}

// Parse durasi seperti '30m', '12h', '1d' -> detik
function parseExpires(expiresIn) {
  if (typeof expiresIn === 'number') return expiresIn
  const m = String(expiresIn || '1d').match(/^(\d+)([smhd])$/i)
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }
  return m ? Number(m[1]) * mult[m[2].toLowerCase()] : 86400
}

// ---- API ----
export function signToken(payload = {}, expiresIn = '1d') {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + parseExpires(expiresIn)

  const header = { alg: 'HS256', typ: 'JWT' }
  const fullPayload = { iat: now, exp, ...payload }

  const headerB64 = b64urlEncodeJSON(header)
  const payloadB64 = b64urlEncodeJSON(fullPayload)
  const unsigned = `${headerB64}.${payloadB64}`
  const signature = hmacSha256(unsigned, SECRET)

  return `${unsigned}.${signature}`
}

export function verifyToken(token) {
  if (!token) throw new Error('Token tidak ada')
  const parts = String(token).split('.')
  if (parts.length !== 3) throw new Error('Token tidak valid (malformed)')

  const [hB64, pB64, sig] = parts
  const unsigned = `${hB64}.${pB64}`
  const expected = hmacSha256(unsigned, SECRET)

  // timing-safe compare
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature tidak valid')
  }

  // decode payload
  const payloadStr = b64urlDecodeToString(pB64)
  let payload
  try {
    payload = JSON.parse(payloadStr)
  } catch {
    throw new Error('Payload token rusak')
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && now > payload.exp) throw new Error('Token kedaluwarsa')
  return payload
}
