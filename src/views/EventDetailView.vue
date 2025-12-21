<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ethers } from 'ethers'
import { useMetamask } from '@/composables/useMetamask'
import SideNavSB from '@/components/SideNavSB.vue'
import Purchase_Success_Dialog from '@/components/Purchase_Success_Dialog.vue'
import Purchase_Error_Dialog from '@/components/Purchase_Error_Dialog.vue'
import { ASIQTIX_TICKETS_ABI } from '@/abi/asiqtixTicketsSimpleV3'

const route = useRoute()
const r = useRouter()
const { ensureChain } = useMetamask()
const TICKETS_CONTRACT = import.meta.env.VITE_TICKETS_CONTRACT || ''


const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

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

const ev = ref(null)
const loading = ref(true)
const errorMsg = ref('')
const buying = ref(false)
const buyMsg = ref('')
const showPurchaseSuccess = ref(false)
const showPurchaseError = ref(false)
const lastPurchase = ref(null)
const lastPurchaseError = ref('')


const role = ref('customer')

const isAdmin = computed(() => role.value === 'admin')
// const isPromoter = computed(() => role.value === 'promoter')

// ===================== 
// Withdrawal logic for promoter/admin 
// =====================

// alamat wallet yang sedang login (dari localStorage)
const walletAddress = computed(() => (wallet() || '').toLowerCase())

// cek apakah wallet ini adalah promotor event ini (berdasarkan kolom promoter_wallet di DB)
const isEventPromoter = computed(() => {
  if (!ev.value) return false
  const promoterWallet = (ev.value.promoter_wallet || '').toLowerCase()
  return promoterWallet && walletAddress.value && promoterWallet === walletAddress.value
})

// saldo promotor dari smart contract (dalam wei)
const promoterBalanceWei = ref(0n)

const promoterBalanceEth = computed(() => {
  try {
    return ethers.formatEther(promoterBalanceWei.value || 0n)
  } catch {
    return '0.0'
  }
})

const hasPromoterBalance = computed(() => promoterBalanceWei.value > 0n)

const withdrawing = ref(false)
const withdrawMsg = ref('')
const withdrawTxHash = ref('')

// event dianggap "selesai" kalau waktu event (date_iso) <= sekarang
const isEventFinished = computed(() => {
  if (!ev.value?.date_iso) return false
  const dt = new Date(ev.value.date_iso)
  if (Number.isNaN(dt.getTime())) return false
  return dt.getTime() <= Date.now()
})

// siapa saja yang boleh melihat tools promotor di UI
const canSeePromoterTools = computed(() => isAdmin.value || isEventPromoter.value)

// boleh tekan tombol withdraw kalau:
// - dia promotor / admin, event sudah selesai, ada saldo di kontrak
const canWithdrawPromoter = computed(() =>
  canSeePromoterTools.value && isEventFinished.value && hasPromoterBalance.value
)

