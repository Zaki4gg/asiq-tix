<template>
  <div class="scan-page">
    <header class="topbar">
      <h1 class="title">Scan Ticket QR</h1>
      <div class="actions">
        <button class="btn" :disabled="scanning" @click="startScan">Start</button>
        <button class="btn danger" :disabled="!scanning" @click="stopScan">Stop</button>
      </div>
    </header>

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

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { BrowserQRCodeReader } from '@zxing/browser'

const RAW_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_BASE = `${RAW_BASE}/api`

const videoEl = ref(null)

const scanning = ref(false)
const cameras = ref([])
const selectedDeviceId = ref('')

const decodedText = ref('')
const txId = ref('')
const verifyStatus = ref('') // '', 'valid', 'invalid'
const tx = ref(null)
const eventMeta = ref(null)

const errorMsg = ref('')
const infoMsg = ref('')

const reader = new BrowserQRCodeReader()
let controls = null

function pickDefaultCamera(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  // coba pilih “back/rear/environment” kalau ada
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
      // kalau device yang dipilih hilang, fallback ke default
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

  // 1) Kalau berupa URL dengan ?tx=...
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      const t = u.searchParams.get('tx')
      if (t) return t.trim()
    }
  } catch {
    // ignore
  }

  // 2) Kalau langsung UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRe.test(raw)) return raw

  // 3) fallback: pakai raw apa adanya (misalnya Anda encode token)
  return raw
}

async function verifyTransaction(id) {
  tx.value = null
  eventMeta.value = null
  verifyStatus.value = ''
  errorMsg.value = ''
  infoMsg.value = 'Memverifikasi tiket…'

  try {
    const res = await fetch(`${API_BASE}/transactions/${encodeURIComponent(id)}`)
    const data = await res.json().catch(() => null)

    if (!res.ok || !data?.tx) {
      verifyStatus.value = 'invalid'
      infoMsg.value = ''
      errorMsg.value = data?.error || data?.message || 'Transaksi tidak ditemukan.'
      return
    }

    tx.value = data.tx
    verifyStatus.value = 'valid'
    infoMsg.value = 'Tiket valid.'

    // Optional: ambil event meta kalau ada ref_id
    if (data.tx.ref_id) {
      const evRes = await fetch(`${API_BASE}/events/${encodeURIComponent(data.tx.ref_id)}`)
      const evData = await evRes.json().catch(() => null)
      if (evRes.ok && evData) eventMeta.value = evData
    }
  } catch {
    verifyStatus.value = 'invalid'
    infoMsg.value = ''
    errorMsg.value = 'Gagal verifikasi. Cek koneksi atau endpoint backend.'
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
        // result akan ada saat berhasil decode
        if (result) {
          const text = result.getText()
          decodedText.value = text

          const id = parseTxIdFromQr(text)
          txId.value = id

          // stop setelah 1 scan (biar tidak spam)
          stopScan()

          if (id) await verifyTransaction(id)
          else {
            verifyStatus.value = 'invalid'
            infoMsg.value = ''
            errorMsg.value = 'QR terbaca, tapi tidak ada TX ID yang valid.'
          }
        }
        // err biasanya NotFoundException saat belum menemukan QR; abaikan
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
    try { controls.stop() } catch {
      // ignore
    }
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

<style scoped>
.scan-page { padding: 16px; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
.title { margin:0; font-size:20px; }
.actions { display:flex; gap:8px; }
.content { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
.camera, .result { background:#fff; border-radius:12px; padding:16px; border:1px solid #eee; }
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
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; word-break:break-all; }
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
