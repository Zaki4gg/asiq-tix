<script setup>
import '@/assets/home.css'
import { ref, computed, onMounted } from 'vue'
import SideNavSB from '@/components/SideNavSB.vue'

const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)

const API_HOST = import.meta.env.VITE_API_BASE || ''

const events = ref([])
const loading = ref(false)
const errorMsg = ref('')

function getWallet () {
  return localStorage.getItem('walletAddress') || ''
}

async function api(path, options = {}) {
  const full = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`
  let url = `${API_HOST}${full}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
      'x-wallet-address': getWallet()
    }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
  return data
}

async function loadMyEvents () {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await api('/api/my-events')
    events.value = Array.isArray(data.items) ? data.items : []
  } catch (e) {
    console.error(e)
    errorMsg.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}

const totalEvents = computed(() => events.value.length)
const totalTickets = computed(() =>
  events.value.reduce((sum, ev) => sum + (Number(ev.total_tickets) || 0), 0)
)
const soldTickets = computed(() =>
  events.value.reduce((sum, ev) => sum + (Number(ev.sold_tickets) || 0), 0)
)
const estRevenueIdr = computed(() =>
  events.value.reduce((sum, ev) =>
    sum + (Number(ev.price_idr || 0) * Number(ev.sold_tickets || 0)), 0)
)

onMounted(loadMyEvents)
</script>

<template>
  <div class="home-page">
    <header class="topbar">
      <div class="brand"><img src="/logo_with_text.png" alt="AsiqTIX" /></div>
      <h2 style="color:white;margin-left:1rem;">Promoter Dashboard</h2>
      <button class="hamburger" @click.stop="toggleSidebar" aria-label="Toggle Sidebar">
        <span/><span/><span/>
      </button>
    </header>

    <SideNavSB v-model="sidebarOpen" />

    <main class="container">
      <section class="hero">
        <div class="hero-bg" aria-hidden="true"></div>
        <h2 class="hero-title">Your Events</h2>
      </section>

      <section class="cards" style="margin-bottom:1.5rem;">
        <article class="card">
          <h3>Total Events</h3>
          <p>{{ totalEvents }}</p>
        </article>
        <article class="card">
          <h3>Total Tickets</h3>
          <p>{{ soldTickets }} / {{ totalTickets }}</p>
        </article>
        <article class="card">
          <h3>Est. Revenue (IDR)</h3>
          <p>Rp {{ estRevenueIdr.toLocaleString('id-ID') }}</p>
        </article>
      </section>

      <div v-if="errorMsg" class="alert error">{{ errorMsg }}</div>

      <section class="cards">
        <article v-for="ev in events" :key="ev.id" class="card">
          <div class="img-wrap">
            <div class="img" :style="{ backgroundImage: `url(${ev.image_url || '/fallback_poster.png'})` }"></div>
            <div class="img-overlay"></div>
            <div class="title">{{ ev.title }}</div>
          </div>
          <div class="meta">
            <div><span class="k">Location:</span> <span class="v">{{ ev.venue }}</span></div>
            <div><span class="k">Date:</span> <span class="v">{{ new Date(ev.date_iso).toLocaleString('id-ID') }}</span></div>
            <div><span class="k">Tickets:</span> <span class="v">{{ ev.sold_tickets }} / {{ ev.total_tickets }}</span></div>
          </div>
          <p class="desc">{{ ev.description || '(No description)' }}</p>
        </article>
      </section>
    </main>
  </div>
</template>