async function buyTicket() {
  if (!ev.value) return

  if (!wallet()) {
    buyMsg.value = 'Wallet belum terhubung.'
    return
  }

  if (!TICKETS_CONTRACT) {
    buyMsg.value = 'Alamat kontrak VITE_TICKETS_CONTRACT belum di-set.'
    return
  }

  const chainEventId = Number(ev.value.chain_event_id || 0)
  if (!chainEventId) {
    buyMsg.value = 'Event ini belum di-link ke kontrak (chain_event_id kosong).'
    return
  }

  try {
    buying.value = true
    buyMsg.value = ''

    await ensureChain('amoy')
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()

    const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    // TODO kalau mau: ambil quantity dari input
    const quantity = 1n

    // 1) Ambil data event on-chain, termasuk priceWei
    const onchain = await contract.events(chainEventId)
    const unitPriceWei = onchain.priceWei
    if (unitPriceWei <= 0n) throw new Error('Harga tiket on-chain tidak valid')
    if (!onchain.active) throw new Error('Event ini tidak aktif lagi')

    const totalPriceWei = unitPriceWei * quantity

    console.log('[DEBUG BUY] chainEventId', chainEventId)
    console.log('[DEBUG BUY] on-chain event:', {
      promoter: onchain.promoter,
      priceWei: onchain.priceWei.toString(),
      maxSupply: onchain.maxSupply.toString(),
      sold: onchain.sold.toString(),
      active: onchain.active
    })
    console.log('[DEBUG BUY] quantity', quantity.toString())
    console.log('[DEBUG BUY] totalPriceWei (value yg dikirim)', totalPriceWei.toString())

    // 2) Panggil buyTicket di kontrak
    const tx = await contract.buyTicket(chainEventId, quantity, {
      value: totalPriceWei
    })
    const receipt = await tx.wait()
    if (!receipt.status) throw new Error('Transaksi di blockchain gagal')

    // 3) Catat transaksi off-chain di backend
    await api('/purchase', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(ev.value.price_idr || 0) || 0,   // simpan harga IDR untuk halaman history
        ref_id: ev.value.id,
        description: 'On-chain purchase', 
        tx_hash: tx.hash
      })
    })

    ev.value.sold_tickets = 
      Number(ev.value.sold_tickets ?? 0) + Number(quantity)
    // hitung harga dalam POL untuk ditampilkan di struk
    const unitPricePol = Number(ethers.formatEther(unitPriceWei))
    const totalPol = Number(ethers.formatEther(totalPriceWei))

    lastPurchase.value = {
      eventTitle: ev.value.title,
      venue: ev.value.venue,
      dateText: dateText.value,
      quantity: Number(quantity),
      pricePerTicketPol: unitPricePol,
      totalPol,
      txHash: tx.hash
    }

    buyMsg.value = 'Tiket berhasil dibeli! NFT tiket tersimpan di wallet kamu.'
    showPurchaseSuccess.value = true
  } catch (e) {
    console.error('[BUY ERROR RAW]', e)

    const rpcErr = e?.info?.error || e?.error || e
    const reason =
      e?.reason ||
      e?.shortMessage ||
      rpcErr?.data?.message ||
      rpcErr?.message ||
      e?.message ||
      'Unknown error'

    buyMsg.value = `Gagal membeli tiket: ${reason}`
    lastPurchaseError.value = buyMsg.value
    showPurchaseError.value = true
  } finally {
    buying.value = false
  }
}

// =====================
// ambil role di backend
//======================

async function loadRole () {
  if (!wallet()) {
    role.value = 'customer'
    return
  }
  try {
    const me = await api('/api/me')
    role.value = me?.role || 'customer'   // 'admin' | 'promoter' | 'customer'
  } catch {
    role.value = 'customer'
  }
}

// =================
// Ambil saldo promotor dari kontrak
// =================

async function loadPromoterBalance () {
  promoterBalanceWei.value = 0n
  withdrawMsg.value = ''

  if (!TICKETS_CONTRACT) return
  if (!wallet()) return
  if (!ev.value?.chain_event_id) return

  try {
    await ensureChain('amoy')  // sama seperti di buyTicket
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    const chainEventId = Number(ev.value.chain_event_id || 0)
    if (!chainEventId) return

    const bal = await contract.promoterBalances(chainEventId)
    const bi = typeof bal === 'bigint' ? bal : BigInt(bal.toString())
    promoterBalanceWei.value = bi
  } catch (e) {
    console.error('[promoterBalance] gagal load', e)
    withdrawMsg.value = 'Gagal memuat saldo promotor.'
  }
}

//============
// Tombol tarik dana promotor
//============

