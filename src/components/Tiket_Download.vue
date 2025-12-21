<script setup>
import { ref } from 'vue'

const props = defineProps({
  // id event di database (ref_id di tabel transactions)
  eventId: {
    type: [String, Number],
    default: null
  },
  // kode tiket / booking (boleh dari ref_id, ticket_id, dll)
  ticketCode: {
    type: String,
    default: ''
  },
  // fallback kalau data event gagal di-load
  fallbackTitle: {
    type: String,
    default: 'Tiket AsiqTIX'
  },
  fallbackDate: {
    type: [String, Number, Date],
    default: ''
  },
  fallbackLocation: {
    type: String,
    default: ''
  },
  fallbackBannerUrl: {
    type: String,
    default: ''
  }
})

const loading = ref(false)

const RAW_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
// asumsi backend seperti yg lain: base + /api/...
const API_BASE = `${RAW_BASE}/api`

function fmtTicketDate (input) {
  if (!input) return '-'
  try {
    const d = typeof input === 'string' || typeof input === 'number'
      ? new Date(input)
      : input
    if (!Number.isFinite(d.getTime())) return '-'
    const day = d.toLocaleDateString('id-ID', { weekday: 'long' }).toUpperCase()
    const date = d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    })
    const time = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/\./g, ':')

    return `${day}, ${date} - ${time}`
  } catch {
    return '-'
  }
}

function drawRoundedRect (ctx, x, y, width, height, radius) {
  let r = radius
  if (typeof r === 'number') {
    r = { tl: r, tr: r, br: r, bl: r }
  } else {
    r = {
      tl: r.tl || 0,
      tr: r.tr || 0,
      br: r.br || 0,
      bl: r.bl || 0
    }
  }
  ctx.beginPath()
  ctx.moveTo(x + r.tl, y)
  ctx.lineTo(x + width - r.tr, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r.tr)
  ctx.lineTo(x + width, y + height - r.br)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height)
  ctx.lineTo(x + r.bl, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r.bl)
  ctx.lineTo(x, y + r.tl)
  ctx.quadraticCurveTo(x, y, x + r.tl, y)
  ctx.closePath()
}

async function handleClick () {
  if (loading.value) return
  loading.value = true

  try {
    // 1) Ambil data event dari backend (kalau ada eventId)
    let meta = null
    if (props.eventId) {
      try {
        const res = await fetch(`${API_BASE}/events/${props.eventId}`)
        const data = await res.json().catch(() => null)
        if (res.ok) meta = data
      } catch (e) {
        console.warn('[TicketDownloadButton] gagal load event meta', e)
      }
    }

    const title = meta?.title || props.fallbackTitle || 'Tiket AsiqTIX'
    const location = meta?.venue || meta?.location || props.fallbackLocation || '-'
    const dateIso = meta?.date_iso || null
    const bannerUrl = meta?.image_url || meta?.poster_url || meta?.banner_url || props.fallbackBannerUrl || ''
    const timeText = fmtTicketDate(dateIso || props.fallbackDate)
    const ticketId = props.ticketCode || meta?.id || props.eventId || '-'

    await generateTicketImage({
      title,
      location,
      timeText,
      ticketId,
      bannerUrl
    })
  } catch (e) {
    console.error('[TicketDownloadButton] gagal generate tiket', e)
    alert('Gagal membuat file tiket. Silakan coba lagi.')
  } finally {
    loading.value = false
  }
}

async function generateTicketImage ({ title, location, timeText, ticketId, bannerUrl }) {
  const width = 1200
  const height = 560

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia')

  const bgCream = '#f7f0d6'
  const navy = '#1f2347'
  const textColor = '#fdfdfd'

  // background luar krem
  ctx.fillStyle = bgCream
  ctx.fillRect(0, 0, width, height)

  // kartu navy sesuai template
  const cardX = 30
  const cardY = 30
  const cardW = width - 60
  const cardH = height - 60
  const cardR = 50

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, cardR)
  ctx.fillStyle = navy
  ctx.fill()

  const padding = 40
  const imgBoxSize = cardH - padding * 2
  const imgX = cardX + padding
  const imgY = cardY + padding

  const textX = imgX + imgBoxSize + 40
  const textYStart = imgY + 10
  const lineHeight = 42

  // ----- gambar banner di kiri -----
  if (bannerUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = bannerUrl

    await new Promise(resolve => {
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
    })

    ctx.save()
    drawRoundedRect(ctx, imgX, imgY, imgBoxSize, imgBoxSize, 30)
    ctx.clip()
    ctx.drawImage(img, imgX, imgY, imgBoxSize, imgBoxSize)
    ctx.restore()
  } else {
    ctx.save()
    drawRoundedRect(ctx, imgX, imgY, imgBoxSize, imgBoxSize, 30)
    ctx.clip()
    ctx.fillStyle = '#333a60'
    ctx.fillRect(imgX, imgY, imgBoxSize, imgBoxSize)
    ctx.fillStyle = '#cbd2ff'
    ctx.font = '24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"'
    ctx.fillText('NO POSTER', imgX + 40, imgY + imgBoxSize / 2)
    ctx.restore()
  }

  // ----- teks di kanan -----
  ctx.fillStyle = textColor

  const titleLine = `"${title}"`
  ctx.font = '28px "Segoe UI", system-ui, -apple-system, sans-serif'
  ctx.fillText(titleLine, textX, textYStart + lineHeight * 0.7)

  ctx.font = '22px "Segoe UI", system-ui, -apple-system, sans-serif'

  const yId = textYStart + lineHeight * 2.0
  const yPlace = yId + lineHeight * 1.1
  const yTime = yPlace + lineHeight * 1.1

  ctx.fillText('ID', textX, yId)
  ctx.fillText(String(ticketId), textX + 140, yId)

  ctx.fillText('TEMPAT', textX, yPlace)
  ctx.fillText(location || '-', textX + 140, yPlace)

  ctx.fillText('WAKTU', textX, yTime)
  ctx.fillText(timeText || '-', textX + 140, yTime)

  // ----- trigger download -----
  const safeTitle = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const link = document.createElement('a')
  link.download = `ticket-${safeTitle || 'asiqtix'}-${ticketId}.png`
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <button
    type="button"
    class="btn ticket-download-btn"
    :disabled="loading"
    @click="handleClick"
  >
    <span v-if="loading">Mengunduh…</span>
    <span v-else>DOWNLOAD TICKET</span>
  </button>
</template>


