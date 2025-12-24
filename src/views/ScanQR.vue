<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { BrowserQRCodeReader } from '@zxing/browser'
import SideNavSB from '@/components/SideNavSB.vue'

const RAW_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_BASE = `${RAW_BASE}/api`

const videoEl = ref(null)

const scanning = ref(false)
const processing = ref(false)

const cameras = ref([])
const selectedDeviceId = ref('')

const decodedText = ref('')
const txId = ref('')
const verifyStatus = ref('') // '', 'valid', 'used', 'invalid'
const tx = ref(null)
const eventMeta = ref(null)

const errorMsg = ref('')
const infoMsg = ref('')

/** SideNavSB REQUIRE v-model */
const sidebarOpen = ref(false)
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

const statusLabel = computed(() => {
  if (verifyStatus.value === 'valid') return 'VALID'
  if (verifyStatus.value === 'used') return 'SUDAH DIPAKAI'
  if (verifyStatus.value === 'invalid') return 'INVALID'
  return '—'
})
const statusClass = computed(() => {
  if (verifyStatus.value === 'valid') return 'ok'
  if (verifyStatus.value === 'used') return 'warn'
  if (verifyStatus.value === 'invalid') return 'bad'
  return ''
})

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

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      const t = u.searchParams.get('tx')
      if (t) return t.trim()
    }
  } catch {
    // ignore
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRe.test(raw)) return raw

  return raw
}

async function scanTicketRedeem(id) {
  tx.value = null
  eventMeta.value = null
  verifyStatus.value = ''
  errorMsg.value = ''
  infoMsg.value = 'Memproses scan tiket…'
  processing.value = true

  const w = wallet()
  if (!w) {
    verifyStatus.value = 'invalid'
    infoMsg.value = ''
    errorMsg.value = 'Wallet tidak ditemukan. Login/koneksikan MetaMask dulu.'
    processing.value = false
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

    if (res.status === 409) {
      verifyStatus.value = 'used'
      infoMsg.value = ''
      errorMsg.value = data?.message || 'Tiket ini sudah di-scan dan tidak valid lagi.'
      tx.value = data?.tx || null
      eventMeta.value = data?.event || null
      return
    }

    if (!res.ok) {
      verifyStatus.value = 'invalid'
      infoMsg.value = ''
      errorMsg.value = data?.error || data?.message || 'Scan gagal.'
      return
    }

    verifyStatus.value = 'valid'
    infoMsg.value = data?.message || 'Tiket valid. Scan berhasil.'
    tx.value = data?.tx || null
    eventMeta.value = data?.event || null
  } catch {
    verifyStatus.value = 'invalid'
    infoMsg.value = ''
    errorMsg.value = 'Gagal scan. Cek koneksi atau endpoint backend.'
  } finally {
    processing.value = false
  }
}

