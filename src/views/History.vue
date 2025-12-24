<script setup>
import '@/assets/history.css'
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Drawer from '@/components/DrawerNav.vue'
import Tiket_Download from '@/components/Tiket_Download.vue'

/* ── sidebar ─────────────────────────────────────────────────── */
const route = useRoute()
const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

/* ── STATE ─────────────────────────────────────────────────────────────── */
const histories = ref([])        // [{ id, title, date, booking, price, status }]
const loading = ref(true)
const errorMsg = ref('')

/* ── CONST & MetaMask local state ──────────────────────────────────────── */
const hasMM = typeof window !== 'undefined' && !!window.ethereum
const POLYGON_CHAIN_ID_HEX = '0x13882' // Polygon Amoy
const API_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const CONTRACT = (
  import.meta.env?.VITE_TICKETS_CONTRACT ||
  import.meta.env?.VITE_TICKET_CONTRACT ||
  ''
).trim().toLowerCase()
const START_BLOCK = Number(import.meta.env?.VITE_TICKET_START_BLOCK || 0) || 0

// keccak256("Transfer(address,address,uint256)")
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// MetaMask account lokal (bukan dari composable)
const account = ref('')
const chainId = ref('')

async function hydrateAccount () {
  if (!hasMM) return
  try {
    const [acc] = await window.ethereum.request({ method: 'eth_accounts' })
    account.value = acc || ''
    chainId.value = await window.ethereum.request({ method: 'eth_chainId' }).catch(() => '')
    if (account.value) await ensureAmoy()
  } catch {
    // diabaikan, nanti errorMsg akan di-set di refreshHistory
  }
}

async function ensureAmoy () {
  if (!hasMM) return false
  if (chainId.value?.toLowerCase() === POLYGON_CHAIN_ID_HEX) return true
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID_HEX }]
    })
    chainId.value = POLYGON_CHAIN_ID_HEX
    return true
  } catch (err) {
    if (err?.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: POLYGON_CHAIN_ID_HEX,
            chainName: 'Polygon Amoy',
            rpcUrls: [
              import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://rpc-amoy.polygon.technology'
            ],
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            blockExplorerUrls: ['https://amoy.polygonscan.com']
          }]
        })
        chainId.value = POLYGON_CHAIN_ID_HEX
        return true
      } catch {
        // ignore
      }
    }
    return false
  }
}

/* ── HELPERS ───────────────────────────────────────────────────────────── */
function toTopicAddress (addr) {
  const hex = String(addr || '').toLowerCase().replace(/^0x/, '')
  return '0x' + '0'.repeat(24) + hex
}

function hexToDec (hexStr) {
  try { return BigInt(hexStr).toString(10) } catch { return '0' }
}

function hexBlock (n) {
  return '0x' + Math.max(0, Number(n || 0)).toString(16)
}

function fmtDate (ts) {
  try { return new Date(ts).toLocaleDateString('id-ID') } catch { return '' }
}

function fmtIdr(v) {
  const n = Math.abs(Number(v) || 0)
  return 'Rp ' + n.toLocaleString('id-ID')
}

/* ── BACKEND API helper (kirim x-wallet-address) ───────────────────────── */
async function api (path, init) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`

  const headers = {
    ...(init?.headers || {})
  }

  if (account.value) {
    headers['x-wallet-address'] = account.value.toLowerCase()
  }

  if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include'
  })

  const txt = await res.text().catch(() => '')
  let data
  try {
    data = txt ? JSON.parse(txt) : null
  } catch {
    data = { message: txt }
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Request failed')
  }

  return data
}

/* ── LOAD dari ledger backend (Supabase) ───────────────────────────────── */
async function loadLedgerPurchases () {
  // backend: GET /api/transactions → difilter oleh wallet x-wallet-address
  const list = await api('/api/transactions')
  const items = (Array.isArray(list) ? list : [])
    .filter(x => (x?.kind || '').toLowerCase() === 'purchase')
    .map(x => {
      const createdIso = x.created_at
      const ticketId = (x.id || '').toString()
      const booking = ticketId.replace(/-/g, '').slice(0, 16)

      return {
        _sortAt: +new Date(createdIso),
        id: x.id,
        title: 'Ticket purchase',
        date: fmtDate(createdIso),
        booking,
        price: fmtIdr(x.amount),
        status: x.status || 'Successful',

        // data tambahan untuk komponen tiket
        eventId: x.ref_id || null,
        ticketId,
        dateIso: createdIso,
        location: x.location || ''
      }
    })
  return items
}

/* ── LOAD ON-CHAIN NFT transfer ke wallet ini ──────────────────────────── */
async function loadOnchainTickets () {
  // Kalau belum ada MetaMask / wallet / alamat kontrak → skip saja
  if (!hasMM || !account.value || !CONTRACT) return []

  // Kalau tidak tahu block awal kontrak, jangan query logs biar tidak timeout
  if (!START_BLOCK) {
    console.warn('[history] START_BLOCK tidak diset, skip load tiket on-chain')
    return []
  }

  try {
    const fromBlock = hexBlock(START_BLOCK)
    const toBlock = 'latest'
    const topicTo = toTopicAddress(account.value)

    const logs = await window.ethereum.request({
      method: 'eth_getLogs',
      params: [{
        address: CONTRACT,
        fromBlock,
        toBlock,
        topics: [TOPIC_TRANSFER, null, topicTo]
      }]
    })

    const out = []
    for (const lg of logs) {
      const blk = await window.ethereum.request({
        method: 'eth_getBlockByNumber',
        params: [lg.blockNumber, false]
      }).catch(() => null)

      const tokenId = hexToDec(lg.topics?.[3] || '0x0')
      const tsMs = blk?.timestamp ? Number(BigInt(blk.timestamp) * 1000n) : Date.now()
      const ticketIdStr = String(tokenId)

      out.push({
        _sortAt: tsMs,
        id: `${lg.transactionHash}-${ticketIdStr}`,
        title: `NFT Ticket #${ticketIdStr}`,
        date: fmtDate(tsMs),
        booking: (lg.transactionHash || '').slice(0, 16),
        price: '—',
        status: 'Successful',

        eventId: null,
        ticketId: ticketIdStr,
        dateIso: new Date(tsMs).toISOString(),
        location: ''
      })
    }

    out.sort((a, b) => b._sortAt - a._sortAt)
    return out
  } catch (e) {
    console.warn('[history] gagal load tiket on-chain, di-skip', e)
    // JANGAN lempar error, cukup anggap tidak ada data on-chain
    return []
  }
}

