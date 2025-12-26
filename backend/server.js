// backend/server.js
import 'dotenv/config'
import http from 'node:http'
import multer from 'multer'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { verifyMessage } from 'ethers'
import { Server as IOServer } from 'socket.io'
import supabase from './supabaseClient.js'
import { JsonRpcProvider, Contract } from 'ethers'
import process from 'node:process'
// import fetch from 'node-fetch'

// ----- Harga POL/IDR helper -----
// import fetch from 'node-fetch'  // kalau belum, npm install node-fetch

// Ambil harga POL (MATIC) dalam IDR dari CoinGecko
async function fetchPolIdrRate() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=idr'

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Gagal fetch harga POL/IDR: ${res.status}`)
  }

  const json = await res.json()
  const price = json?.['polygon-ecosystem-token']?.idr

  if (!price || price <= 0) {
    throw new Error('Harga POL/IDR tidak valid dari CoinGecko')
  }

  // Contoh: 3165.42 (IDR per 1 POL)
  return Number(price)
}

/* =========================
   ENV & SERVER
   ========================= */
const PORT = Number(process.env.PORT) || 3001
const IS_PROD = process.env.NODE_ENV === 'production'
const IS_TEST = process.env.NODE_ENV === 'test'

const ORIGINS_ENV = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean)
const DEV_DEFAULTS = ['http://localhost:5173', 'http://127.0.0.1:5173']
const ALLOWLIST = IS_PROD ? ORIGINS_ENV : (ORIGINS_ENV.length ? ORIGINS_ENV : DEV_DEFAULTS)

const app = express()
app.disable('x-powered-by')

/* =========================
   SECURITY: Helmet (CSP)
   ========================= */
const csp = {
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": ["'self'"],
    "connect-src": ["'self'", ...ALLOWLIST],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"]
  }
}
if (!IS_PROD) {
  csp.directives['connect-src'].push(
    'ws://localhost:5173', 'ws://127.0.0.1:5173',
    'ws://localhost:3001', 'ws://127.0.0.1:3001'
  )
}
app.use(helmet({ contentSecurityPolicy: csp, crossOriginEmbedderPolicy: false }))

/* =========================
   RATE LIMIT, LOGGING, PARSERS
   ========================= */
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }))
app.use(morgan(':method :url :status - :response-time ms'))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

/* =========================
   CORS
   ========================= */
const corsMw = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true)
    if (ALLOWLIST.includes(origin)) return cb(null, true)
    if (!IS_PROD && /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin)) return cb(null, true)
    return cb(new Error(`Not allowed by CORS: ${origin}`), false)
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-wallet-address', 'Authorization'],
  optionsSuccessStatus: 204
})
app.use(corsMw)
app.options(/.*/, corsMw)

/* =========================
   MULTER (upload)
   ========================= */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const BUCKET = process.env.SUPABASE_BUCKET || 'event-images'
// const upload = multer({ dest: 'uploads/' })

/* =========================
   SEED ADMIN DARI ENV (opsional)
   ========================= */
const envAdmins = (process.env.ADMIN_ADDRESSES || process.env.ADMIN_ADDRESS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
if (envAdmins.length && !IS_TEST) {
  try {
    await supabase.from('admins').upsert(
      envAdmins.map(a => ({ address: a, note: 'seeded-from-env' })),
      { onConflict: 'address' }
    )
  } catch (e) {
    console.error('[seed admins] failed:', e?.message || e)
  }
}

/* =========================
   UTIL & GUARD
   ========================= */
const normAddr = (a) => (a || '').toLowerCase().trim()
const isEthAddr = (a) => /^0x[a-f0-9]{40}$/.test(normAddr(a))
const getReqAddress = (req) => {
  const raw = req.headers['x-wallet-address'] || req.query.wallet || ''
  const addr = normAddr(String(raw))
  return isEthAddr(addr) ? addr : null
}
async function isAdmin(addr) {
  if (!addr) return false
  const { data, error } = await supabase
    .from('admins').select('address').eq('address', addr).limit(1)
  if (error) return false
  return !!(data && data.length)
}
async function requireAddress(req, res, next) {
  const addr = getReqAddress(req)
  if (!addr) return res.status(401).json({ error: 'Missing or invalid x-wallet-address' })
  req.walletAddress = addr
  next()
}
async function requireAdmin(req, res, next) {
  const addr = req.walletAddress || getReqAddress(req)
  if (!addr) return res.status(401).json({ error: 'Missing or invalid x-wallet-address' })
  if (!(await isAdmin(addr))) return res.status(403).json({ error: 'Forbidden: admin only' })
  req.walletAddress = addr
  next()
}

/* =========================
   PROMOTER: EVENT TRANSACTIONS
   ========================= */
// List pembelian tiket untuk 1 event tertentu (hanya event milik promoter yang login)
// GET /api/promoter/events/:id/transactions
app.get('/api/promoter/events/:id/transactions', requireAddress, requireRole(['promoter']), async (req, res) => {
  const promoterWallet = req.walletAddress
  const eventId = String(req.params.id || '')

  if (!eventId) {
    return res.status(400).json({ error: 'event_id_required' })
  }

  // 1) Pastikan event ada & milik promoter yang login
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('id,title,venue,date_iso,promoter_wallet')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr) return res.status(500).json({ error: evErr.message })
  if (!ev) return res.status(404).json({ error: 'event_not_found' })

  if (String(ev.promoter_wallet || '').toLowerCase() !== String(promoterWallet).toLowerCase()) {
    return res.status(403).json({ error: 'forbidden_not_your_event' })
  }

  // 2) Ambil transaksi purchase yang ref_id = eventId
  const { data, error } = await supabase
    .from('transactions')
    .select('id,wallet,created_at,amount,status,tx_hash,scanned,scanned_at')
    .eq('kind', 'purchase')
    .eq('ref_id', eventId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ event: ev, items: data || [] })
})

// =========================
// ON-CHAIN PROMOTER CHECK
// =========================

const RPC_URL = process.env.RPC_URL
const TICKETS_CONTRACT = process.env.CONTRACT_ADDRESS

const promoterAbi = [
  'function isPromoter(address account) view returns (bool)'
]

let rpcProvider = null
let promoterContract = null

if (!IS_TEST && RPC_URL && TICKETS_CONTRACT) {
  try {
    rpcProvider = new JsonRpcProvider(RPC_URL)
    promoterContract = new Contract(TICKETS_CONTRACT, promoterAbi, rpcProvider)
    console.log('[onchain] RPC & contract for isPromoter initialised')
  } catch (e) {
    console.error('[onchain] Failed to init RPC/contract', e)
  }
}


async function isOnchainPromoter (addr) {
  if (!promoterContract || !addr) return false
  try {
    return await promoterContract.isPromoter(addr)
  } catch (e) {
    console.error('[onchain] isPromoter RPC error', e)
    return false
  }
}

/* =========================
   VALIDASI PAYLOAD
   ========================= */
const eventCreateSchema = z.object({
  title: z.string().min(1).max(160),
  date_iso: z.string().min(10),
  venue: z.string().min(1).max(160),
  description: z.string().max(4000).optional().default(''),
  image_url: z.string().url().optional().nullable(),
  price_idr: z.number().int().min(0),                 // harga tiket (Rp) 25-11-2025
  // price_pol: z.number().min(0), diganti jadi price_idr
  total_tickets: z.number().int().min(0),
  listed: z.boolean().optional().default(true),
  chain_event_id: z.number().int().positive().optional()   // eventId dari smart contract ⬅️ ini ditambah 25-11-2025
})
const eventUpdateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  date_iso: z.string().min(10).optional(),
  venue: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  image_url: z.string().url().nullable().optional(),
  price_idr: z.number().int().min(0).optional(),                 // harga tiket (Rp) 25-11-2025
  // price_pol: z.number().min(0).optional(), diganti jadi price_idr
  total_tickets: z.number().int().min(0).optional(),
  listed: z.boolean().optional(),
  chain_event_id: z.number().int().positive().optional()   // eventId dari smart contract ⬅️ ini ditambah 25-11-2025
})

/* =========================
   SIWE-lite: Nonce & Verify
   ========================= */
const nonces = new Map() // addr -> { nonce, expMs }
const NONCE_TTL = 5 * 60 * 1000

app.get('/api/nonce', (req, res) => {
  const addr = String(req.query.address || '').toLowerCase().trim()
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return res.status(400).json({ message: 'invalid address' })
  const nonce = nanoid(16)
  nonces.set(addr, { nonce, expMs: Date.now() + NONCE_TTL })
  res.json({ nonce, expires_in: NONCE_TTL / 1000 })
})
app.post('/api/verify', async (req, res) => {
  const { message, signature } = req.body || {}
  if (!message || !signature) return res.status(400).json({ message: 'message & signature required' })
  const m = String(message)
  const addressInMsg = (m.match(/0x[a-fA-F0-9]{40}/) || [])[0]?.toLowerCase()
  if (!addressInMsg) return res.status(400).json({ message: 'address not found in message' })
  const rec = nonces.get(addressInMsg)
  const nonceInMsg = (m.match(/^\s*Nonce:\s*([A-Za-z0-9_-]{6,})/mi) || [])[1]
  if (!rec || !nonceInMsg || rec.nonce !== nonceInMsg || rec.expMs < Date.now()) {
    return res.status(400).json({ message: 'invalid or expired nonce' })
  }
  let recovered
  try { recovered = (await verifyMessage(m, signature)).toLowerCase() }
  catch { return res.status(400).json({ message: 'bad signature' }) }
  if (recovered !== addressInMsg) return res.status(401).json({ message: 'address mismatch' })
  nonces.delete(addressInMsg)
  const token = `sess_${nanoid(24)}`
  res.json({ ok: true, address: addressInMsg, token })
})

/* =========================
   HEALTH & IDENTITY
   ========================= */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'dev', port: PORT, cors_allowlist: ALLOWLIST, time: new Date().toISOString() })
})
app.get('/api/me', requireAddress, async (req, res) => {
  const addr = req.walletAddress

  // 1. kalau ada di tabel admins → selalu admin
  const admin = await isAdmin(addr)
  if (admin) {
    return res.json({ address: addr, role: 'admin' })
  }

  try {
    // 2. Pastikan user ada di tabel users (kalau belum, dibuat sebagai customer)
    const user = await ensureUserRow(addr)   // user.role mungkin 'customer' atau 'promotor' lama

    // 3. Tanya ke smart contract: dia promotor on-chain atau bukan?
    const onchainPromoter = await isOnchainPromoter(addr)

    // 4. Tentukan role target berdasarkan on-chain
    const targetRole = onchainPromoter ? 'promoter' : 'customer'

    // 5. Normalisasi role lama 'promotor' -> 'promoter'
    const currentRole = (user.role === 'promotor')
      ? 'promoter'
      : (user.role || 'customer')

    // 5. Kalau role di DB beda dengan role on-chain → update DB biar sinkron
    if (currentRole !== targetRole) {
      const { error: updErr } = await supabase
        .from('users')
        .update({ role: targetRole })
        .eq('wallet_address', addr)

      if (updErr) {
        console.error('[/api/me] failed to sync role with on-chain', updErr)
        // Tapi response tetap pakai targetRole (on-chain jadi sumber kebenaran)
      }
    }

    // 6. Balikin role hasil sinkron (auto-promote & auto-demote)
    return res.json({ address: addr, role: targetRole })
  } catch (e) {
    console.error('[/api/me] error', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

/* =========================
   PRICE POL→IDR (cache)
   ========================= */
const UA = 'tickety-price/1.0 (+local dev)'
const PRICE_TTL_MS = 8_000
let priceCache = { idr: null, src: null, ts: 0, staleReason: null }
const httpJSON = async (url, { timeout = 6000 } = {}) => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'accept': 'application/json', 'user-agent': UA } })
    if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

app.get('/api/price/pol', async (_req, res) => {
  try {
    const priceIdr = await fetchPolIdrRate()

    return res.json({
      price_idr: priceIdr,       // IDR per 1 POL
      source: 'coingecko',
      updated_at: new Date().toISOString()
    })
  } catch (err) {
    console.error('ERR /api/price/pol', err)
    return res.status(502).json({ error: 'price_unavailable' })
  }
})

app.post('/api/price/idr-to-wei', async (req, res) => {
  try {
    const amountIdr = Number(req.body?.amount_idr)
    if (!amountIdr || amountIdr <= 0) {
      return res.status(400).json({ error: 'amount_idr harus > 0' })
    }

    const priceIdrPerPol = await fetchPolIdrRate()
    const polAmount = amountIdr / priceIdrPerPol
    const weiNumber = Math.round(polAmount * 1e18)
    const wei = BigInt(weiNumber)

    return res.json({
      amount_idr: amountIdr,
      idr_per_pol: priceIdrPerPol,
      price_wei: wei.toString()
    })
  } catch (err) {
    console.error('ERR /api/price/idr-to-wei', err)
    return res.status(500).json({ error: 'Gagal konversi IDR ke wei' })
  }
})

/* =========================
   ADMIN MGMT
   ========================= */
app.post('/api/admins', requireAdmin, async (req, res) => {
  const addr = normAddr(req.body?.address)
  if (!isEthAddr(addr)) return res.status(400).json({ error: 'Invalid address' })
  const { error } = await supabase.from('admins').upsert(
    { address: addr, note: req.body?.note ?? null }, { onConflict: 'address' }
  )
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, address: addr })
})
app.delete('/api/admins/:address', requireAdmin, async (req, res) => {
  const addr = normAddr(req.params.address)
  if (!isEthAddr(addr)) return res.status(400).json({ error: 'Invalid address' })
  const { error } = await supabase.from('admins').delete().eq('address', addr)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, address: addr })
})

/* =========================
   UPLOAD (Supabase Storage)
   ========================= */
app.post('/api/upload', requireAddress, requireRole(['admin', 'promoter']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' })
    const bytes = req.file.buffer
    const mime  = req.file.mimetype || 'application/octet-stream'
    const orig  = (req.file.originalname || '').toLowerCase().trim()
    const ext   = (orig.includes('.') ? orig.split('.').pop() : '') || 'jpg'
    const id    = nanoid(12)
    const path  = `events/${id}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    if (upErr) return res.status(500).json({ error: upErr.message })
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const url = pub?.publicUrl || null
    return res.json({ ok: true, path, url })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'upload_failed' })
  }
})

