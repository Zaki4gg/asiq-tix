import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { Wallet } from 'ethers'
import { app } from '../server.js'

describe('SIWE-lite negative cases (black-box)', () => {
  it('POST /api/verify rejects missing body', async () => {
    const res = await request(app).post('/api/verify').send({})
    expect(res.status).toBe(400)
  })

  it('POST /api/verify rejects bad signature', async () => {
    const wallet = Wallet.createRandom()
    const n = await request(app).get('/api/nonce').query({ address: wallet.address })
    expect(n.status).toBe(200)

    const nonce = n.body.nonce
    const message = `Login\nAddress: ${wallet.address}\nNonce: ${nonce}\n`
    const badSig = '0x' + '11'.repeat(65) // signature palsu

    const v = await request(app).post('/api/verify').send({ message, signature: badSig })
    expect(v.status).toBe(400) // "bad signature"
  })

  it('POST /api/verify rejects address mismatch (signature dari wallet lain)', async () => {
    const w1 = Wallet.createRandom()
    const w2 = Wallet.createRandom()

    const n = await request(app).get('/api/nonce').query({ address: w1.address })
    expect(n.status).toBe(200)

    const nonce = n.body.nonce
    const message = `Login\nAddress: ${w1.address}\nNonce: ${nonce}\n`
    const sigFromOtherWallet = await w2.signMessage(message)

    const v = await request(app).post('/api/verify').send({ message, signature: sigFromOtherWallet })
    expect(v.status).toBe(401) // "address mismatch"
  })

  it('POST /api/verify rejects reused nonce', async () => {
    const wallet = Wallet.createRandom()

    const n = await request(app).get('/api/nonce').query({ address: wallet.address })
    expect(n.status).toBe(200)

    const nonce = n.body.nonce
    const message = `Login\nAddress: ${wallet.address}\nNonce: ${nonce}\n`
    const sig = await wallet.signMessage(message)

    const v1 = await request(app).post('/api/verify').send({ message, signature: sig })
    expect(v1.status).toBe(200)

    const v2 = await request(app).post('/api/verify').send({ message, signature: sig })
    expect(v2.status).toBe(400) // nonce sudah dihapus => invalid/expired nonce
  })
})