async function startScan() {
  if (scanning.value || processing.value) return

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
        if (!scanning.value) return

        const text = result.getText()
        decodedText.value = text

        const id = parseTxIdFromQr(text)
        txId.value = id

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
  <div class="layout">
    <SideNavSB v-model="sidebarOpen" />

    <div class="page">
      <header class="topbar">
        <div class="left">
          <button class="hamburger" type="button" aria-label="Toggle menu" @click="toggleSidebar">
            <span></span><span></span><span></span>
          </button>
          <div class="titles">
            <h1 class="title">Scan Ticket QR</h1>
            <p class="subtitle">Redeem tiket sekali pakai dari QR</p>
          </div>
        </div>

        <div class="actions">
          <button class="btn primary" :disabled="scanning || processing" @click="startScan">
            {{ processing ? 'Processing…' : (scanning ? 'Scanning…' : 'Start Scan') }}
          </button>
        </div>
      </header>

      <main class="content">
        <section class="panel">
          <div class="panel-head">
            <h2>Camera</h2>
            <div class="inline">
              <select class="select" v-model="selectedDeviceId" :disabled="scanning || cameras.length === 0">
                <option v-for="c in cameras" :key="c.deviceId" :value="c.deviceId">
                  {{ c.label || `Camera ${c.deviceId.slice(0, 6)}…` }}
                </option>
              </select>
            </div>
          </div>

          <div class="video-wrap">
            <video ref="videoEl" class="video" autoplay playsinline muted></video>

            <div v-if="!scanning && !processing" class="overlay">
              Klik <strong>Start Scan</strong> untuk mulai scan
            </div>

            <div class="reticle" aria-hidden="true">
              <span class="corner tl" /><span class="corner tr" />
              <span class="corner bl" /><span class="corner br" />
              <div v-if="scanning" class="scanline" />
            </div>

            <div class="badge" :class="{ on: scanning, busy: processing }">
              <span v-if="processing">processing</span>
              <span v-else-if="scanning">scanning</span>
              <span v-else>idle</span>
            </div>
          </div>

          <!-- Button controls dipindah ke bawah video -->
          <div class="video-controls">
            <button class="btn-ctrl danger" :disabled="!scanning" @click="stopScan">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="10" height="10" rx="1"/></svg>
              Stop
            </button>
            <button class="btn-ctrl secondary" :disabled="scanning || processing" @click="refreshCameras">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
              Refresh
            </button>
          </div>

          <p class="hint">Catatan: akses kamera umumnya hanya berjalan di HTTPS atau localhost.</p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Hasil</h2>
            <div class="right-actions">
              <button class="btn secondary" :disabled="scanning || processing" @click="reset">Reset</button>
            </div>
          </div>

          <div v-if="errorMsg" class="alert error">{{ errorMsg }}</div>
          <div v-else-if="infoMsg" class="alert info">{{ infoMsg }}</div>

          <div class="summary">
            <div class="kv">
              <div class="k">Status</div>
              <div class="v">
                <span class="pill" :class="statusClass">{{ statusLabel }}</span>
              </div>
            </div>
            <div class="kv">
              <div class="k">Transaction ID</div>
              <div class="v mono">{{ txId || '—' }}</div>
            </div>
            <div class="kv">
              <div class="k">QR Text</div>
              <div class="v mono">{{ decodedText || '—' }}</div>
            </div>
          </div>

          <div v-if="tx" class="card">
            <div class="card-head"><h3>Detail Transaksi</h3></div>
            <div class="grid">
              <div class="k2">ID</div><div class="v2 mono">{{ tx.id }}</div>
              <div class="k2">Kind</div><div class="v2">{{ tx.kind }}</div>
              <div class="k2">Status</div><div class="v2">{{ tx.status }}</div>
              <div class="k2">Wallet</div><div class="v2 mono">{{ tx.wallet }}</div>
              <div class="k2">Amount</div><div class="v2">{{ tx.amount }}</div>
              <div class="k2">Created</div><div class="v2">{{ tx.created_at }}</div>
              <div class="k2">Event Ref</div><div class="v2 mono">{{ tx.ref_id || '—' }}</div>
            </div>
          </div>

          <div v-if="eventMeta" class="card">
            <div class="card-head"><h3>Detail Event</h3></div>
            <div class="grid">
              <div class="k2">Title</div><div class="v2">{{ eventMeta.title }}</div>
              <div class="k2">Date</div><div class="v2">{{ eventMeta.date_iso }}</div>
              <div class="k2">Venue</div><div class="v2">{{ eventMeta.venue }}</div>
              <div class="k2">ID</div><div class="v2 mono">{{ eventMeta.id }}</div>
            </div>
          </div>

        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout { min-height: 100vh; background: #0b0d12; }
.page { max-width: 1200px; margin: 0 auto; padding: 16px; }

.topbar {
  position: sticky; top: 0; z-index: 5;
  background: rgba(11,13,18,.85);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 14px;
  padding: 12px 12px;
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  margin-bottom: 16px;
}
.left { display:flex; align-items:center; gap:12px; min-width: 0; }
.titles { min-width: 0; }
.title { margin:0; font-size: 18px; color: #fff; letter-spacing: .2px; }
.subtitle { margin: 2px 0 0; font-size: 12px; color: rgba(255,255,255,.65); }

.hamburger{
  width: 42px; height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(255,255,255,.08);
  display:flex; flex-direction:column; justify-content:center;
  gap:4px; padding:0 10px;
  cursor:pointer;
  transition: all .2s ease;
}
.hamburger:hover {
  background: rgba(255,255,255,.15);
}
.hamburger span{
  display:block; height:2px;
  background: rgba(255,255,255,.9);
  border-radius:999px;
}

.actions { display:flex; gap:8px; flex-wrap: wrap; justify-content:flex-end; }

.content { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }

.panel {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  border: 1px solid #eee;
  color: #0b0d12;
}
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px; }
.panel h2 { margin:0; font-size: 15px; }
.inline { display:flex; gap:8px; align-items:center; }
.right-actions { display:flex; gap:8px; }

.select {
  padding: 9px 10px; border-radius: 10px;
  border: 1px solid #ddd; min-width: 260px;
  background: #fff;
}

.video-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  background: #111;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,.15);
}
.video { width:100%; height:100%; object-fit: cover; }
.overlay {
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
  color:#fff; background: rgba(0,0,0,.35);
  font-size: 14px;
}

.reticle { position:absolute; inset: 0; pointer-events: none; }
.corner { position:absolute; width: 36px; height: 36px; border: 3px solid rgba(255,255,255,.85); }
.corner.tl { top: 18px; left: 18px; border-right: none; border-bottom: none; border-radius: 10px 0 0 0; }
.corner.tr { top: 18px; right: 18px; border-left: none; border-bottom: none; border-radius: 0 10px 0 0; }
.corner.bl { bottom: 18px; left: 18px; border-right: none; border-top: none; border-radius: 0 0 0 10px; }
.corner.br { bottom: 18px; right: 18px; border-left: none; border-top: none; border-radius: 0 0 10px 0; }

.scanline {
  position:absolute; left: 12%; right: 12%;
  top: 18%; height: 2px;
  background: rgba(255,255,255,.9);
  animation: scan 1.2s linear infinite;
  box-shadow: 0 0 18px rgba(255,255,255,.35);
}
@keyframes scan {
  0% { transform: translateY(0); opacity: .2; }
  10% { opacity: 1; }
  50% { transform: translateY(220px); opacity: 1; }
  100% { transform: translateY(420px); opacity: .2; }
}

.badge {
  position:absolute; top: 10px; left: 10px;
  font-size: 11px; font-weight: 700;
  padding: 6px 10px; border-radius: 999px;
  background: rgba(255,255,255,.12);
  color: rgba(255,255,255,.9);
  border: 1px solid rgba(255,255,255,.18);
  text-transform: uppercase;
}
.badge.on { background: rgba(34,197,94,.15); border-color: rgba(34,197,94,.35); }
.badge.busy { background: rgba(245,158,11,.18); border-color: rgba(245,158,11,.4); }

.video-controls {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.btn-ctrl {
  flex: 1;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all .2s ease;
}

.btn-ctrl.danger {
  background: #fee;
  border-color: #fcc;
  color: #c33;
}
.btn-ctrl.danger:hover:not(:disabled) {
  background: #fdd;
  border-color: #faa;
}

.btn-ctrl.secondary {
  background: #f8f8f8;
  border-color: #ddd;
  color: #333;
}
.btn-ctrl.secondary:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn-ctrl:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.hint { color:#666; margin: 10px 0 0; font-size: 13px; }

.alert { padding: 10px 12px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #eee; }
.alert.info { background: #f6f6f6; }
.alert.error { background: #ffecec; border-color: #ffd0d0; }

.summary { border: 1px solid #eee; border-radius: 14px; padding: 10px 12px; }
.kv {
  display:grid; grid-template-columns: 140px 1fr;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed #eee;
}
.kv:last-child { border-bottom: none; }
.k { font-weight: 700; color: #111; }
.v { color: #111; }
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  word-break: break-all;
}

.pill {
  display:inline-block; padding: 6px 10px; border-radius: 999px;
  background:#f0f0f0; font-weight: 900; font-size: 12px;
  letter-spacing: .3px;
}
.pill.ok { background:#e7ffef; border: 1px solid #bff0cf; }
.pill.warn { background:#fff4e5; border: 1px solid #ffd8a8; }
.pill.bad { background:#ffe7e7; border: 1px solid #ffc1c1; }

.card {
  margin-top: 14px;
  border: 1px solid #eee;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
}
.card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; }
.card h3 { margin: 0; font-size: 14px; }
.grid { display:grid; grid-template-columns: 140px 1fr; gap: 8px 10px; }
.k2 { font-weight: 700; color: #111; }
.v2 { color: #111; }

.btn {
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.08);
  cursor: pointer;
  color: #fff;
  font-weight: 700;
  transition: all .2s ease;
}
.btn:hover:not(:disabled) {
  background: rgba(255,255,255,.15);
}
.btn.secondary { background: rgba(255,255,255,.06); }
.btn.primary { background: rgba(99,102,241,.22); border-color: rgba(99,102,241,.35); }
.btn.primary:hover:not(:disabled) {
  background: rgba(99,102,241,.3);
}
.btn.danger { background: rgba(239,68,68,.18); border-color: rgba(239,68,68,.35); }
.btn:disabled { opacity: .55; cursor: not-allowed; }

@media (max-width: 980px) {
  .content { grid-template-columns: 1fr; }
  .select { min-width: 220px; }
}
</style>
