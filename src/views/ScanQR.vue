<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { BrowserQRCodeReader } from '@zxing/browser'
import SideNavSB from '@/components/SideNavSB.vue'

const RAW_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_BASE = `${RAW_BASE}/api`

const videoEl = ref(null)

const scanning = ref(false)
const cameras = ref([])
const selectedDeviceId = ref('')

const decodedText = ref('')
const txId = ref('')
const verifyStatus = ref('') // '', 'valid', 'used', 'invalid'
const tx = ref(null)
const eventMeta = ref(null)

const errorMsg = ref('')
const infoMsg = ref('')

const reader = new BrowserQRCodeReader()
let controls = null

function wallet() {
  return (localStorage.getItem('walletAddress') || '').toString().toLowerCase().trim()
}

function pickDefaultCamera(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const preferred = list.find(d => /back|rear|environment/i.test(d.label || ''))
  return (preferred || list[0]).deviceId
}

async function refreshCameras() {
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const list = await BrowserQRCodeReader.listVideoInputDevices()
    cameras.value = list || []
    if (!selectedDeviceId.value) {
      selectedDeviceId.value = pickDefaultCamera(cameras.value)
    } else {
      const stillExists = cameras.value.some(d => d.deviceId === selectedDeviceId.value)
      if (!stillExists) selectedDeviceId.value = pickDefaultCamera(cameras.value)
    }
  } catch {
    errorMsg.value = 'Gagal membaca daftar kamera. Pastikan izin kamera diaktifkan.'
  }
}

function parseTxIdFromQr(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''

  // 1) URL dengan ?tx=...
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      const t = u.searchParams.get('tx')
      if (t) return t.trim()
    }
  } catch {
    // ignore
  }

  // 2) UUID langsung
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRe.test(raw)) return raw

  // 3) fallback (kalau kamu encode token lain)
  return raw
}

/**
 * SCAN = REDEEM (sekali pakai)
 * Backend: POST /api/tickets/scan { tx_id }
 * - 200: scanned (valid & berhasil)
 * - 409: already_scanned (tidak valid lagi)
 * - 403: bukan promoter / bukan event miliknya
 */
