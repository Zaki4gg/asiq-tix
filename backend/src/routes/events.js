// backend/src/routes/events.js
import express from 'express'
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js'

const router = express.Router()

// Dummy data
let EVENTS = [
  { id: 1, title: 'F E A S T', location: 'Donma, Balikpapan', date: '2025-11-10', desc: 'Tur album terbaru.', image: '/hero_fallback.jpg' },
  { id: 2, title: 'Sheila On 7', location: 'Kotaraya Hall, Yogyakarta', date: '2025-11-20', desc: 'Setlist klasik.', image: '/hero_fallback.jpg' },
  { id: 3, title: 'GIGI', location: 'Manakala Hall, Bandung', date: '2026-01-26', desc: 'Format full band.', image: '/hero_fallback.jpg' },
]

// PUBLIC: list
router.get('/events', (_req, res) => res.json(EVENTS))

// PUBLIC: detail
router.get('/events/:id', (req, res) => {
  const id = Number(req.params.id)
  const ev = EVENTS.find(e => e.id === id)
  if (!ev) return res.status(404).json({ message: 'Not found' })
  res.json(ev)
})

// ADMIN: create
router.post('/admin/events', requireAuth, requireAdmin, (req, res) => {
  const id = (EVENTS.at(-1)?.id || 0) + 1
  const ev = { id, ...req.body }
  EVENTS.push(ev)
  res.status(201).json(ev)
})

// ADMIN: update
router.put('/admin/events/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const i = EVENTS.findIndex(e => e.id === id)
  if (i === -1) return res.status(404).json({ message: 'Not found' })
  EVENTS[i] = { ...EVENTS[i], ...req.body, id }
  res.json(EVENTS[i])
})

// ADMIN: delete
router.delete('/admin/events/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const before = EVENTS.length
  EVENTS = EVENTS.filter(e => e.id !== id)
  if (EVENTS.length === before) return res.status(404).json({ message: 'Not found' })
  res.json({ ok: true })
})

export default router
