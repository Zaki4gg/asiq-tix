<script setup>
import '@/assets/account.css'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DrawerNav from '@/components/DrawerNav.vue'
// import { useConfirmLogout } from '@/composables/useConfirmLogout' // tetap
import { useMetamask } from '@/composables/useMetamask'
import profileSvgRaw from '@/assets/profile.svg?raw'
import { io } from 'socket.io-client'

/* ---------- ROUTE + DRAWER ---------- */
const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

/* ---------- METAMASK ---------- */
const { account } = useMetamask()
const walletAddress = computed(() => account.value || '')

async function hydrateAccount() {
  if (!account.value && window?.ethereum) {
    try {
      const accs = await window.ethereum.request({ method: 'eth_accounts' })
      if (accs?.[0]) account.value = accs[0]
    } catch {
      //
    }
  }
}
function onAccountsChanged(accs){
  account.value = accs?.[0] || ''
  if (account.value) { startSocket(); refreshBalance(); loadHistory() }
  else { stopSocket(); balanceWei.value = 0n; orders.value = [] }
}

/* ---------- NATIVE BALANCE (untuk “0 POL”) ---------- */
const chainIdHex = ref('0x0')
const nativeSymbol = ref('ETH')
const balanceWei = ref(0n) // BigInt

const CHAIN_SYMBOL = (idNum) => {
  if (idNum === 137 || idNum === 80002) return 'POL'   // Polygon mainnet & Amoy
  if (idNum === 1 || idNum === 11155111) return 'ETH'  // Ethereum mainnet & Sepolia
  return 'ETH'
}
// function formatToken(wei, decimals = 18, precision = 4) {
//   try {
//     const neg = wei < 0n
//     const x = neg ? -wei : wei
//     const base = 10n ** BigInt(decimals)
//     const integer = x / base
//     let fraction = (x % base).toString().padStart(decimals, '0')
//     fraction = fraction.slice(0, precision).replace(/0+$/, '')
//     return `${neg ? '-' : ''}${integer.toString()}${fraction ? '.' + fraction : ''}`
//   } catch { return '0' }
// }
// const balanceText = computed(() => `${formatToken(balanceWei.value, 18, 4)} ${nativeSymbol.value}`)

async function detectChain() {
  if (!window?.ethereum) return
  try {
    const id = await window.ethereum.request({ method: 'eth_chainId' })
    chainIdHex.value = id
    nativeSymbol.value = CHAIN_SYMBOL(Number(id))
  } catch {
    //
  }
}
async function refreshBalance() {
  if (!window?.ethereum || !account.value) { balanceWei.value = 0n; return }
  try {
    const hex = await window.ethereum.request({
      method: 'eth_getBalance',
      params: [account.value, 'latest']
    })
    balanceWei.value = BigInt(hex)
  } catch { balanceWei.value = 0n }
}
function onChainChanged(){
  detectChain()
  refreshBalance()
}

/* ---------- API helper ---------- */
const API_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/,'')
async function api(path, init){
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const headers = { ...(init?.headers || {}), 'x-wallet-address': walletAddress.value.toLowerCase() }
  if (init?.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { ...init, headers })
  const txt = await res.text().catch(()=> '')
  let data = null; try { data = txt ? JSON.parse(txt) : null } catch { data = { message: txt } }
  if (!res.ok) throw new Error(data?.error || data?.message || 'Request failed')
  return data
}

/* ---------- PURCHASE HISTORY (tanpa dummy) ---------- */
const orders = ref([]) // [{id,eventId,event,date,price,status}]
const loadingOrders = ref(false)
const errOrders = ref('')

const isoDate = (d) => {
  try { return new Date(d).toISOString().slice(0,10) } catch { return '' }
}
const fmtIdr = (v) => {
  const n = Math.abs(Number(v) || 0)
  return 'Rp '+ n.toLocaleString('id-ID')
}

function txToOrder(tx){
  return {
    id: tx.id,
    eventId: tx.ref_id || null,
    event: tx.event_title || null,
    date: isoDate(tx.created_at || Date.now()),
    price: fmtIdr(tx.amount),
    status: (tx.status || 'confirmed').replace(/^./, m => m.toUpperCase())
  }
}
async function loadHistory(){
  errOrders.value = ''
  if (!walletAddress.value) { orders.value = []; return }
  try {
    loadingOrders.value = true
    const txs = await api('/transactions') // backend mengembalikan daftar transaksi wallet
    const purchases = (Array.isArray(txs) ? txs : []).filter(t => (t.kind||'').toLowerCase() === 'purchase')
    let base = purchases.map(txToOrder)
    // const base = purchases.map(txToOrder)

    // Lengkapi judul event via /events/:id bila perlu
    const need = [...new Set(base.filter(b => b.eventId && !b.event).map(b => b.eventId))]
    if (need.length){
      const results = await Promise.allSettled(need.map(id => api(`/api/events/${id}`)))
      const map = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) map[need[i]] = r.value?.title || '(Unlisted)'
      })
      base.forEach(b => { if (!b.event && b.eventId && map[b.eventId]) b.event = map[b.eventId] })
    }
    base.sort ((a,b) => new Date(b.date) - new Date(a.date))
    orders.value = base.slice(0, 3)
  } catch (e) {
    errOrders.value = String(e?.message || e)
    orders.value = []
  } finally {
    loadingOrders.value = false
  }
}

