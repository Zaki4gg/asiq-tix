<script setup>
import '@/assets/home.css'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import SideNavSB from '@/components/SideNavSB.vue'
import { ethers } from 'ethers'
import { useMetamask } from '@/composables/useMetamask'
import { ASIQTIX_TICKETS_ABI } from '@/abi/asiqtixTicketsSimpleV3'

const route = useRoute()
const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

// =========================
// Admin: On-chain promoter management (Polygon Amoy)
// =========================
const { account, ensureChain } = useMetamask()
const TICKETS_CONTRACT = import.meta.env.VITE_TICKETS_CONTRACT || ''
const AMOY_RPC = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://rpc-amoy.polygon.technology'
const EXPLORER_BASE = 'https://amoy.polygonscan.com'

const promoterInput = ref('')
const promoterNormalized = ref('')
const promoterStatus = ref(null) // null | boolean
const promoterCheckLoading = ref(false)
const promoterCheckError = ref('')

const promoterActionLoading = ref(false)
const promoterActionMsg = ref('')
const promoterTxHash = ref('')

const contractOwner = ref('')
const contractOwnerError = ref('')

const promoterAddressLink = computed(() =>
  promoterNormalized.value ? `${EXPLORER_BASE}/address/${promoterNormalized.value}` : ''
)
const promoterTxLink = computed(() =>
  promoterTxHash.value ? `${EXPLORER_BASE}/tx/${promoterTxHash.value}` : ''
)
const isConnectedWalletOwner = computed(() => {
  if (!contractOwner.value || !account.value) return false
  return String(contractOwner.value).toLowerCase() === String(account.value).toLowerCase()
})

function normalizeAddress (value) {
  const s = String(value || '').trim()
  if (!s) return ''
  try {
    return ethers.getAddress(s)
  } catch {
    return ''
  }
}

let _readProvider = null
function getReadProvider () {
  if (_readProvider) return _readProvider
  _readProvider = new ethers.JsonRpcProvider(AMOY_RPC)
  return _readProvider
}
function getReadContract () {
  if (!TICKETS_CONTRACT) throw new Error('VITE_TICKETS_CONTRACT belum diset di .env')
  return new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, getReadProvider())
}

async function loadContractOwner () {
  contractOwnerError.value = ''
  contractOwner.value = ''
  if (!TICKETS_CONTRACT) {
    contractOwnerError.value = 'Alamat kontrak (VITE_TICKETS_CONTRACT) belum dikonfigurasi.'
    return
  }
  try {
    const c = getReadContract()
    const owner = await c.owner()
    contractOwner.value = String(owner || '')
  } catch (e) {
    console.error(e)
    contractOwnerError.value = e?.message || 'Gagal mengambil owner kontrak.'
  }
}

async function checkPromoterWallet () {
  promoterCheckError.value = ''
  promoterActionMsg.value = ''
  promoterTxHash.value = ''
  promoterStatus.value = null

  const addr = normalizeAddress(promoterInput.value)
  promoterNormalized.value = addr
  if (!addr) {
    promoterCheckError.value = 'Alamat wallet tidak valid.'
    return
  }
  promoterCheckLoading.value = true
  try {
    const c = getReadContract()
    const ok = await c.isPromoter(addr)
    promoterStatus.value = !!ok
  } catch (e) {
    console.error(e)
    promoterCheckError.value = e?.reason || e?.message || 'Gagal memeriksa status promoter.'
  } finally {
    promoterCheckLoading.value = false
  }
}

async function setPromoterOnchain (active) {
  promoterCheckError.value = ''
  promoterActionMsg.value = ''
  promoterTxHash.value = ''

  const addr = normalizeAddress(promoterInput.value)
  promoterNormalized.value = addr
  if (!addr) {
    promoterCheckError.value = 'Alamat wallet tidak valid.'
    return
  }
  if (!window?.ethereum) {
    promoterCheckError.value =
      'MetaMask tidak terdeteksi. Untuk menambah/menghapus promoter, Anda harus memakai MetaMask.'
    return
  }
  if (!TICKETS_CONTRACT) {
    promoterCheckError.value = 'Alamat kontrak (VITE_TICKETS_CONTRACT) belum dikonfigurasi.'
    return
  }

  const want = !!active
  const label = want ? 'menambahkan' : 'menghapus'
  const ok = window.confirm(
    `Konfirmasi: ${label} promoter untuk wallet\n${addr}\n\nTransaksi akan muncul di MetaMask.`
  )
  if (!ok) return

  promoterActionLoading.value = true
  try {
    await ensureChain('amoy')
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const c = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    const tx = await c.setPromoter(addr, want)
    promoterTxHash.value = tx?.hash || ''
    promoterActionMsg.value = 'Transaksi dikirim. Menunggu konfirmasi…'
    await tx.wait()
    promoterActionMsg.value = 'Berhasil. Status promoter sudah diperbarui di blockchain.'

    await checkPromoterWallet()
  } catch (e) {
    console.error(e)
    promoterActionMsg.value = ''
    promoterCheckError.value = e?.reason || e?.shortMessage || e?.message || 'Transaksi gagal.'
  } finally {
    promoterActionLoading.value = false
  }
}

