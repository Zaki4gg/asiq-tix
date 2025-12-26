import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { Wallet } from 'ethers'
import { createClient } from '@supabase/supabase-js'
import { app } from '../server.js'
import process from 'node:process'

describe.sequential('DB-backed black-box: events, purchase, scan', () => {
  const runId = `vt_${Date.now()}`
  const nowPlusDays = (d) => new Date(Date.now() + d * 86400000).toISOString()

  // Wallets (random -> minim risiko tabrakan data nyata)
  const admin = Wallet.createRandom()
  const promoter1 = Wallet.createRandom()
  const promoter2 = Wallet.createRandom()
  const customer = Wallet.createRandom()

  const adminAddr = admin.address.toLowerCase()
  const promoter1Addr = promoter1.address.toLowerCase()
  const promoter2Addr = promoter2.address.toLowerCase()
  const customerAddr = customer.address.toLowerCase()

  const wallets = [adminAddr, promoter1Addr, promoter2Addr, customerAddr]

  // Supabase service client untuk seed/cleanup/assert DB state
  let sb

  // IDs yang dibuat selama test (buat cleanup)
  const eventIds = []
  const createdTxWallets = new Set([customerAddr]) // transaksi mostly dari customer
  let listedEventId
  let unlistedEventId
  let otherPromoterEventId
  let soldOutEventId

  // tx ids untuk scan test
  let ownTicketTxId
  let otherEventTicketTxId

  const mustEnv = (k) => {
    const v = process.env[k]
    if (!v) throw new Error(`Missing env ${k}. Pastikan backend/.env.test berisi ${k}.`)
    return v
  }

  async function seedAdmin() {
    const { error } = await sb.from('admins').upsert(
      { address: adminAddr, note: `vitest:${runId}` },
      { onConflict: 'address' }
    )
    if (error) throw new Error(`seed admins failed: ${error.message}`)
  }

  async function promote(address) {
    const res = await request(app)
      .post('/api/promoters')
      .set('x-wallet-address', adminAddr)
      .send({ wallet_address: address })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body.user.wallet_address.toLowerCase()).toBe(address.toLowerCase())
    expect(res.body.user.role).toBe('promoter')
  }

  async function createEventAs(promoterAddress, overrides = {}) {
    const payload = {
      title: `VT Event ${runId}`,
      date_iso: nowPlusDays(7),
      venue: 'VT Venue',
      description: 'vitest seeded event',
      price_idr: 10_000,
      total_tickets: 5,
      listed: true,
      ...overrides
    }

    const res = await request(app)
      .post('/api/events')
      .set('x-wallet-address', promoterAddress)
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.title).toBe(payload.title)

    eventIds.push(res.body.id)
    return res.body
  }

  async function purchase({ walletAddress, eventId, qty, unitPrice }) {
    const amount = unitPrice * qty
    const res = await request(app)
      .post('/api/purchase')
      .set('x-wallet-address', walletAddress)
      .send({
        amount,
        quantity: qty,
        ref_id: eventId,
        description: `vt purchase ${runId}`
      })

    return res
  }

  beforeAll(async () => {
    const url = mustEnv('SUPABASE_URL')
    const serviceKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY')

    sb = createClient(url, serviceKey, { auth: { persistSession: false } })

    // 1) seed admin
    await seedAdmin()

    // 2) promote promoters via API (black-box, lewat endpoint)
    await promote(promoter1Addr)
    await promote(promoter2Addr)

    // 3) create events
    const listed = await createEventAs(promoter1Addr, {
      title: `VT Listed ${runId}`,
      listed: true,
      total_tickets: 5,
      price_idr: 10_000
    })
    listedEventId = listed.id

    const unlisted = await createEventAs(promoter1Addr, {
      title: `VT Unlisted ${runId}`,
      listed: false,
      total_tickets: 5,
      price_idr: 12_000
    })
    unlistedEventId = unlisted.id

    const other = await createEventAs(promoter2Addr, {
      title: `VT OtherPromoter ${runId}`,
      listed: true,
      total_tickets: 2,
      price_idr: 15_000
    })
    otherPromoterEventId = other.id

    const soldout = await createEventAs(promoter1Addr, {
      title: `VT SoldOut ${runId}`,
      listed: true,
      total_tickets: 1,
      price_idr: 9_000
    })
    soldOutEventId = soldout.id
  })

  afterAll(async () => {
    if (!sb) return

    // cleanup transactions by involved wallets (safe karena random)
    try {
      await sb.from('transactions').delete().in('wallet', Array.from(createdTxWallets))
    } catch {
      // ignore
    }

    // cleanup events by ids created in this run
    try {
      if (eventIds.length) await sb.from('events').delete().in('id', eventIds)
    } catch {
      // ignore
    }

    // cleanup users
    try {
      await sb.from('users').delete().in('wallet_address', wallets)
    } catch {
      // ignore
    }

    // cleanup admin row
    try {
      await sb.from('admins').delete().eq('address', adminAddr)
    } catch {
      // ignore
    }
  })

  /* =========================
     EVENTS
     ========================= */
  it('GET /api/events (anon) returns listed event, hides unlisted', async () => {
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('items')
    const items = res.body.items || []

    expect(items.some(e => e.id === listedEventId)).toBe(true)
    expect(items.some(e => e.id === unlistedEventId)).toBe(false)
  })

  it('GET /api/events?all=1 as admin includes unlisted', async () => {
    const res = await request(app)
      .get('/api/events')
      .query({ all: '1' })
      .set('x-wallet-address', adminAddr)

    expect(res.status).toBe(200)
    const items = res.body.items || []

    expect(items.some(e => e.id === listedEventId)).toBe(true)
    expect(items.some(e => e.id === unlistedEventId)).toBe(true)
  })

  it('GET /api/events/:id for unlisted as anon -> 403', async () => {
    const res = await request(app).get(`/api/events/${unlistedEventId}`)
    expect(res.status).toBe(403)
  })

  it('GET /api/events/:id for unlisted as admin -> 200', async () => {
    const res = await request(app)
      .get(`/api/events/${unlistedEventId}`)
      .set('x-wallet-address', adminAddr)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(unlistedEventId)
  })

  /* =========================
     PURCHASE
     ========================= */
  it('POST /api/purchase quantity > 20 -> 400', async () => {
    const res = await request(app)
      .post('/api/purchase')
      .set('x-wallet-address', customerAddr)
      .send({ amount: 210_000, quantity: 21 })

    expect(res.status).toBe(400)
  })

  it('POST /api/purchase success qty=3 creates 3 tx rows and increments sold_tickets', async () => {
    const unit = 10_000
    const res = await purchase({ walletAddress: customerAddr, eventId: listedEventId, qty: 3, unitPrice: unit })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body).toHaveProperty('quantity', 3)
    expect(Array.isArray(res.body.txs)).toBe(true)
    expect(res.body.txs.length).toBe(3)

    // simpan satu tx id untuk scan test
    ownTicketTxId = res.body.txs[0]?.id
    expect(typeof ownTicketTxId).toBe('string')

    // tiap tx harus ref_id = event id
    for (const t of res.body.txs) {
      expect(t.kind).toBe('purchase')
      expect(t.ref_id).toBe(listedEventId)
      // amount per tiket harus -unit price (server Anda simpan negatif)
      expect(Number(t.amount)).toBe(-unit)
    }

    // cek sold_tickets di DB
    const { data: ev, error } = await sb
      .from('events')
      .select('id,sold_tickets')
      .eq('id', listedEventId)
      .single()

    if (error) throw new Error(error.message)
    expect(ev.sold_tickets).toBeGreaterThanOrEqual(3)
  })

  it('POST /api/purchase sold-out event -> second purchase returns 400', async () => {
    // purchase pertama (qty=1) sukses
    const r1 = await purchase({ walletAddress: customerAddr, eventId: soldOutEventId, qty: 1, unitPrice: 9_000 })
    expect(r1.status).toBe(200)
    expect(r1.body.ok).toBe(true)

    // purchase kedua harus gagal sold out
    const r2 = await purchase({ walletAddress: customerAddr, eventId: soldOutEventId, qty: 1, unitPrice: 9_000 })
    expect(r2.status).toBe(400)
  })

  it('POST /api/purchase qty exceeds remaining -> 400', async () => {
    // buat 1 ticket dulu pada event promoter2 (total 2)
    const r1 = await purchase({ walletAddress: customerAddr, eventId: otherPromoterEventId, qty: 1, unitPrice: 15_000 })
    expect(r1.status).toBe(200)
    otherEventTicketTxId = r1.body.txs?.[0]?.id
    expect(typeof otherEventTicketTxId).toBe('string')

    // sekarang remaining harus 1, request qty=2 harus gagal
    const r2 = await purchase({ walletAddress: customerAddr, eventId: otherPromoterEventId, qty: 2, unitPrice: 15_000 })
    expect(r2.status).toBe(400)
  })

  /* =========================
     SCAN (PROMOTER)
     ========================= */
  it('POST /api/tickets/scan (own event) -> 200 scanned', async () => {
    const res = await request(app)
      .post('/api/tickets/scan')
      .set('x-wallet-address', promoter1Addr)
      .send({ tx_id: ownTicketTxId })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body).toHaveProperty('status', 'scanned')
    expect(res.body.tx.id).toBe(ownTicketTxId)
  })

  it('POST /api/tickets/scan same ticket again -> 409 already_scanned', async () => {
    const res = await request(app)
      .post('/api/tickets/scan')
      .set('x-wallet-address', promoter1Addr)
      .send({ tx_id: ownTicketTxId })

    expect(res.status).toBe(409)
    expect(res.body).toHaveProperty('status', 'already_scanned')
  })

  it('POST /api/tickets/scan ticket for other promoter event -> 403', async () => {
    const res = await request(app)
      .post('/api/tickets/scan')
      .set('x-wallet-address', promoter1Addr)
      .send({ tx_id: otherEventTicketTxId })

    expect(res.status).toBe(403)
  })

  it('GET /api/tickets/verify/:txId (own event) -> 200 ok', async () => {
    const res = await request(app)
      .get(`/api/tickets/verify/${ownTicketTxId}`)
      .set('x-wallet-address', promoter1Addr)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body.tx.id).toBe(ownTicketTxId)
  })

  it('GET /api/tickets/verify/:txId with wrong eventId query -> 403', async () => {
    const res = await request(app)
      .get(`/api/tickets/verify/${ownTicketTxId}`)
      .query({ eventId: otherPromoterEventId }) // sengaja salah
      .set('x-wallet-address', promoter1Addr)

    expect(res.status).toBe(403)
  })
})
