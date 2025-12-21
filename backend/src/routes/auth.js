// backend/src/routes/auth.js
import express from 'express'
import { randomBytes } from 'crypto'
import { SiweMessage } from 'siwe'

// ⬇️ PAKAI STRIP (nonce-store), sesuai nama folder Anda
import { setNonce, getNonce, deleteNonce } from '../lib/nonce-store/index.js'

const router = express.Router()

const norm = s => String(s || '').trim().toLowerCase()
const isEth = a => /^0x[a-f0-9]{40}$/.test(norm(a))

// GET /api/nonce?address=0x...
router.get('/nonce', async (req, res) => {
  try {
    const addr = norm(req.query?.address || req.query?.addr || '')
    if (!isEth(addr)) return res.status(400).json({ message: 'Parameter address tidak valid' })

    const nonce = randomBytes(16).toString('hex')
    await setNonce(addr, nonce)   // jika gagal, akan tertangkap catch di bawah
    return res.json({ nonce })
  } catch (e) {
    console.error('[auth:/nonce] error:', e)
    return res.status(500).json({ message: 'Gagal membuat nonce' })
  }
})

// POST /api/verify  { message, signature }
router.post('/verify', async (req, res) => {
  try {
    const { message, signature } = req.body || {}
    if (!message || !signature) {
      return res.status(400).json({ message: 'message & signature required' })
    }
    const siwe = new SiweMessage(message)
    const { data } = await siwe.verify({ signature })

    const addr = norm(data.address)
    if (!isEth(addr)) return res.status(400).json({ message: 'Alamat wallet tidak valid' })

    const expected = await getNonce(addr)
    if (!expected || expected !== data.nonce) {
      return res.status(400).json({ message: 'Invalid or expired nonce' })
    }
    await deleteNonce(addr)

    // TODO: ganti dengan JWT sesungguhnya
    return res.json({ message: 'ok', address: data.address, chainId: data.chainId, token: 'dev.jwt' })
  } catch (e) {
    console.error('[auth:/verify] error:', e)
    return res.status(400).json({ message: 'Verify failed' })
  }
})

export default router