async function withdrawPromoter () {
  withdrawMsg.value = ''

  if (!canSeePromoterTools.value) {
    withdrawMsg.value = 'Anda tidak berhak menarik dana event ini.'
    return
  }

  if (!ev.value?.chain_event_id) {
    withdrawMsg.value = 'Event ini belum di-link ke kontrak.'
    return
  }

  if (!TICKETS_CONTRACT) {
    withdrawMsg.value = 'Alamat kontrak belum dikonfigurasi.'
    return
  }

  try {
    withdrawing.value = true

    await ensureChain('amoy')
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    const chainEventId = Number(ev.value.chain_event_id || 0)
    if (!chainEventId) {
      withdrawMsg.value = 'Event belum punya ID on-chain.'
      return
    }

    const amountWei = promoterBalanceWei.value || 0n
    const amountPol = Number(ethers.formatEther(amountWei))

    // 1) Cek dulu pakai staticCall: kalau bakal revert, kita dapat reason-nya
    try {
      await contract.withdrawPromoter.staticCall(chainEventId)
    } catch (err) {
      console.error('[withdrawPromoter staticCall]', err)

      const rpcErr = err?.info?.error || err?.error || err
      let reason =
        err?.reason ||
        err?.shortMessage ||
        rpcErr?.data?.message ||
        rpcErr?.message ||
        err?.message ||
        'Unknown error'

      if (reason.includes('EVENT_NOT_FINISHED')) {
        withdrawMsg.value =
          'Event belum selesai di blockchain. Dana baru bisa ditarik setelah waktu event terlewati.'
      } else if (reason.includes('NO_BALANCE')) {
        withdrawMsg.value = 'Tidak ada saldo yang bisa ditarik untuk event ini.'
      } else if (reason.includes('NOT_EVENT_PROMOTER')) {
        withdrawMsg.value = 'Wallet ini bukan promotor event ini (atau Anda bukan owner kontrak).'
      } else if (reason.includes('EVENT_NOT_FOUND')) {
        withdrawMsg.value = 'Event dengan ID tersebut tidak ditemukan di kontrak.'
      } else {
        withdrawMsg.value = `Gagal menarik dana: ${reason}`
      }
      return // JANGAN kirim transaksi kalau staticCall gagal
    }

    // 2) Kalau lolos staticCall, baru kirim transaksi sebenarnya
    const tx = await contract.withdrawPromoter(chainEventId)
    const receipt = await tx.wait()
    if (!receipt.status) throw new Error('Transaksi withdraw gagal di blockchain')

    withdrawTxHash.value = tx.hash

    // 3) Simpan log di backend (opsional, kalau gagal tidak mempengaruhi on-chain)
    try {
      await api('/withdraw-log', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountPol,
          ref_id: ev.value.id,
          description: `Withdraw hasil penjualan event ${ev.value.title || ev.value.id}`,
          tx_hash: tx.hash
        })
      })
    } catch (err) {
      console.error('[withdraw-log] gagal simpan ke backend', err)
    }

    withdrawMsg.value = 'Penarikan dana berhasil dikirim ke wallet.'
    await loadPromoterBalance()
  } catch (e) {
    console.error('[withdrawPromoter]', e)

    const rpcErr = e?.info?.error || e?.error || e
    let reason =
      e?.reason ||
      e?.shortMessage ||
      rpcErr?.data?.message ||
      rpcErr?.message ||
      e?.message ||
      'Unknown error'

    withdrawMsg.value = `Gagal menarik dana: ${reason}`
  } finally {
    withdrawing.value = false
  }
}
///=====================

//====================
// Withdraw Admin
//====================
const adminFeeBalanceWei = ref(0n)
const adminFeeBalanceEth = computed(() => {
  try { return ethers.formatEther(adminFeeBalanceWei.value || 0n) }
  catch { return '0.0' }
})
const adminWithdrawing = ref(false)
const adminWithdrawMsg = ref('')

const hasAdminFeeBalance = computed(() => adminFeeBalanceWei.value > 0n)
const canWithdrawAdminFee = computed(() =>
  isAdmin.value && hasAdminFeeBalance.value
)

async function loadAdminFeeBalance () {
  adminFeeBalanceWei.value = 0n
  adminWithdrawMsg.value = ''

  if (!TICKETS_CONTRACT) return
  if (!wallet()) return
  if (!ev.value?.chain_event_id) return

  try {
    await ensureChain('amoy')
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    const chainEventId = Number(ev.value.chain_event_id || 0)
    if (!chainEventId) return

    const bal = await contract.feeBalances(chainEventId)
    const bi = typeof bal === 'bigint' ? bal : BigInt(bal.toString())
    adminFeeBalanceWei.value = bi
  } catch (e) {
    console.error('[adminFeeBalance] gagal load', e)
    adminWithdrawMsg.value = 'Gagal memuat saldo admin.'
  }
}

