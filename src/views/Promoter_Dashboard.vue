<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import SideNavSB from '@/components/SideNavSB.vue'

const route = useRoute()
const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

// --- API helper (sama pola) ---
const RAW_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_HOST = RAW_BASE.replace(/\/api$/i, '')
const wallet = () => (localStorage.getItem('walletAddress') || '').toString()

async function api(path, options = {}) {
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

const role = ref('customer')
const loading = ref(false)
const errorMsg = ref('')
const events = ref([])

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
      listed: !!ev.listed
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
    // backend /api/my-events sudah filter promoter_wallet = wallet login
    const res = await api('/api/my-events')
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
  if (role.value === 'promoter') {
    await loadEvents()
  }
})
</script>

<template>
  <div class="home-page" :style="{ '--hero-img': 'url(/Background.png)' }">
    <header class="topbar">
      <div class="brand">
        <img src="/logo_with_text.png" alt="Tickety" />
      </div>
      <div class="topbar-title">Promoter Dashboard</div>
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
          <p class="badge">Promoter</p>
          <h1>Penjualan Tiket Event Saya</h1>
          <p class="muted">Data hanya untuk event yang dibuat dengan wallet ini.</p>
        </div>
      </section>

      <section v-if="role === 'promoter'" class="summary-grid">
        <article class="summary-card">
          <p class="label">Event Saya</p>
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

      <section v-if="role === 'promoter'" class="table-section">
        <header class="table-header">
          <h2>Event Saya</h2>
          <button class="refresh" @click="loadEvents" :disabled="loading">
            {{ loading ? 'Memuat…' : 'Refresh' }}
          </button>
        </header>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <div v-if="!loading && rows.length === 0" class="empty">
          Belum ada event yang dimiliki oleh wallet ini.
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
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="role !== 'promoter' && !loading" class="forbidden">
        <p class="error">Halaman ini hanya untuk promoter.</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* =========================
   Promoter Dashboard - Scoped (No home.css)
   ========================= */
.home-page{
  --bg: #0b0d12;
  --panel: #0f131b;
  --border: #1c2536;
  --text: #f4f6fb;
  --muted: #ccd3e1;
  --brand: #f2c78a;
  --pill: rgba(255,255,255,.1);

  --brand-size: clamp(34px, 14vw, 40px);
  --topbar-h: clamp(88px, 12vw, 144px);

  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

/* =========================
   TOP BAR
   ========================= */
.home-page .topbar{
  position: sticky;
  top: 0;
  z-index: 1000;

  height: var(--topbar-h);
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr 64px;
  align-items: center;
  gap: 14px;
  padding: 0 clamp(12px, 2vw, 18px);

  background: rgba(10,12,18,.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255,255,255,.06);
}

.home-page .brand{
  display: inline-flex;
  align-items: center;
}
.home-page .brand img{
  height: var(--brand-size);
  width: auto;
  margin-left: 10px;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,.5));
}

.topbar-title{
  justify-self: center;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .08em;
  color: var(--text);
}

/* Hamburger */
.home-page .hamburger{
  justify-self: end;
  width: 44px;
  height: 44px;
  display:flex;
  align-items:center;
  justify-content:center;
  background: var(--pill);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
}
.home-page .hamburger span{
  display:block;
  width: 18px;
  height: 2px;
  background:#fff;
  margin: 2px 0;
  border-radius: 2px;
}

/* =========================
   SIDEBAR (SideNavSB)
   ========================= */
.home-page .sb-card{
  position: fixed;
  top: calc(var(--topbar-h) + 10px);
  right: 20px;
  bottom: 16px;

  width: 220px;
  background: var(--brand);
  color: #2b1c08;
  border-radius: 16px;
  border: 1px solid rgba(0,0,0,.12);
  padding: 14px 12px;
  overflow: auto;
  z-index: 1050;
}
.home-page .sb-menu{ display:flex; flex-direction:column; gap:10px; }
.home-page .sb-item{
  padding: 12px 14px;
  font-weight: 800;
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
}
.home-page .sb-item.active{ background: rgba(0,0,0,.10); }
.home-page .sb-item:hover{ background: rgba(0,0,0,.06); }

/* =========================
   CONTENT
   ========================= */
.home-page .container{
  max-width: 1200px;
  margin: 24px auto 40px;
  padding: 0 clamp(14px, 2vw, 20px);
}

.dashboard{
  display: grid;
  gap: 24px;
}

/* Compact hero */
.hero.hero--compact{
  background: rgba(15,19,27,.92);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 18px;
}

.hero-text h1{
  font-size: clamp(22px, 4vw, 28px);
  margin: 4px 0 6px;
}
.hero-text .muted{
  color: var(--muted);
  font-size: 14px;
}

.badge{
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  background: rgba(243,244,246,.08);
  color: var(--brand);
}

/* Summary */
.summary-grid{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.summary-card{
  background: var(--panel);
  border-radius: 16px;
  border: 1px solid var(--border);
  padding: 14px 16px;
}
.summary-card .label{
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted);
}
.summary-card .value{
  margin-top: 6px;
  font-size: 22px;
  font-weight: 800;
}

/* Table */
.table-section{
  background: rgba(15,19,27,.92);
  border-radius: 18px;
  border: 1px solid var(--border);
  padding: 16px 18px;
}
.table-header{
  display:flex;
  justify-content:space-between;
  margin-bottom:10px;
}
.table-wrapper{ overflow-x:auto; }

.table{
  width:100%;
  min-width:720px;
  border-collapse:collapse;
  font-size:13px;
}
.table th{
  text-align:left;
  padding:8px 6px;
  color:var(--muted);
  border-bottom:1px solid var(--border);
}
.table td{
  padding:10px 6px;
  border-bottom:1px solid rgba(255,255,255,.04);
}
.cell-title .title{
  font-weight:700;
}
.cell-title .sub{
  font-size:12px;
  color:var(--muted);
}

/* Pills */
.pill{
  display:inline-flex;
  padding:2px 10px;
  border-radius:999px;
  font-size:11px;
  letter-spacing:.08em;
}
.pill--green{
  background:rgba(34,197,94,.12);
  color:#bbf7d0;
}
.pill--gray{
  background:rgba(148,163,184,.16);
  color:#e5e7eb;
}

/* Misc */
.error{ color:#fecaca; font-size:14px; }
.empty{ color:var(--muted); }
.forbidden{ padding:24px 8px; }

/* Responsive */
@media (max-width: 720px){
  .home-page .topbar{
    grid-template-columns: 1fr 44px;
  }
  .home-page .brand img{ display:none; }
  .home-page .sb-card{
    top:0; right:0; bottom:0;
    width:min(86vw, 340px);
    border-radius:0;
  }
}

</style>