/* =========================
   ADMIN: EVENT TRANSACTIONS
   ========================= */
// Admin bisa lihat pembelian tiket untuk event manapun
// GET /api/admin/events/:id/transactions
app.get('/api/admin/events/:id/transactions', requireAdmin, async (req, res) => {
  const eventId = String(req.params.id || '')

  if (!eventId) return res.status(400).json({ error: 'event_id_required' })

  // 1) Pastikan event ada
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('id,title,venue,date_iso,promoter_wallet')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr) return res.status(500).json({ error: evErr.message })
  if (!ev) return res.status(404).json({ error: 'event_not_found' })

  // 2) Ambil transaksi purchase untuk event tsb
  // NOTE: JANGAN select kolom yang tidak ada (contoh: quantity)
  const { data, error } = await supabase
    .from('transactions')
    .select('id,wallet,created_at,description,status,tx_hash,scanned,scanned_at')
    .eq('kind', 'purchase')
    .eq('ref_id', eventId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ event: ev, items: data || [] })
})


/* =========================
   EVENTS CRUD
   ========================= */
app.post('/api/events', requireAddress, async (req, res) => {
  const wallet = req.walletAddress
  const user = await ensureUserRow(wallet)
  if (!['admin', 'promoter'].includes(user.role)) {
    return res.status(403).json({ error: 'forbidden_role' })
  }

  const parsed = eventCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }

  const p = parsed.data
  const id = nanoid(12)   // 🔴 WAJIB: generate primary key

  const { data, error } = await supabase.from('events').insert([{
    id,                                   // 🔴 WAJIB: kirim ke DB
    title: p.title,
    date_iso: p.date_iso,
    venue: p.venue,
    description: p.description ?? '',
    image_url: p.image_url ?? null,
    total_tickets: p.total_tickets,
    listed: !!p.listed,
    promoter_wallet: wallet,
    price_idr: p.price_idr ?? null,               // kalau sudah pakai harga fiat  price_pol: null,        // nggak dipakai lagi, biarkan null, optional
    chain_event_id: p.chain_event_id ?? null      // link ke on-chain event ⬅️ simpan ke DB 25-11-2025
  }]).select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

app.put('/api/events/:id', requireAddress, async (req, res) => {
  const wallet = req.walletAddress
  const user = await ensureUserRow(wallet) // dari step 4

  // 1. ambil event dulu
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()

  if (evErr || !ev) {
    return res.status(404).json({ error: 'event_not_found' })
  }

  // 2. cek apakah dia admin atau pemilik event
  const isAdmin = user.role === 'admin'
  const isOwner = ev.promoter_wallet?.toLowerCase() === wallet

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'bukan_admin_atau_pemilik_event' }) // 'not_event_owner'
  }

  // 3. baru boleh update
  const payload = {
    title: req.body?.title ?? ev.title,
    date_iso: req.body?.date_iso ?? ev.date_iso,
    venue: req.body?.venue ?? ev.venue,
    description: req.body?.description ?? ev.description,
    image_url: req.body?.image_url ?? ev.image_url,
    total_tickets: Number(req.body?.total_tickets ?? ev.total_tickets),
    price_idr: Number(req.body?.price_idr ?? ev.price_idr),
    listed: typeof req.body?.listed === 'boolean' ? req.body.listed : ev.listed, // req.body?.listed ?? ev.listed ini sebelumnya tapi diganti 25-11-2025
    chain_event_id: typeof req.body?.chain_event_id === 'number'
      ? req.body.chain_event_id
      : ev.chain_event_id,  // 25-11-2025
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', ev.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.delete('/api/events/:id', requireAddress, async (req, res) => {
  const wallet = req.walletAddress
  const user = await ensureUserRow(wallet)

  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()

  if (evErr || !ev) {
    return res.status(404).json({ error: 'event_not_found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = ev.promoter_wallet?.toLowerCase() === wallet

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'bukan_admin_atau_pemilik_event' }) // 'not_event_owner'
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', ev.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.patch('/api/events/:id/list', requireAdmin, async (req, res) => {
  const id = String(req.params.id)
  const { listed } = req.body || {}
  if (typeof listed !== 'boolean') return res.status(400).json({ error: 'listed must be boolean' })
  const { data, error } = await supabase.from('events').update({ listed: !!listed }).eq('id', id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
app.get('/api/events/:id', async (req, res) => {
  const id = String(req.params.id)
  const { data: row, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!row) return res.status(404).json({ error: 'Event not found' })
  const addr = getReqAddress(req)
  const admin = await isAdmin(addr)
  if (!row.listed && !admin) return res.status(403).json({ error: 'Unlisted event' })
  res.json(row)
})
app.get('/api/events', async (req, res) => {
  const addr = getReqAddress(req)
  const admin = await isAdmin(addr)
  const wantAll = req.query.all == '1' || req.query.include_unlisted == '1'
  let q = supabase.from('events').select('*').order('date_iso', { ascending: false })
  if (!(admin && wantAll)) q = q.eq('listed', true)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.json({ items: data })
})

// Event milik promoter yang login
app.get('/api/my-events', requireAddress, async (req, res) => {
  const wallet = req.walletAddress
  const user = await ensureUserRow(wallet)

  //hanya promoter yang boleh akses
  if (user.role !== 'promoter') {
    return res.status(403).json({ error: 'forbidden_role', role: user.role })
  }

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('promoter_wallet', wallet)
    .order('date_iso', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ items: data })
})


/* =========================
   PRICE IDR → WEI
   ========================= */
// app.post('/api/price/idr-to-wei', async (req, res) => {
//   try {
//     const amountIdrRaw = req.body?.amount_idr
//     const amountIdr = Number(amountIdrRaw)
//     if (!amountIdr || amountIdr <= 0) {
//       return res.status(400).json({ error: 'amount_idr harus > 0' })
//     }

//     // 1) Ambil harga POL/IDR dari API
//     const idrPerPol = await fetchPolIdrRate()   // contoh: 30_000 IDR per 1 POL

//     // 2) Hitung POL yang dibutuhkan untuk amountIdr
//     //    pol = amountIdr / idrPerPol
//     const polAmount = amountIdr / idrPerPol   // dalam POL

//     // 3) Konversi ke Wei (18 desimal)
//     const wei = BigInt(Math.round(polAmount * 1e18))

//     return res.json({
//       amount_idr: amountIdr,
//       idr_per_pol: idrPerPol,
//       price_wei: wei.toString()
//     })
//   } catch (err) {
//     console.error('ERR /api/price/idr-to-wei', err)
//     return res.status(500).json({ error: 'Gagal konversi IDR ke wei' })
//   }
// })

// app.post('/api/upload', upload.single('file'), async (req, res) => {
//   if (!req.file) return res.status(400).json({ error: 'File kosong' })
//   // sementara, bisa simpan lokal & expose statis, atau upload ke storage lain
//   // contoh paling simple:
//   const url = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}/uploads/${req.file.filename}`
//   res.json({ url })
// })

/* =========================
   TRANSACTIONS (Realtime)
   ========================= */
const topupSchema = z.object({ amount: z.number().positive() })
const purchaseSchema = z.object({
  amount: z.number().positive(),
  quantity: z.number().int().min(1).optional(), // NEW: jumlah tiket per transaksi
  ref_id: z.string().optional(),      // kita pakai sebagai event.id
  description: z.string().optional(),
  tx_hash: z.string().optional()
})

const withdrawSchema = z.object({
  amount: z.number().positive(),      // jumlah POL yang ditarik
  ref_id: z.string().optional(),      // bisa isi event.id
  description: z.string().optional(),
  tx_hash: z.string().optional()      // hash tx di chain (optional tapi bagus)
})

// HTTP server + Socket.IO
const httpServer = http.createServer(app)

let io = null
if (!IS_TEST) {
  io = new IOServer(httpServer, {
    cors: {
      origin(origin, cb) {
        if (!origin) return cb(null, true)
        if (ALLOWLIST.includes(origin)) return cb(null, true)
        if (!IS_PROD && /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin)) return cb(null, true)
        return cb(new Error(`Not allowed by CORS: ${origin}`), false)
      },
      credentials: true
    }
  })

  io.on('connection', (socket) => {
    const addr = normAddr(socket.handshake.auth?.address || socket.handshake.query?.address || '')
    if (isEthAddr(addr)) socket.join(addr)
  })
}

const emitTx = (wallet, tx) => {
  if (!io) return
  if (wallet && tx) io.to(normAddr(wallet)).emit('tx:new', tx)
}


// GET bootstrap — alias /api/transactions dan /transactions
app.get(['/api/transactions', '/transactions'], requireAddress, async (req, res) => {
  const addr = req.walletAddress
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('wallet', addr)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const scanTicketSchema = z.object({
  tx_id: z.string().uuid()
})

// PROMOTER ONLY: scan/redeem tiket (sekali pakai)
app.post('/api/tickets/scan', requireAddress, requireRole(['promoter']), async (req, res) => {
  const promoterWallet = req.walletAddress
  const parsed = scanTicketSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() })
  }

  const txId = parsed.data.tx_id

  // 1) Ambil transaksi
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .maybeSingle()

  if (txErr) return res.status(500).json({ error: txErr.message })
  if (!tx) return res.status(404).json({ error: 'ticket_not_found' })

  // 2) Pastikan ini transaksi pembelian tiket & punya event
  if (String(tx.kind || '').toLowerCase() !== 'purchase') {
    return res.status(400).json({ error: 'not_a_ticket_purchase' })
  }
  if (!tx.ref_id) {
    return res.status(400).json({ error: 'ticket_has_no_event' })
  }

  // 3) Ambil event dan pastikan event milik promoter yg login
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('id,title,venue,date_iso,promoter_wallet')
    .eq('id', tx.ref_id)
    .maybeSingle()

  if (evErr) return res.status(500).json({ error: evErr.message })
  if (!ev) return res.status(404).json({ error: 'event_not_found' })

  if (String(ev.promoter_wallet || '').toLowerCase() !== String(promoterWallet).toLowerCase()) {
    return res.status(403).json({ error: 'forbidden_not_your_event' })
  }

  // 4) UPDATE ATOMIK: hanya sukses kalau scanned masih false
  const nowIso = new Date().toISOString()

  const { data: updatedRows, error: updErr } = await supabase
    .from('transactions')
    .update({
      scanned: true,
      scanned_at: nowIso,
      scanned_by: promoterWallet
    })
    .eq('id', txId)
    .eq('scanned', false) // kunci anti double-scan
    .select()

  if (updErr) return res.status(500).json({ error: updErr.message })

  // tidak ada row ter-update => sudah pernah di-scan
  if (!updatedRows || updatedRows.length === 0) {
    return res.status(409).json({
      ok: false,
      status: 'already_scanned',
      message: 'Tiket ini sudah di-scan dan tidak valid lagi.',
      tx: { id: tx.id, ref_id: tx.ref_id, scanned: true, scanned_at: tx.scanned_at, scanned_by: tx.scanned_by },
      event: ev
    })
  }

  return res.json({
    ok: true,
    status: 'scanned',
    message: 'Tiket valid. Scan berhasil.',
    tx: updatedRows[0],
    event: ev
  })
})