async function withdrawAdminFee () {
  adminWithdrawMsg.value = ''
  if (!canWithdrawAdminFee.value) return
  if (!TICKETS_CONTRACT) { adminWithdrawMsg.value = 'Alamat kontrak belum dikonfigurasi.'; return }

  try {
    adminWithdrawing.value = true
    await ensureChain('amoy')
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    const chainEventId = Number(ev.value.chain_event_id || 0)
    const bal = await contract.feeBalances(chainEventId)
    const bi = typeof bal === 'bigint' ? bal : BigInt(bal.toString())
    const amountPol = Number(ethers.formatEther(bi || 0n))

    const tx = await contract.withdrawFees(chainEventId)
    const receipt = await tx.wait()
    if (!receipt.status) throw new Error('Transaksi gagal di blockchain')

    try {
      await api('/withdraw-log', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountPol,
          ref_id: ev.value.id, // id event di DB
          description: `Withdraw fee admin event ${ev.value.title || ev.value.id}`,
          tx_hash: tx.hash
        })
      })
    } catch (err) {
      console.error('[withdraw-log admin] gagal simpan ke backend', err)
      // tidak usah throw, yang penting penarikan on-chain sudah sukses
    }

    adminWithdrawMsg.value = 'Fee admin berhasil ditarik ke wallet.'
    await loadAdminFeeBalance()
  } catch (e) {
    console.error('[withdrawAdminFee] error', e)
    let msg = String(e?.reason || e?.message || e || '')
    if (msg.includes('NO_FEE')) msg = 'Tidak ada fee yang bisa ditarik.'
    if (msg.includes('NOT_ADMIN')) msg = 'Wallet ini bukan admin/feeRecipient di kontrak.'
    adminWithdrawMsg.value = msg
  } finally {
    adminWithdrawing.value = false
  }
}
//====================

const dateText = computed(() => {
  const d = ev.value?.date_iso ? new Date(ev.value.date_iso) : null
  if (!d) return '-'
  const ds = d.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'2-digit' })
  const ts = d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  return `${ds}, ${ts.replaceAll('.',':')}`.replace(/:/g,'.')
})

const priceText = computed(() => {
  const n = Number(ev.value?.price_idr || 0)
  if (!n) return '-'
  return `Rp ${n.toLocaleString('id-ID')}`  // return `${n.toLocaleString('en-US', { maximumFractionDigits: 6 })} POL` diganti 25-11-2025
})

const ticketsRemaining = computed(() => {
  if (!ev.value) return null
  const total = Number(ev.value.total_tickets ?? 0)
  const sold  = Number(ev.value.sold_tickets ?? 0)
  const remaining = total - sold
  if (!Number.isFinite(remaining) || remaining < 0) return 0
  return remaining
})

const isSoldOut = computed(() => {
  const total = Number(ev.value?.total_tickets ?? 0)
  return total > 0 && ticketsRemaining.value === 0
})

const heroBg = computed(() => `url(/Background.png)`)
const posterBg = computed(() => `url(${ev.value?.image_url || '/poster_fallback.jpg'})`)

function backToHome(){ r.push({ name: 'home' }) }