// --- API helper (sama pola dengan EventDetailView) ---
const RAW_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_HOST = RAW_BASE.replace(/\/api$/i, '')
const wallet = () => (localStorage.getItem('walletAddress') || '').toString()

async function api (path, options = {}) {
  const full = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(`${API_HOST}${full}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
      'x-wallet-address': wallet()
    }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
  return data
}

// --- util format ---
function formatIdr (num) {
  if (!num) return ''
  const s = String(Math.round(num))
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function formatDateTime (value) {
  if (!value) return '-'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return value
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// --- state ---
const role = ref('customer')
const loading = ref(false)
const errorMsg = ref('')
const events = ref([])

// mapping event → row untuk tabel
const rows = computed(() =>
  events.value.map((ev) => {
    const sold = Number(ev.sold_tickets || 0)
    const total = Number(ev.total_tickets || 0)
    const priceIdr = Number(ev.price_idr || 0)
    const revenueIdr = sold * priceIdr
    return {
      id: ev.id,
      title: ev.title,
      venue: ev.venue,
      dateLabel: formatDateTime(ev.date_iso),
      sold,
      total,
      remaining: Math.max(total - sold, 0),
      priceIdr,
      revenueIdr,
      listed: !!ev.listed,
      promoterWallet: ev.promoter_wallet || null
    }
  })
)

const summary = computed(() => {
  const list = rows.value
  const totalEvents = list.length
  let totalTickets = 0
  let totalSold = 0
  let totalRemaining = 0
  let totalRevenueIdr = 0

  for (const r of list) {
    totalTickets += r.total
    totalSold += r.sold
    totalRemaining += r.remaining
    totalRevenueIdr += r.revenueIdr
  }

  return {
    totalEvents,
    totalTickets,
    totalSold,
    totalRemaining,
    totalRevenueIdr
  }
})

// --- loader ---
async function loadRole () {
  try {
    const me = await api('/api/me')
    role.value = me?.role || 'customer'
  } catch (e) {
    console.error(e)
    errorMsg.value = e.message || 'Gagal mengambil role user'
  }
}

async function loadEvents () {
  loading.value = true
  errorMsg.value = ''
  try {
    // admin lihat SEMUA event (listed + unlisted)
    const res = await api('/api/events?all=1&include_unlisted=1')
    events.value = Array.isArray(res?.items) ? res.items : []
  } catch (e) {
    console.error(e)
    errorMsg.value = e.message || 'Gagal memuat data event'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadRole()
  if (role.value === 'admin') {
    await loadEvents()
    await loadContractOwner()
  }
})
</script>

<template>
  <div class="home-page" :style="{ '--hero-img': 'url(/Background.png)' }">
    <header class="topbar">
      <div class="brand">
        <img src="/logo_with_text.png" alt="Tickety" />
      </div>
      <div class="topbar-title">Admin Dashboard</div>
      <button class="hamburger" @click.stop="toggleSidebar" aria-label="Toggle Sidebar">
        <span />
        <span />
        <span />
      </button>
    </header>

    <SideNavSB v-model="sidebarOpen" />

    <main class="container dashboard">
      <section class="hero hero--compact">
        <div class="hero-text">
          <p class="badge">Admin</p>
          <h1>Ringkasan Penjualan Tiket</h1>
          <p class="muted">Pantau performa semua event yang terdaftar di platform.</p>
        </div>
      </section>

      <section v-if="role === 'admin'" class="summary-grid">
        <article class="summary-card">
          <p class="label">Total Event</p>
          <p class="value">{{ summary.totalEvents }}</p>
        </article>
        <article class="summary-card">
          <p class="label">Total Tiket</p>
          <p class="value">{{ summary.totalTickets }}</p>
        </article>
        <article class="summary-card">
          <p class="label">Tiket Terjual</p>
          <p class="value">{{ summary.totalSold }}</p>
        </article>
        <article class="summary-card">
          <p class="label">Tiket Tersisa</p>
          <p class="value">{{ summary.totalRemaining }}</p>
        </article>
        <article class="summary-card">
          <p class="label">Perkiraan Pendapatan</p>
          <p class="value">
            Rp {{ formatIdr(summary.totalRevenueIdr) || '0' }}
          </p>
        </article>
      </section>

      <section v-if="role === 'admin'" class="table-section">
        <header class="table-header">
          <h2>Detail Event</h2>
          <button class="refresh" @click="loadEvents" :disabled="loading">
            {{ loading ? 'Memuat…' : 'Refresh' }}
          </button>
        </header>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <div v-if="!loading && rows.length === 0" class="empty">
          Belum ada event yang tercatat.
        </div>

        <div v-else class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Tanggal</th>
                <th>Terjual / Total</th>
                <th>Sisa</th>
                <th>Harga (Rp)</th>
                <th>Pendapatan (Rp)</th>
                <th>Status</th>
                <th>Promoter</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ev in rows" :key="ev.id">
                <td>
                  <div class="cell-title">
                    <div class="title">{{ ev.title }}</div>
                    <div class="sub">{{ ev.venue }}</div>
                  </div>
                </td>
                <td>{{ ev.dateLabel }}</td>
                <td>{{ ev.sold }} / {{ ev.total }}</td>
                <td>{{ ev.remaining }}</td>
                <td>Rp {{ formatIdr(ev.priceIdr) || '0' }}</td>
                <td>Rp {{ formatIdr(ev.revenueIdr) || '0' }}</td>
                <td>
                  <span class="pill" :class="ev.listed ? 'pill--green' : 'pill--gray'">
                    {{ ev.listed ? 'Listed' : 'Unlisted' }}
                  </span>
                </td>
                <td>
                  <span class="mono">{{ ev.promoterWallet || '-' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="role === 'admin'" class="promoter-section">
        <header class="table-header">
          <h2>Manajemen Promoter (On-chain)</h2>
        </header>

        <p v-if="contractOwnerError" class="error">{{ contractOwnerError }}</p>

        <div class="promoter-meta" v-if="TICKETS_CONTRACT">
          <div class="row">
            <span class="k">Contract</span>
            <a
              class="mono link"
              :href="`${EXPLORER_BASE}/address/${TICKETS_CONTRACT}`"
              target="_blank"
              rel="noreferrer"
            >
              {{ TICKETS_CONTRACT }}
            </a>
          </div>
          <div class="row" v-if="contractOwner">
            <span class="k">Owner</span>
            <a
              class="mono link"
              :href="`${EXPLORER_BASE}/address/${contractOwner}`"
              target="_blank"
              rel="noreferrer"
            >
              {{ contractOwner }}
            </a>
            <span class="pill" :class="isConnectedWalletOwner ? 'pill--green' : 'pill--gray'">
              {{ isConnectedWalletOwner ? 'Wallet Admin = Owner' : 'Wallet Admin ≠ Owner' }}
            </span>
          </div>
          <p v-if="!isConnectedWalletOwner" class="hint">
            Catatan: fungsi <span class="mono">setPromoter</span> biasanya hanya bisa dipanggil oleh
            <span class="mono">owner</span>. Jika wallet admin Anda bukan owner, transaksi kemungkinan
            <span class="mono">revert</span>.
          </p>
        </div>

        <div class="promoter-form">
          <label class="lbl">Wallet Address</label>
          <input
            v-model="promoterInput"
            class="inp mono"
            placeholder="0x..."
            autocomplete="off"
            spellcheck="false"
          />

          <div class="promoter-actions">
            <button class="btn primary" @click="checkPromoterWallet" :disabled="promoterCheckLoading">
              {{ promoterCheckLoading ? 'Checking…' : 'Check' }}
            </button>
            <button class="btn primary" @click="setPromoterOnchain(true)" :disabled="promoterActionLoading">
              {{ promoterActionLoading ? 'Processing…' : 'Add Promoter' }}
            </button>
            <button class="btn ghost" @click="setPromoterOnchain(false)" :disabled="promoterActionLoading">
              Remove Promoter
            </button>
          </div>

          <p v-if="promoterCheckError" class="error">{{ promoterCheckError }}</p>
          <p v-if="promoterActionMsg" class="ok">{{ promoterActionMsg }}</p>

          <div v-if="promoterNormalized" class="promoter-result">
            <div class="row">
              <span class="k">Address</span>
              <a class="mono link" :href="promoterAddressLink" target="_blank" rel="noreferrer">
                {{ promoterNormalized }}
              </a>
            </div>
            <div class="row" v-if="promoterStatus !== null">
              <span class="k">Status</span>
              <span class="pill" :class="promoterStatus ? 'pill--green' : 'pill--gray'">
                {{ promoterStatus ? 'PROMOTER' : 'NOT PROMOTER' }}
              </span>
            </div>
            <div class="row" v-if="promoterTxHash">
              <span class="k">Tx</span>
              <a class="mono link" :href="promoterTxLink" target="_blank" rel="noreferrer">
                {{ promoterTxHash }}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section v-if="role !== 'admin' && !loading" class="forbidden">
        <p class="error">Halaman ini hanya untuk admin.</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 24px;
  padding-bottom: 40px;
}

.hero.hero--compact {
  align-items: flex-start;
  min-height: auto;
  padding-block: 24px;
}

.hero-text h1 {
  font-size: clamp(22px, 4vw, 28px);
  margin: 4px 0 6px;
}

.hero-text .muted {
  color: var(--muted);
  font-size: 14px;
}

.badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(243, 244, 246, 0.08);
  color: var(--brand);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.summary-card {
  background: var(--panel);
  border-radius: 16px;
  border: 1px solid var(--border);
  padding: 14px 16px;
}

.summary-card .label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.summary-card .value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
}

.table-section {
  background: rgba(15, 19, 27, 0.92);
  border-radius: 18px;
  border: 1px solid var(--border);
  padding: 16px 18px;
}

.promoter-section {
  background: rgba(15, 19, 27, 0.92);
  border-radius: 18px;
  border: 1px solid var(--border);
  padding: 16px 18px;
}

.promoter-meta {
  display: grid;
  gap: 8px;
  margin: 10px 0 14px;
}

.promoter-meta .row,
.promoter-result .row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.k {
  width: 76px;
  color: var(--muted);
  font-size: 12px;
}

.link {
  color: inherit;
  text-decoration: underline;
  opacity: 0.95;
}

.hint {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.promoter-form {
  display: grid;
  gap: 10px;
}

.lbl {
  font-size: 12px;
  color: var(--muted);
}

.inp {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.18);
  padding: 10px 12px;
  color: var(--text);
  outline: none;
}

.inp:focus {
  border-color: rgba(255, 255, 255, 0.22);
}

.promoter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 700;
  cursor: pointer;
  color: #0f131b;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.primary {
  background: #f4f1de;
}

.btn.ghost {
  background: rgba(244, 241, 222, 0.18);
  color: #f4f1de;
  border: 1px solid rgba(244, 241, 222, 0.25);
}

.ok {
  color: #bbf7d0;
  font-size: 14px;
  margin: 0;
}

.promoter-result {
  margin-top: 4px;
  display: grid;
  gap: 10px;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.table-wrapper {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
  font-size: 13px;
}

.table thead th {
  text-align: left;
  padding: 8px 6px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 500;
  white-space: nowrap;
}

.table tbody td {
  padding: 10px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.cell-title .title {
  font-weight: 600;
  color: var(--text);
}

.cell-title .sub {
  font-size: 12px;
  color: var(--muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.pill--green {
  background: rgba(34, 197, 94, 0.12);
  color: #bbf7d0;
}

.pill--gray {
  background: rgba(148, 163, 184, 0.16);
  color: #e5e7eb;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 11px;
}

.error {
  color: #fecaca;
  font-size: 14px;
  margin: 6px 0 0;
}

.empty {
  font-size: 14px;
  color: var(--muted);
  padding: 8px 0;
}

.forbidden {
  padding: 24px 8px;
}

.topbar-title {
  margin-left: auto;
  margin-right: auto;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.home-page .topbar {
  align-items: center;
}
</style>