// Buat Scan Kode QR
// PROMOTER ONLY: verify ticket by transaction UUID (from QR)
app.get('/api/tickets/verify/:txId', requireAddress, requireRole(['promoter']), async (req, res) => {
  const wallet = req.walletAddress // promotor yg request
  const txId = String(req.params.txId)
  const expectedEventId = req.query.eventId ? String(req.query.eventId) : null

  // 1) Ambil transaksi
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .maybeSingle()

  if (txErr) return res.status(500).json({ error: txErr.message })
  if (!tx) return res.status(404).json({ error: 'ticket_not_found' })

  // Optional tapi bagus: pastikan ini memang pembelian tiket
  if (String(tx.kind || '').toLowerCase() !== 'purchase') {
    return res.status(400).json({ error: 'not_a_ticket_purchase' })
  }

  // 2) Transaksi harus punya ref_id (event id)
  const eventId = tx.ref_id
  if (!eventId) return res.status(400).json({ error: 'ticket_has_no_event' })

  // 3) Ambil event
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('id,title,date_iso,venue,image_url,promoter_wallet')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr) return res.status(500).json({ error: evErr.message })
  if (!ev) return res.status(404).json({ error: 'event_not_found' })

  // 4) HARD RULE: promotor hanya boleh scan event miliknya
  if (String(ev.promoter_wallet || '').toLowerCase() !== wallet) {
    return res.status(403).json({ error: 'forbidden_not_your_event' })
  }

  // 5) (Opsional) kalau halaman scan memilih event tertentu, pastikan cocok
  if (expectedEventId && expectedEventId !== String(ev.id)) {
    return res.status(403).json({ error: 'forbidden_wrong_event' })
  }

  return res.json({ ok: true, tx, event: ev })
})

