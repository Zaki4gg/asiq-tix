import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../server.js'

describe('Routing & CORS (black-box)', () => {
  it('GET unknown route -> 404 Not Found JSON', async () => {
    const res = await request(app).get('/api/this-route-should-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('message')
  })

  it('POST /api/health (not defined) -> 404', async () => {
    const res = await request(app).post('/api/health').send({})
    expect(res.status).toBe(404)
  })

  it('OPTIONS preflight to /api/health from allowed origin -> 204', async () => {
    // default allowlist dev biasanya mengizinkan localhost:5173
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')

    expect(res.status).toBe(204)
    // header CORS biasanya ada jika origin di-allow
    // tidak semua implementasi selalu set header ini pada OPTIONS, tapi umumnya iya:
    expect(res.headers).toHaveProperty('access-control-allow-origin')
  })
})
