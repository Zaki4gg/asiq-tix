import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { Wallet } from 'ethers'
import { app } from '../server.js'

describe('Nonce endpoint contract (black-box)', () => {
  it('GET /api/nonce without address -> 400', async () => {
    const res = await request(app).get('/api/nonce')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('GET /api/nonce returns nonce and expires_in', async () => {
    const w = Wallet.createRandom()
    const res = await request(app).get('/api/nonce').query({ address: w.address })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('nonce')
    expect(res.body).toHaveProperty('expires_in')

    expect(typeof res.body.nonce).toBe('string')
    expect(res.body.nonce.length).toBeGreaterThanOrEqual(8) // nanoid(16) biasanya 16, tapi jangan terlalu kaku
    expect(typeof res.body.expires_in).toBe('number')
    expect(res.body.expires_in).toBeGreaterThan(0)
  })

  it('GET /api/nonce accepts checksum address (mixed case)', async () => {
    const w = Wallet.createRandom() // address biasanya checksum (mixed-case)
    const res = await request(app).get('/api/nonce').query({ address: w.address })
    expect(res.status).toBe(200)
    expect(typeof res.body.nonce).toBe('string')
  })

  it('GET /api/nonce called twice gives a new nonce (same address)', async () => {
    const w = Wallet.createRandom()

    const r1 = await request(app).get('/api/nonce').query({ address: w.address })
    expect(r1.status).toBe(200)

    const r2 = await request(app).get('/api/nonce').query({ address: w.address })
    expect(r2.status).toBe(200)

    expect(r1.body.nonce).not.toBe(r2.body.nonce)
  })
})