/* ── REFRESH KOMBINASI (ledger + onchain) ──────────────────────────────── */
async function refreshHistory () {
  loading.value = true
  errorMsg.value = ''
  histories.value = []

  try {
    if (!hasMM) {
      errorMsg.value = 'MetaMask tidak terdeteksi di browser.'
      return
    }
    if (!account.value) {
      errorMsg.value = 'Silakan koneksikan MetaMask terlebih dahulu.'
      return
    }

    // 1) Ledger dari backend → WAJIB berhasil
    const ledger = await loadLedgerPurchases().catch(e => {
      console.error('[history] ledger error', e)
      throw e
    })

    // 2) Tiket on-chain → OPTIONAL, kalau gagal ya sudah
    let onchain = []
    try {
      onchain = await loadOnchainTickets()
    } catch (e2) {
      console.warn('[history] on-chain history gagal, di-skip', e2)
    }

    const all = [...ledger, ...onchain].sort((a, b) => b._sortAt - a._sortAt)
    histories.value = all
  } catch (e) {
    console.error('[history] gagal load', e)
    errorMsg.value = String(e?.message || e) || 'Gagal memuat riwayat pembelian tiket.'
  } finally {
    loading.value = false
  }
}

// function downloadTicket (row) {
//   // nanti bisa diganti generate PDF / QR code
//   alert(`Downloading ticket: ${row.title} (${row.booking})`)
// }

/* ── EVENT LISTENERS ───────────────────────────────────────────────────── */
function onAccountsChanged (accs) {
  account.value = accs?.[0] || ''
  refreshHistory()
}

function onChainChanged (cid) {
  chainId.value = cid || ''
  refreshHistory()
}

/* ── MOUNT / UNMOUNT ───────────────────────────────────────────────────── */
onMounted(async () => {
  await hydrateAccount()
  await refreshHistory()

  if (hasMM) {
    window.ethereum.on?.('accountsChanged', onAccountsChanged)
    window.ethereum.on?.('chainChanged', onChainChanged)
  }
})

onUnmounted(() => {
  if (hasMM) {
    window.ethereum.removeListener?.('accountsChanged', onAccountsChanged)
    window.ethereum.removeListener?.('chainChanged', onChainChanged)
  }
})
</script>

<template>
  <div class="history-page">
    <header class="topbar">
      <div class="brand">
        <img src="/logo_with_text.png" alt="AsiqTIX" />
      </div>
      <h1 class="title">History</h1>
      <button class="hamburger" aria-label="Toggle menu" @click="toggleSidebar">
        <span /><span /><span />
      </button>
    </header>

    <!-- posisikan sidebar di kanan atas -->
    <Drawer v-model="sidebarOpen" extraClass="sb-topright" />

    <main class="wrap">
      <h2 class="section-title">Riwayat Tiket</h2>

      <div v-if="loading" class="alert">Loading…</div>
      <div v-else-if="errorMsg" class="alert error">{{ errorMsg }}</div>

      <ul v-else class="list" role="list">
        <li v-for="row in histories" :key="row.id" class="item">
          <div class="header-line">
            <h3 class="event">{{ row.title }}</h3>
            <Tiket_Download
              :event-id="row.eventId"
              :ticket-code="row.ticketId || row.booking"
              :fallback-title="row.title"
              :fallback-date="row.dateIso || row.date"
              :fallback-location="row.location"
            />
          </div>
          <div class="meta">
            <p><strong>Date:</strong> {{ row.date }}</p>
            <p><strong>ID:</strong> {{ row.booking }}</p>
            <p><strong>Price:</strong> {{ row.price }}</p>
            <p><strong>Status:</strong> {{ row.status }}</p>
          </div>
        </li>

        <!-- placeholder kalau belum ada history -->
        <li v-if="!histories.length" class="item">
          <div class="header-line">
            <h3 class="event">—</h3>
            <button class="btn" disabled>DOWNLOAD TICKET</button>
          </div>
          <div class="meta">
            <p><strong>Date:</strong> —</p>
            <p><strong>ID:</strong> —</p>
            <p><strong>Price:</strong> —</p>
            <p><strong>Status:</strong> —</p>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>
