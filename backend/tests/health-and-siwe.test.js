import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { Wallet } from 'ethers'

// Import setelah NODE_ENV=test aktif via script
import { app } from '../server.js'

describe('Black-box API smoke tests', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.time).toBe('string')
  })

  it('GET /api/nonce rejects invalid address', async () => {
    const res = await request(app).get('/api/nonce').query({ address: 'abc' })
    expect(res.status).toBe(400)
  })

  it('GET /api/nonce + POST /api/verify succeeds with valid signature', async () => {
    const wallet = Wallet.createRandom()

    // 1) minta nonce
    const n = await request(app).get('/api/nonce').query({ address: wallet.address })
    expect(n.status).toBe(200)
    const nonce = n.body.nonce
    expect(typeof nonce).toBe('string')

    // 2) buat message yang memuat address & "Nonce:" (sesuai regex server)
    const message =
      `Login ASIQ-TIX\n` +
      `Address: ${wallet.address}\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${new Date().toISOString()}\n`

    const signature = await wallet.signMessage(message)

    // 3) verify
    const v = await request(app).post('/api/verify').send({ message, signature })
    expect(v.status).toBe(200)
    expect(v.body.ok).toBe(true)
    expect(v.body.address.toLowerCase()).toBe(wallet.address.toLowerCase())
    expect(typeof v.body.token).toBe('string')
  })
})
