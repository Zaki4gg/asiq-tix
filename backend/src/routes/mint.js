// backend/src/routes/mint.js
import express from 'express'
import { requireAuth } from '../middleware/requireAuth.js'

const router = express.Router()

// Example mint endpoint (stub)
// POST /api/mint { eventId, tier }
router.post('/', requireAuth, async (req, res) => {
  const { eventId, tier } = req.body || {}
  if (!eventId || !tier) {
    return res.status(400).json({ message: 'eventId & tier required' })
  }
  // TODO: integrate with smart contract / viem
  // Return a dummy tx hash for now
  const txHash = '0x' + Math.random().toString(16).slice(2).padEnd(64, '0')
  return res.json({ status: 'submitted', txHash })
})

export default router
