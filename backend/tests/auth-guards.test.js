import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../server.js'

describe('Auth guards (black-box)', () => {
  it('GET /api/me without x-wallet-address -> 401', async () => {
    const res = await request(app).get('/api/me')
    expect(res.status).toBe(401)
  })

  it('GET /api/transactions without x-wallet-address -> 401', async () => {
    const res = await request(app).get('/api/transactions')
    expect(res.status).toBe(401)
  })

  it('POST /api/topup without x-wallet-address -> 401', async () => {
    const res = await request(app).post('/api/topup').send({ amount: 1 })
    expect(res.status).toBe(401)
  })
})
