// backend/src/middleware/requireAuth.js
import { verifyToken } from '../lib/jwt.js'

function getBearer(req) {
  const auth = req.headers.authorization || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}

export function requireAuth(req, res, next) {
  try {
    const token = getBearer(req) || req.cookies?.token
    if (!token) return res.status(401).json({ message: 'Unauthorized' })
    const payload = verifyToken(token)
    req.user = payload
    return next()
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

export function requireRole(needed) {
  return (req, res, next) => {
    const roles = req.user?.roles || []
    if (!roles.includes(needed)) {
      return res.status(403).json({ message: 'Forbidden: require role ' + needed })
    }
    return next()
  }
}

export const requireAdmin = requireRole('admin')