async function scanTicketRedeem(id) {
  tx.value = null
  eventMeta.value = null
  verifyStatus.value = ''
  errorMsg.value = ''
  infoMsg.value = 'Memproses scan tiket…'

  const w = wallet()
  if (!w) {
    verifyStatus.value = 'invalid'
    infoMsg.value = ''
    errorMsg.value = 'Wallet tidak ditemukan. Login/koneksikan MetaMask dulu.'
    return
  }

  try {
    const res = await fetch(`${API_BASE}/tickets/scan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-wallet-address': w
      },
      body: JSON.stringify({ tx_id: id })
    })

    const data = await res.json().catch(() => null)

    // Tiket sudah pernah dipakai
    if (res.status === 409) {
      verifyStatus.value = 'used'
      infoMsg.value = ''
      errorMsg.value = data?.message || 'Tiket ini sudah di-scan dan tidak valid lagi.'
      tx.value = data?.tx || null
      eventMeta.value = data?.event || null
      return
    }

    // Error lain (403/404/400)
    if (!res.ok) {
      verifyStatus.value = 'invalid'
      infoMsg.value = ''
      errorMsg.value = data?.error || data?.message || 'Scan gagal.'
      return
    }

    // Sukses scan
    verifyStatus.value = 'valid'
    infoMsg.value = data?.message || 'Tiket valid. Scan berhasil.'
    tx.value = data?.tx || null
    eventMeta.value = data?.event || null
  } catch {
    verifyStatus.value = 'invalid'
    infoMsg.value = ''
    errorMsg.value = 'Gagal scan. Cek koneksi atau endpoint backend.'
  }
}

async function startScan() {
  if (scanning.value) return

  errorMsg.value = ''
  infoMsg.value = ''
  decodedText.value = ''
  txId.value = ''
  verifyStatus.value = ''
  tx.value = null
  eventMeta.value = null

  if (!videoEl.value) {
    errorMsg.value = 'Elemen video tidak tersedia.'
    return
  }

  if (!selectedDeviceId.value) {
    await refreshCameras()
  }

  scanning.value = true
  infoMsg.value = 'Arahkan kamera ke QR code…'

  try {
    controls = await reader.decodeFromVideoDevice(
      selectedDeviceId.value || undefined,
      videoEl.value,
      async (result) => {
        if (!result) return

        const text = result.getText()
        decodedText.value = text

        const id = parseTxIdFromQr(text)
        txId.value = id

        // stop setelah 1 scan (hindari spam)
        stopScan()

        if (id) {
          await scanTicketRedeem(id)
        } else {
          verifyStatus.value = 'invalid'
          infoMsg.value = ''
          errorMsg.value = 'QR terbaca, tapi tidak ada Transaction ID yang valid.'
        }
      }
    )
  } catch {
    scanning.value = false
    infoMsg.value = ''
    errorMsg.value = 'Gagal memulai kamera. Pastikan izin kamera sudah diberikan.'
  }
}

function stopScan() {
  if (controls) {
    try { controls.stop() } catch { /* ignore */ }
    controls = null
  }
  scanning.value = false
}

function reset() {
  decodedText.value = ''
  txId.value = ''
  verifyStatus.value = ''
  tx.value = null
  eventMeta.value = null
  errorMsg.value = ''
  infoMsg.value = ''
}

onMounted(async () => {
  await refreshCameras()
})

onUnmounted(() => {
  stopScan()
})
</script>

<template>
  <div class="scan-page">
    <header class="topbar">
      <h1 class="title">Scan Ticket QR</h1>
      <div class="actions">
        <button class="btn" :disabled="scanning" @click="startScan">Start</button>
        <button class="btn danger" :disabled="!scanning" @click="stopScan">Stop</button>
        <button class="hamburger" aria-label="Toggle menu" @click="toggleSidebar">
        <span /><span /><span />
      </button>
      </div>
    </header>
    
    <!-- posisikan sidebar di kanan atas -->
    <SideNavSB v-model="sidebarOpen" extraClass="sb-topright" />

    <main class="content">
      <section class="camera">
        <div class="row">
          <label class="label">Camera</label>
          <select class="select" v-model="selectedDeviceId" :disabled="scanning || cameras.length === 0">
            <option v-for="c in cameras" :key="c.deviceId" :value="c.deviceId">
              {{ c.label || `Camera ${c.deviceId.slice(0, 6)}…` }}
            </option>
          </select>
          <button class="btn secondary" :disabled="scanning" @click="refreshCameras">Refresh</button>
        </div>

        <div class="video-wrap">
          <video ref="videoEl" class="video" autoplay playsinline muted></video>
          <div v-if="!scanning" class="overlay">Klik Start untuk mulai scan</div>
        </div>

        <p class="hint">
          Catatan: akses kamera umumnya hanya berjalan di HTTPS atau localhost.
        </p>
      </section>

      <section class="result">
        <h2>Hasil</h2>

        <div v-if="errorMsg" class="alert error">{{ errorMsg }}</div>
        <div v-else-if="infoMsg" class="alert">{{ infoMsg }}</div>

        <div class="box">
          <div class="kv">
            <div class="k">QR Text</div>
            <div class="v mono">{{ decodedText || '—' }}</div>
          </div>

          <div class="kv">
            <div class="k">Transaction ID</div>
            <div class="v mono">{{ txId || '—' }}</div>
          </div>

          <div class="kv">
            <div class="k">Status</div>
            <div class="v">
              <span v-if="verifyStatus === 'valid'" class="pill ok">VALID</span>
              <span v-else-if="verifyStatus === 'used'" class="pill bad">SUDAH DIPAKAI</span>
              <span v-else-if="verifyStatus === 'invalid'" class="pill bad">INVALID</span>
              <span v-else class="pill">—</span>
            </div>
          </div>

          <div v-if="tx" class="tx">
            <h3>Detail Transaksi</h3>
            <div class="grid">
              <div><strong>ID</strong></div><div class="mono">{{ tx.id }}</div>
              <div><strong>Kind</strong></div><div>{{ tx.kind }}</div>
              <div><strong>Status</strong></div><div>{{ tx.status }}</div>
              <div><strong>Wallet</strong></div><div class="mono">{{ tx.wallet }}</div>
              <div><strong>Amount</strong></div><div>{{ tx.amount }}</div>
              <div><strong>Created</strong></div><div>{{ tx.created_at }}</div>
              <div><strong>Event Ref</strong></div><div class="mono">{{ tx.ref_id || '—' }}</div>

              <div v-if="tx.scanned !== undefined"><strong>Scanned</strong></div>
              <div v-if="tx.scanned !== undefined">{{ String(tx.scanned) }}</div>

              <div v-if="tx.scanned_at"><strong>Scanned At</strong></div>
              <div v-if="tx.scanned_at" class="mono">{{ tx.scanned_at }}</div>

              <div v-if="tx.scanned_by"><strong>Scanned By</strong></div>
              <div v-if="tx.scanned_by" class="mono">{{ tx.scanned_by }}</div>
            </div>
          </div>

          <div v-if="eventMeta" class="tx">
            <h3>Detail Event</h3>
            <div class="grid">
              <div><strong>Title</strong></div><div>{{ eventMeta.title }}</div>
              <div><strong>Date</strong></div><div>{{ eventMeta.date_iso }}</div>
              <div><strong>Venue</strong></div><div>{{ eventMeta.venue }}</div>
              <div><strong>ID</strong></div><div class="mono">{{ eventMeta.id }}</div>
            </div>
          </div>
        </div>

        <div class="row">
          <button class="btn secondary" @click="reset">Reset</button>
        </div>
      </section>
    </main>
  </div>
</template>


<style scoped>
.scan-page { padding: 16px; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
.title { margin:0; font-size:20px; }
.actions { display:flex; gap:8px; }
.content { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }

.camera, .result {
  background:#fff;
  border-radius:12px;
  padding:16px;
  border:1px solid #eee;
  color: #0b0d12;
}
.camera h2, .result h2, .label, .k { color: #0b0d12; }
.hint { color: #555; }

.row { display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
.label { font-weight:600; }
.select { padding:8px; border-radius:8px; border:1px solid #ddd; min-width:260px; }

.video-wrap { position:relative; width:100%; aspect-ratio: 16/9; background:#111; border-radius:12px; overflow:hidden; }
.video { width:100%; height:100%; object-fit:cover; }
.overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; background:rgba(0,0,0,.35); }

.hint { color:#666; margin:10px 0 0; font-size:13px; }

.alert { background:#f6f6f6; padding:10px; border-radius:10px; margin-bottom:12px; }
.alert.error { background:#ffecec; }

.box { border:1px solid #eee; border-radius:12px; padding:12px; }
.kv { display:grid; grid-template-columns: 140px 1fr; gap:10px; padding:8px 0; border-bottom:1px dashed #eee; }
.kv:last-child { border-bottom:none; }

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  word-break:break-all;
}

.pill { display:inline-block; padding:4px 10px; border-radius:999px; background:#f0f0f0; font-weight:700; font-size:12px; }
.pill.ok { background:#e7ffef; }
.pill.bad { background:#ffe7e7; }

.tx { margin-top:14px; }
.grid { display:grid; grid-template-columns: 140px 1fr; gap:8px 10px; }

.btn { padding:8px 12px; border-radius:10px; border:1px solid #ddd; background:#fff; cursor:pointer; }
.btn.secondary { background:#f8f8f8; }
.btn.danger { background:#ffecec; border-color:#ffbcbc; }
.btn:disabled { opacity:.6; cursor:not-allowed; }

@media (max-width: 900px) {
  .content { grid-template-columns: 1fr; }
}
</style>
