<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SideNavSB from '@/components/SideNavSB.vue'

const route = useRoute()
const router = useRouter()

const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

// --- API helper (sama pola) ---
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

function formatDateTime (value) {
  if (!value) return '-'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return String(value)
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

const eventInfo = ref(null)
const purchases = ref([])

const eventId = computed(() => String(route.params?.id || ''))

const rows = computed(() =>
  purchases.value.map((tx) => ({
    id: tx.id,
    wallet: tx.wallet,
    createdAtLabel: formatDateTime(tx.created_at)
  }))
)

async function loadRole () {
  try {
    const me = await api('/api/me')
    role.value = me?.role || 'customer'
  } catch (e) {
    console.error(e)
    errorMsg.value = e.message || 'Gagal mengambil role user'
  }
}

async function loadPurchases () {
  if (!eventId.value) {
    errorMsg.value = 'Event ID tidak valid'
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    const res = await api(`/api/promoter/events/${encodeURIComponent(eventId.value)}/transactions`)
    eventInfo.value = res?.event || null
    purchases.value = Array.isArray(res?.items) ? res.items : []
  } catch (e) {
    console.error(e)
    errorMsg.value = e.message || 'Gagal memuat transaksi'
  } finally {
    loading.value = false
  }
}

function goBack () {
  router.push({ name: 'promoter-dashboard' })
}

onMounted(async () => {
  await loadRole()
  if (role.value === 'promoter') {
    await loadPurchases()
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
          <h1>Detail Pembelian Tiket</h1>
          <p class="muted">
            <span v-if="eventInfo?.title">{{ eventInfo.title }} — </span>
            Event ID: {{ eventId || '-' }}
          </p>
        </div>

        <div class="hero-actions">
          <button class="btn secondary" type="button" @click="goBack">Back</button>
        </div>
      </section>

      <section v-if="role === 'promoter'" class="table-section">
        <header class="table-header">
          <h2>Pembeli</h2>
          <button class="refresh" @click="loadPurchases" :disabled="loading">
            {{ loading ? 'Memuat…' : 'Refresh' }}
          </button>
        </header>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <div v-if="!loading && rows.length === 0" class="empty">
          Belum ada pembelian untuk event ini.
        </div>

        <div v-else class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Waktu Pembelian</th>
                <th>Wallet Pembeli (MetaMask)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id">
                <td>{{ r.createdAtLabel }}</td>
                <td class="mono">{{ r.wallet }}</td>
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

.home-page .brand{ display: inline-flex; align-items: center; }
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

.home-page .container{
  max-width: 1200px;
  margin: 24px auto 40px;
  padding: 0 clamp(14px, 2vw, 20px);
}
.dashboard{ display: grid; gap: 24px; }

.hero.hero--compact{
  background: rgba(15,19,27,.92);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.hero-text h1{ font-size: clamp(22px, 4vw, 28px); margin: 4px 0 6px; }
.hero-text .muted{ color: var(--muted); font-size: 14px; }

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

.hero-actions{ display: flex; justify-content: flex-end; }
.btn{
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.08);
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.btn:hover{ background: rgba(255,255,255,.12); }
.btn.secondary{ background: rgba(255,255,255,.08); }

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
  min-width:640px;
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

.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.error{ color:#fecaca; font-size:14px; }
.empty{ color:var(--muted); }
.forbidden{ padding:24px 8px; }

@media (max-width: 720px){
  .home-page .topbar{ grid-template-columns: 1fr 44px; }
  .home-page .brand img{ display:none; }
  .home-page .sb-card{
    top:0; right:0; bottom:0;
    width:min(86vw, 340px);
    border-radius:0;
  }
  .hero.hero--compact{ flex-direction: column; }
  .hero-actions{ width: 100%; }
}
</style>