/* ---------- REALTIME: update saldo & history ketika ada tx baru ---------- */
let socket = null
function startSocket(){
  stopSocket()
  if (!walletAddress.value) return
  socket = io(API_BASE, {
    transports: ['websocket'],
    auth: { address: walletAddress.value.toLowerCase() }
  })
  socket.on('tx:new', (tx) => {
    if ((tx?.wallet || '').toLowerCase() !== walletAddress.value.toLowerCase()) return
    refreshBalance()
    if ((tx.kind || '').toLowerCase() === 'purchase') {
      const row = txToOrder(tx)
      if (!row.event && row.eventId) {
        api(`/events/${row.eventId}`).then(ev => { row.event = ev?.title || row.event || '(Unlisted)' }).catch(()=>{})
      }
      if (orders.value.findIndex(o => o.id === row.id) === -1) orders.value.unshift(row)
    }
  })
}
function stopSocket(){ socket?.disconnect?.(); socket = null }

/* ---------- PROFILE META (placeholder aman) ---------- */
const displayName = ref('')
const email = ref('')
const short = s => s ? `${s.slice(0,6)}…${s.slice(-4)}` : ''
function copyAddr(){
  if (!walletAddress.value) return
  navigator.clipboard.writeText(walletAddress.value)
  alert('Wallet address copied.')
}

/* ---------- SVG AVATAR ---------- */
const profileSvg = computed(() => profileSvgRaw)

/* ---------- TOP UP URL ---------- */
// const topUpUrl = 'https://app.metamask.io/buy/build-quote'

/* ---------- lifecycle ---------- */
let balTimer = null
onMounted(async () => {
  await hydrateAccount()
  await detectChain()
  await refreshBalance()
  await loadHistory()
  if (walletAddress.value) startSocket()

  if (window?.ethereum?.on) {
    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)
  }
  balTimer = window.setInterval(refreshBalance, 15_000)
})
onBeforeUnmount(() => {
  if (window?.ethereum?.removeListener) {
    window.ethereum.removeListener('accountsChanged', onAccountsChanged)
    window.ethereum.removeListener('chainChanged', onChainChanged)
  }
  if (balTimer) clearInterval(balTimer)
  stopSocket()
})
watch(account, async () => { await detectChain(); await refreshBalance(); await loadHistory(); if (walletAddress.value) startSocket() })
</script>

<template>
  <div class="profile-page">
    <header class="header">
      <h1 class="sr-only">Profile</h1>
      <button class="hamburger" type="button" aria-label="Toggle sidebar" @click="toggleSidebar">
        <span></span><span></span><span></span>
      </button>
    </header>

    <DrawerNav v-model="sidebarOpen" />

    <div class="content">
      <div class="grid">
        <!-- LEFT: Profile card -->
        <aside class="profile-card">
          <div class="avatar">
            <div class="avatar-svg" v-html="profileSvg"></div>
          </div>
          <div class="profile-meta">
            <h3>{{ displayName }}</h3>
            <p class="addr">{{ email }}</p>
          </div>

          <div class="wallet-mini">
            <h3>Wallet</h3>
            <p class="acc">{{ short(walletAddress) || '-' }}</p>
            <button class="copy" :disabled="!walletAddress" @click="copyAddr">COPY</button>
          </div>
        </aside>

        <!-- RIGHT: Purchase history -->
        <section class="history-card">
          <h2>Purchase History</h2>

          <div v-if="errOrders" class="alert error" style="margin:10px 0">{{ errOrders }}</div>
          <div v-else-if="loadingOrders" class="alert" style="margin:10px 0">Loading…</div>

          <div v-else>
            <div class="thead">
              <div>Concert(s)</div>
              <div>Payment Date</div>
              <div>Price</div>
              <div>Status</div>
              <div>Action</div>
            </div>

            <div class="table">
              <div class="trow" v-for="o in orders" :key="o.id">
                <div data-col="Concert(s)">{{ o.event || '(Unknown Event)' }}</div>
                <div data-col="Payment Date">{{ o.date }}</div>
                <div data-col="Price">{{ o.price }}</div>
                <div data-col="Status">{{ o.status }}</div>
                <div data-col="Action">
                  <button class="detail-btn" :disabled="!o.eventId" @click="o.eventId && router.push(`/events/${o.eventId}`)">DETAIL</button>
                </div>
              </div>
            </div>
            <div class="see-all">
              <router-link to="/history">
                Lihat semua riwayat tiket →
              </router-link>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