// POST topup — alias /api/topup dan /topup
app.post(['/api/topup', '/topup'], requireAddress, async (req, res) => {
  const parsed = topupSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const addr = req.walletAddress
  const tx = { wallet: addr, kind: 'topup', amount: Number(parsed.data.amount), description: 'Top up', status: 'confirmed' }
  const { data, error } = await supabase.from('transactions').insert(tx).select().single()
  if (error) return res.status(500).json({ error: error.message })
  emitTx(addr, data)
  res.json({ ok: true, tx: data })
})

// POST purchase — alias /api/purchase dan /purchase
app.post(['/api/purchase', '/purchase'], requireAddress, async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }

  const addr = req.walletAddress
  const { amount, quantity, ref_id, description, tx_hash } = parsed.data

  // 1) Tentukan qty
  let qty = Number(quantity ?? 0)
  if (!Number.isFinite(qty) || qty < 1) qty = 0

  // 2) Ambil event (kalau ada) untuk validasi quota + ambil harga resmi
  let ev = null
  let unitPriceIdr = 0

  if (ref_id) {
    const { data: evData, error: evErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', ref_id)
      .single()

    if (evErr || !evData) {
      return res.status(400).json({ error: 'Event not found' })
    }
    ev = evData

    const sold = Number(ev.sold_tickets ?? 0)
    const total = Number(ev.total_tickets ?? 0)
    const remaining = total - sold

    if (total <= 0) return res.status(400).json({ error: 'This event has no ticket quota' })
    if (remaining <= 0) return res.status(400).json({ error: 'Tickets sold out' })

    // kalau qty belum dikirim dari frontend, coba infer dari amount
    if (!qty) {
      const unit = Number(ev.price_idr ?? 0) || 0
      if (unit > 0) {
        const inferred = Math.round(Number(amount) / unit)
        if (Number.isFinite(inferred) && inferred >= 1) qty = inferred
      }
    }
    if (!qty) qty = 1

    if (qty > remaining) return res.status(400).json({ error: 'Quantity exceeds remaining tickets' })

    unitPriceIdr = Number(ev.price_idr ?? 0) || 0
    if (unitPriceIdr <= 0) {
      return res.status(400).json({ error: 'Invalid event price' })
    }
  }

  if (!qty) qty = 1
  if (qty > 20) return res.status(400).json({ error: 'quantity_too_large' })

  // 3) Harga per tiket:
  // - pakai price_idr dari event kalau ada
  // - fallback: amount/qty (untuk kompatibilitas)
  if (!unitPriceIdr) {
    unitPriceIdr = Math.max(1, Math.round(Number(amount) / qty))
  }

  // 4) Insert transaksi PER TIKET (supaya:
  //    - UI customer nampilin jumlah tiket bener
  //    - QR scan 1 tiket = 1 row transaksi)
  const txsToInsert = Array.from({ length: qty }, (_, i) => ({
    wallet: addr,
    kind: 'purchase',
    amount: -Math.abs(Number(unitPriceIdr)),
    ref_id: ref_id || null,
    description: (description || 'Ticket purchase') + (qty > 1 ? ` (${i + 1}/${qty})` : ''),
    status: 'confirmed',
    tx_hash: tx_hash || null
  }))

  const { data: inserted, error: insErr } = await supabase
    .from('transactions')
    .insert(txsToInsert)
    .select()

  if (insErr) {
    return res.status(500).json({ error: insErr.message })
  }

  // 5) Update sold_tickets sesuai qty (off-chain counter)
  if (ref_id && ev) {
    const sold = Number(ev.sold_tickets ?? 0)
    const { error: updErr } = await supabase
      .from('events')
      .update({ sold_tickets: sold + qty })
      .eq('id', ref_id)

    if (updErr) {
      // NOTE: tanpa transaksi DB, kita tidak bisa rollback insert dengan aman.
      // Tapi minimal beri error jelas.
      return res.status(500).json({ error: updErr.message })
    }
  }

  // 6) Realtime: kirim SEMUA tiket yang baru dibuat
  if (Array.isArray(inserted)) {
    for (const row of inserted) emitTx(addr, row)
  }

  return res.json({ ok: true, quantity: qty, txs: inserted })
})

