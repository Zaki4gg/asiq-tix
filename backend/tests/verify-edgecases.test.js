import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { Wallet } from 'ethers'
import { app } from '../server.js'

describe('SIWE-lite verify edge cases (black-box)', () => {
  it('POST /api/verify rejects message without address -> 400', async () => {
    const message = `Login\nNonce: abcdef12345\n`
    const signature = '0x' + '11'.repeat(65)

    const res = await request(app).post('/api/verify').send({ message, signature })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('POST /api/verify rejects message without "Nonce:" line -> 400', async () => {
    const w = Wallet.createRandom()

    const n = await request(app).get('/api/nonce').query({ address: w.address })
    expect(n.status).toBe(200)

    // sengaja tidak menuliskan "Nonce:" (regex server butuh itu)
    const message = `Login\nAddress: ${w.address}\nIssued At: ${new Date().toISOString()}\n`
    const sig = await w.signMessage(message)

    const res = await request(app).post('/api/verify').send({ message, signature: sig })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('POST /api/verify rejects nonce mismatch -> 400', async () => {
    const w = Wallet.createRandom()

    const n = await request(app).get('/api/nonce').query({ address: w.address })
    expect(n.status).toBe(200)

    // nonce sengaja dibikin beda dari yang server keluarkan
    const wrongNonce = 'WRONG_NONCE_123456'
    const message = `Login\nAddress: ${w.address}\nNonce: ${wrongNonce}\n`
    const sig = await w.signMessage(message)

    const res = await request(app).post('/api/verify').send({ message, signature: sig })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('POST /api/verify rejects verify without requesting nonce first -> 400', async () => {
    const w = Wallet.createRandom()

    // tidak panggil /api/nonce
    const message = `Login\nAddress: ${w.address}\nNonce: SOMENONCE_123456\n`
    const sig = await w.signMessage(message)

    const res = await request(app).post('/api/verify').send({ message, signature: sig })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('message')
  })
})