onMounted(async () => {
  try {
    loading.value = true
    const id = String(route.params.id || '')
    ev.value = await api(`/api/events/${id}`)

    // setelah event ke-load, baru cek role & saldo promotor
    await Promise.all([
      loadRole(),
      loadPromoterBalance(),
      loadAdminFeeBalance()
    ])
  } catch (e) {
    errorMsg.value = String(e.message || e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="event-page">
    <header class="topbar">
      <button class="back" @click="backToHome">← Back</button>
      <div class="brand"><img src="/logo_with_text.png" alt="Tickety" /></div>
      <h1 class="title">Event</h1>
      <button class="hamburger" aria-label="Toggle menu" @click="toggleSidebar"></button>
    </header>

    <SideNavSB v-model="sidebarOpen" extraClass="sb-topright" />

    <main>
      <div v-if="errorMsg" class="alert error">{{ errorMsg }}</div>
      <div v-else-if="loading" class="loading">Loading…</div>

      <section v-else class="hero" :style="{ '--hero': heroBg }">
        <div class="hero-inner">
          <div class="poster">
            <div class="poster-img" :style="{ backgroundImage: posterBg }"></div>
            <div class="poster-grad"></div>
          </div>

          <div class="info">
            <h2 class="event-title">{{ ev.title }}</h2>
            <div class="meta">
              <div class="row"><span class="k">Location:</span><span class="v">{{ ev.venue }}</span></div>
              <div class="row"><span class="k">Date:</span><span class="v">{{ dateText }}</span></div>
            </div>
            <p class="desc">{{ ev.description || 'No description.' }}</p>
          </div>

          <aside class="pricebox">
            <div class="label">Price</div>
            <div class="price">{{ priceText }}</div>

            <div class="stock" v-if="ev.total_tickets > 0">
              <span v-if="!isSoldOut">Tickets left: {{ ticketsRemaining }}</span>
              <span v-else class="sold-out">Sold out</span>
            </div>

            <button
              class="cta"
              :disabled="isSoldOut || buying"
              @click="buyTicket"
            >
              <span v-if="isSoldOut">SOLD OUT</span>
              <span v-else-if="buying">PROCESSING…</span>
              <span v-else>BUY TICKET</span>
            </button>

            <p v-if="buyMsg" class="buy-msg">{{ buyMsg }}</p>

             <!-- PROMOTER TOOLS -->
            <div
              v-if="canSeePromoterTools"
              class="promoter-tools"
            >
              <h3>Promoter Tools</h3>
              <p>Saldo dapat ditarik:</p>
              <p class="promoter-balance">
                <strong>{{ promoterBalanceEth }} POL</strong>
              </p>

              <p v-if="!isEventFinished" class="hint">
                Dana baru bisa ditarik setelah waktu event terlewati.
              </p>

              <p v-if="withdrawMsg" class="buy-msg">{{ withdrawMsg }}</p>
              <p v-if="withdrawTxHash" class="buy-msg">
                <a
                  :href="`https://amoy.polygonscan.com/tx/${withdrawTxHash}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Lihat transaksi di PolygonScan Amoy
                </a>
              </p>

              <button
                class="cta secondary"
                :disabled="withdrawing || !canWithdrawPromoter"
                @click="withdrawPromoter"
              >
                <span v-if="withdrawing">WITHDRAWING…</span>
                <span v-else-if="!hasPromoterBalance">NO FUNDS</span>
                <span v-else-if="!isEventFinished">WAIT EVENT FINISH</span>
                <span v-else>WITHDRAW TO WALLET</span>
              </button>
            </div>

            <!-- ADMIN TOOLS -->
            <div v-if="isAdmin" class="promoter-tools" style="margin-top:1.5rem;">
              <h3>Admin Fee</h3>
              <p>Saldo fee admin yang bisa ditarik:</p>
              <p class="promoter-balance">
                <strong>{{ adminFeeBalanceEth }} POL</strong>
              </p>
              <p v-if="adminWithdrawMsg" class="buy-msg">{{ adminWithdrawMsg }}</p>
              <button
                class="cta secondary"
                :disabled="adminWithdrawing || !canWithdrawAdminFee"
                @click="withdrawAdminFee"
              >
                <span v-if="adminWithdrawing">WITHDRAWING…</span>
                <span v-else-if="!hasAdminFeeBalance">NO FEE</span>
                <span v-else>WITHDRAW ADMIN FEE</span>
              </button>
            </div>
          </aside>
        </div>
      </section>
    </main>

    <!-- POPUP STRUK PEMBELIAN -->
    <Purchase_Success_Dialog
      v-if="showPurchaseSuccess && lastPurchase"
      :open="showPurchaseSuccess"
      :event-title="lastPurchase.eventTitle"
      :venue="lastPurchase.venue"
      :date-text="lastPurchase.dateText"
      :quantity="lastPurchase.quantity"
      :price-per-ticket-pol="lastPurchase.pricePerTicketPol"
      :total-pol="lastPurchase.totalPol"
      :tx-hash="lastPurchase.txHash"
      @close="showPurchaseSuccess = false"
    />

    <!-- POPUP ERROR PEMBELIAN -->
    <Purchase_Error_Dialog
      v-if="showPurchaseError"
      :open="showPurchaseError"
      :message="lastPurchaseError || buyMsg"
      @close="showPurchaseError = false"
    />
  </div>
</template>

<style scoped>
.event-page{
  --ink:#e6e8ef; --accent:#f0b35a; --topbar:#0b0d12; --border:#2a3342;
  --topbar-h:64px;
  background:#0b0f17; color:var(--ink); min-height:100vh;
}
.topbar{
  position:sticky; top:0; z-index:20;
  display:grid; grid-template-columns:auto 120px 1fr 48px; align-items:center; gap:12px;
  height:var(--topbar-h);
  padding:14px 18px; background:var(--topbar);
  border-bottom:1px solid rgba(255,255,255,.08);
}
.brand img{ height:48px; width:auto; display:block; }
.title{ margin:0; font-weight:900; letter-spacing:.02em; font-size:clamp(18px,2.4vw,28px); color:var(--accent) }
.hamburger{ width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:10px; cursor:pointer }
.hamburger span{ width:18px; height:2px; background:#fff; display:block; margin:2px 0; border-radius:2px }
.back{ border:1px solid #232747; background:#F4F1DE; color:#232747; border-radius:10px; padding:8px 12px; cursor:pointer; font-weight:800 }
.loading{ padding:24px 22px }
.alert.error{ margin:16px 22px; padding:10px 14px; background:#9f3a38; border-radius:10px }
.hero{
  position:relative;
  min-height:calc(100vh - var(--topbar-h));
  display:flex; align-items:center;
  background:#0b0f17
}
.hero::before{
  content:"";
  position:absolute; inset:0;
  background:
    linear-gradient(180deg, rgba(0,0,0,.22) 0%, rgba(0,0,0,.7) 85%),
    linear-gradient(90deg, rgba(165,34,34,.50) 0%, rgba(0,0,0,0) 45%),
    var(--hero);
  background-size:cover;
  background-position:center top;
  filter:brightness(.95)
}
.hero-inner{
  position:relative; z-index:1;
  max-width:1200px; margin:0 auto; padding:48px 22px;
  width:100%;
  display:grid; grid-template-columns:360px 1fr 260px; gap:28px; align-items:center
}
.poster{
  position:relative; width:100%; height:300px; border-radius:18px; overflow:hidden;
  box-shadow:0 18px 42px rgba(0,0,0,.46)
}
.poster-img{ position:absolute; inset:0; background-size:cover; background-position:center }
.poster-grad{ position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(179,31,31,.65) 100%); mix-blend-mode:multiply }
.info .event-title{ margin:0 0 12px; font-weight:900; color:#fff; letter-spacing:.15em; font-size:44px }
.meta{ margin:6px 0 10px }
.row{ display:flex; gap:10px; margin:6px 0 }
.k{ width:100px; font-weight:800 }
.v{ font-weight:700; color:#d6e1ff }
.desc{ margin-top:8px; max-width:640px; line-height:1.55; color:#e3e7ef }
.pricebox{
  align-self:start; background:rgba(15,19,27,.9); border:1px solid var(--border); border-radius:16px;
  padding:18px; min-width:240px; box-shadow:0 16px 36px rgba(0,0,0,.36);
  display:grid; gap:12px
}
.pricebox .label{ opacity:.85 }
.pricebox .price{ font-size:30px; font-weight:900 }
.cta{ padding:10px 14px; border-radius:12px; border:1px solid transparent; background:#F4B23D; color:#281c06; font-weight:900; cursor:pointer }
.event-page :deep(.sb-card.sb-topright){
  position:fixed;
  top:calc(var(--topbar-h) + 10px);
  right:18px; bottom:18px; left:auto;
  width:min(86vw, 320px);
  max-height:calc(100svh - (var(--topbar-h) + 10px) - 18px);
  overflow:auto;
  z-index:1050
}

.stock{
  margin-top:8px;
  font-size:13px;
  font-weight:600;
  color:#e3e7ef;
}
.stock .sold-out{
  color:#ff6b6b;
}
.buy-msg{
  margin-top:8px;
  font-size:12px;
}

.promoter-tools{
  margin-top:16px;
  padding-top:12px;
  border-top:1px solid rgba(255,255,255,.1);
  font-size:14px;
}
.promoter-balance{
  font-size:16px;
  margin:4px 0 8px;
}
.promoter-tools .hint{
  font-size:12px;
  opacity:.8;
}
.promoter-tools .cta.secondary{
  margin-top:8px;
  background:transparent;
  border:1px solid var(--accent);
  color:var(--accent);
}
.promoter-tools .cta.secondary:disabled{
  opacity:.4;
}

.event-page :deep(.sb-backdrop){ display:none }
@media (max-width:1100px){
  .hero-inner{ grid-template-columns:1fr }
  .poster{ height:240px }
  .pricebox{ justify-self:start }
}
@media (max-width:720px){
  .event-page{ --topbar-h:56px }
  .brand img{ height:40px; }
  .event-page :deep(.sb-card.sb-topright){
    top:0; right:0; bottom:0; left:auto;
    width:min(86vw, 340px);
    border-radius:16px 0 0 16px; padding:18px 16px;
    box-shadow:-12px 0 36px rgba(0,0,0,.28)
  }
  .event-page :deep(.sb-backdrop){
    position:fixed; inset:0; background:rgba(0,0,0,.50);
    backdrop-filter:blur(2px); z-index:1000; display:block
  }
}
</style>