// POST withdraw-log — catat penarikan dana (promoter / admin) ke ledger
app.post(['/api/withdraw-log', '/withdraw-log'], requireAddress, async (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }

  const addr = req.walletAddress
  const { amount, ref_id, description, tx_hash } = parsed.data

  const tx = {
    wallet: addr,
    kind: 'withdraw',
    amount: Number(amount),                 // POSITIF → di UI nanti tampil +AMOUNT
    ref_id: ref_id || null,
    description: description || 'Withdraw',
    status: 'confirmed',
    tx_hash: tx_hash || null
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert(tx)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // realtime ke halaman Wallet
  emitTx(addr, data)
  res.json({ ok: true, tx: data })
})

//MIDDLEWARE ROLE//
async function ensureUserRow (wallet) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', wallet)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert({ wallet_address: wallet, role: 'customer' })
      .select()
      .single()
    if (insErr) throw new Error(insErr.message)
    return inserted
  }
  return data
}

function requireRole (roles) {
  const allow = Array.isArray(roles) ? roles : [roles]
  return async (req, res, next) => {
    try {
      const wallet = req.walletAddress
      if (!wallet) return res.status(401).json({ error: 'wallet_required' })
      const user = await ensureUserRow(wallet)
      if (!allow.includes(user.role)) {
        return res.status(403).json({ error: 'forbidden_role', role: user.role })
      }
      req.user = user
      next()
    } catch (e) {
      console.error('requireRole error:', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
}

// POST /api/promoters  { wallet_address }
app.post('/api/promoters', requireAdmin, async (req, res) => {
  const raw = req.body?.wallet_address
  const addr = normAddr(String(raw || ''))
  if (!addr) return res.status(400).json({ error: 'wallet_address required' })

  await ensureUserRow(addr)

  const { data, error } = await supabase
    .from('users')
    .update({ role: 'promoter' })
    .eq('wallet_address', addr)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, user: data })
})

/* =========================
   FALLBACK & ERROR HANDLER
   ========================= */
app.use((req, res) => res.status(404).json({ message: 'Not Found' }))
/// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err && err.stack ? err.stack : err)
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' })
})

export { app, httpServer }
if (!IS_TEST) {
  httpServer.listen(PORT, () => {
    console.log(`[server] API & Socket on http://localhost:${PORT}`)
    console.log(`[server] NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
    console.log(`[server] CORS allowlist: ${ALLOWLIST.length ? ALLOWLIST.join(', ') : '(empty)'}`)
  })
}

