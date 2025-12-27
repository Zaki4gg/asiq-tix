<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SideNavSB from '@/components/SideNavSB.vue'
import { useMetamask } from '@/composables/useMetamask'
import { ethers } from 'ethers'
import { ASIQTIX_TICKETS_ABI } from '@/abi/asiqtixTicketsSimpleV3'

const route = useRoute()
const r = useRouter()

const sidebarOpen = ref(false)
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value)
watch(() => route.fullPath, () => (sidebarOpen.value = false))

const { account, ensureChain } = useMetamask() // ⬅️ ambil connect & ensureChain juga
const TICKETS_CONTRACT = import.meta.env.VITE_TICKETS_CONTRACT || ''  // ⬅️ sama kayak di EventDetailView
const rootStyle = computed(() => ({ '--hero-img': 'url(/Background.png)' }))

const RAW_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_HOST = RAW_BASE.replace(/\/api$/i, '')
const getWallet = () => (account.value || localStorage.getItem('walletAddress') || '').toString()

function withWalletParam(url) {
  const w = getWallet()
  if (!w) return url
  return url + (url.includes('?') ? '&' : '?') + 'wallet=' + encodeURIComponent(w)
}

async function convertIdrToWei(amountIdr) {
  const res = await api('/api/price/idr-to-wei', {
    method: 'POST',
    body: JSON.stringify({ amount_idr: amountIdr })
  })
  if (!res || !res.price_wei) throw new Error('Gagal konversi')
  // kalau backend juga kirim idr_per_pol, boleh sekalian simpan buat tampilan:
  if (res.idr_per_pol) {
    polRateIdr.value = Number(res.idr_per_pol)
  }
  return BigInt(res.price_wei)
}



async function api(path, options = {}) {
  const full = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`
  const method = String(options?.method || 'GET').toUpperCase()
  let url = `${API_HOST}${full}`
  if (method === 'GET') url = withWalletParam(url)
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

async function uploadImageFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API_HOST}/api/upload`, {
    method: 'POST',
    headers: { 'x-wallet-address': getWallet() },
    body: fd
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
  if (!data?.url || !/^https?:\/\//i.test(data.url)) throw new Error('Upload gagal: URL tidak valid')
  return data.url
}

const role = ref('customer')
const isAdmin = computed(() => role.value === 'admin')
const isPromoter = computed(() => role.value === 'promoter')
const heroTitle = computed(() =>
  (isAdmin.value || isPromoter.value)
    ? 'CREATE A NEW EVENT'
    : 'UPCOMING CONCERT'
)
// const heroTitle = computed(() => (isAdmin.value ? 'CREATE A NEW EVENT' : 'UPCOMING CONCERT'))

const walletAddress = computed(() => (getWallet() || ''). toLowerCase())
function canManageEvent (ev) {
  // Admin boleh semua
  if (isAdmin.value) return true

  // Promoter hanya boleh event yang promoter_wallet = wallet-nya
  if (isPromoter.value) {
    return (ev.promoter_wallet || '').toLowerCase() === walletAddress.value
  }
  // Customer nggak boleh apa-apa
  return false
}

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

async function loadRole() {
  const w = getWallet()
  if (!w) {
    role.value = 'customer'
    return }
  try {
    const me = await api('/api/me')
    role.value = me?.role || 'customer' //backend sekarang balikin 3 level  //'admin' ? 'admin' : 'user'
    // localStorage.setItem('user_role', role.value) //opsional : simpan biar komponen lain bisa baca cepat
  } catch {
    role.value = 'customer'
  }
}

const loading = ref(false)
const errorMsg = ref('')
const events = ref([])

async function loadEvents() {
  loading.value = true; errorMsg.value = ''
  try {
    const qs = isAdmin.value ? '?all=1' : ''
    const res = await api(`/api/events${qs}`)
    events.value = Array.isArray(res?.items) ? res.items : []
  } catch (e) {
    errorMsg.value = String(e.message || e)
  } finally {
    loading.value = false
  }
}

function onAccountsChanged(accs) {
  account.value = accs?.[0] || ''
  loadRole(); loadEvents()
}
onMounted(async () => {
  await hydrateAccount()
  if (window?.ethereum?.on) window.ethereum.on('accountsChanged', onAccountsChanged)
  await loadRole()
  await loadEvents()
})
onBeforeUnmount(() => {
  if (window?.ethereum?.removeListener) window.ethereum.removeListener('accountsChanged', onAccountsChanged)
})
watch(account, async () => { await loadRole(); await loadEvents() })

const searchQuery = ref('')
const filteredEvents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return events.value
  return events.value.filter(ev =>
    [ev.title, ev.venue, ev.description].some(s => String(s || '').toLowerCase().includes(q))
  )
})

function buyTicket(ev) {
  r.push({ name: 'event', params: { id: ev.id } })
}

const showCreate = ref(false)
const showEdit = ref(false)

const newEvent = reactive({
  title: '',
  date_iso: '',
  venue: '',
  description: '',
  image_url: '',
  price_idr: 0,
  total_tickets: 0,
  listed: true
})
const newImageFile = ref(null)
const newImagePreview = ref('')
const uploading = ref(false)
// gambar NFT
const newNftImageFile = ref(null)
const newNftImagePreview = ref('')
const newNftImageUrl = ref('')

// tampilan harga rupiah (dengan titik), sedangkan newEvent.price_idr tetap number polos
const priceIdrDisplay = ref('')
// rate POL/IDR dari backend
const polRateIdr = ref(null)      // 1 POL = berapa IDR
const polRateLoading = ref(false)
const polRateError = ref('')

// --- FORMAT HARGA IDR ---
function formatIdr(num) {
  if (!num) return ''
  const s = String(num)
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function onPriceIdrInput(e) {
  let raw = e.target.value || ''

  // buang semua selain angka
  raw = raw.replace(/[^\d]/g, '')

  if (!raw) {
    newEvent.price_idr = 0
    priceIdrDisplay.value = ''
    return
  }

  const num = Number(raw)
  newEvent.price_idr = num
  priceIdrDisplay.value = formatIdr(num)
}

// kalau newEvent.price_idr berubah dari kode, tampilan ikut berubah
watch(
  () => newEvent.price_idr,
  (val) => {
    priceIdrDisplay.value = val ? formatIdr(val) : ''
  }
)

function onNewImageChange(e) {
  const f = e?.target?.files?.[0]
  newImageFile.value = f || null
  if (newImagePreview.value) URL.revokeObjectURL(newImagePreview.value)
  newImagePreview.value = f ? URL.createObjectURL(f) : ''
}

// --- HANDLE GAMBAR NFT ---
function onNftImageChange(e) {
  const file = e.target.files?.[0]
  if (!file) {
    newNftImageFile.value = null
    if (newNftImagePreview.value) {
      URL.revokeObjectURL(newNftImagePreview.value)
    }
    newNftImagePreview.value = ''
    newNftImageUrl.value = ''
    return
  }

  newNftImageFile.value = file
  if (newNftImagePreview.value) {
    URL.revokeObjectURL(newNftImagePreview.value)
  }
  newNftImagePreview.value = URL.createObjectURL(file)
}

// --- RATE POL/IDR + KONVERSI IDR -> WEI ---
async function fetchPolRate() {
  try {
    polRateLoading.value = true
    polRateError.value = ''
    const res = await api('/api/price/pol')   // backend kamu yang sekarang
    const price = Number(res?.price_idr || 0)
    if (!price) throw new Error('Harga tidak valid')
    polRateIdr.value = price
  } catch (err) {
    console.error(err)
    polRateError.value = 'Gagal mengambil harga POL/IDR'
  } finally {
    polRateLoading.value = false
  }
}

// dipanggil otomatis saat modal Create dibuka
watch(showCreate, (val) => {
  if (val) {
    fetchPolRate()
  }
})

// konversi untuk tampilan realtime
const priceInPol = computed(() => {
  if (!polRateIdr.value) return null
  const idr = Number(newEvent.price_idr || 0)
  if (!idr) return null
  const pol = idr / polRateIdr.value
  if (!isFinite(pol)) return null
  return pol
})

const EVENT_CREATE_WINDOW_DAYS = 7

function startOfTodayLocal(now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

function cutoffLocal(now = new Date()) {
  const s = startOfTodayLocal(now)
  s.setDate(s.getDate() + EVENT_CREATE_WINDOW_DAYS)
  return s
}

function assertEventDateAllowedFromLocalInput(dtLocal) {
  if (!dtLocal) throw new Error('Tanggal wajib diisi')

  const eventDate = new Date(dtLocal)
  if (Number.isNaN(eventDate.getTime())) throw new Error('Tanggal tidak valid')

  const now = new Date()
  if (eventDate.getTime() < now.getTime()) {
    throw new Error('Tanggal event tidak boleh di masa lalu')
  }

  const cutoff = cutoffLocal(now)
  if (eventDate.getTime() > cutoff.getTime()) {
    const cutoffText = cutoff.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    throw new Error(`Tanggal event maksimal sampai ${cutoffText}`)
  }
}

function toDateTimeLocalValue(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function minEventDateLocalValue() {
  const now = new Date()
  const d = new Date(now)
  d.setSeconds(0, 0)
  if (d.getTime() < now.getTime()) d.setMinutes(d.getMinutes() + 1)
  return toDateTimeLocalValue(d)
}

function maxEventDateLocalValue() {
  return toDateTimeLocalValue(cutoffLocal(new Date()))
}

function toIso(dtLocal) {
  if (!dtLocal) return ''
  const d = new Date(dtLocal)
  if (Number.isNaN(d.getTime())) throw new Error('Tanggal tidak valid')
  return d.toISOString()
}

async function createEvent() {
  try {
    if (!newEvent.title || !newEvent.date_iso || !newEvent.venue) {
      throw new Error('Title/Date/Venue wajib diisi')
    }
    assertEventDateAllowedFromLocalInput(newEvent.date_iso)

    const priceIdr = Number(newEvent.price_idr)
    if (!priceIdr || priceIdr <= 0) {
      throw new Error('Harga tiket (IDR) wajib > 0')
    }

    // Upload gambar event kalau ada → dipakai sekaligus sebagai metadataURI NFT
    if (newImageFile.value && !newEvent.image_url) {
      uploading.value = true
      const url = await uploadImageFile(newImageFile.value)
      newEvent.image_url = url
    }

    // --- upload NFT image (kalau ada) ---
    if (newNftImageFile.value && !newNftImageUrl.value) {
      uploading.value = true
      const url = await uploadImageFile(newNftImageFile.value)
      newNftImageUrl.value = url
    }
    // prioritas: NFT image → kalau kosong pakai banner → kalau kosong juga, ""
    const metadataURI = newNftImageUrl.value || newEvent.image_url || ''   // boleh kosong, nanti fallback ke defaultURI kalau kamu set

    if (!TICKETS_CONTRACT) {
      throw new Error('VITE_TICKETS_CONTRACT belum diset di .env')
    }

    await ensureChain('amoy')

    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)

    // 1) Konversi harga IDR → wei (POL) lewat backend
    const priceWei = await convertIdrToWei(priceIdr)

    // 2) Hitung maxSupply
    const maxSupply = BigInt(Math.floor(Number(newEvent.total_tickets) || 0))
    if (maxSupply <= 0n) throw new Error('Total tiket harus > 0')

    // 3) Hitung eventTime (unix timestamp detik) dari tanggal yang diinput
    const eventDate = new Date(newEvent.date_iso)
    if (Number.isNaN(eventDate.getTime())) throw new Error('Tanggal event tidak valid')
    const eventTime = BigInt(Math.floor(eventDate.getTime() / 1000))

    // // 4) Panggil kontrak
    // await ensureChain('amoy')
    // const { provider } = await connect()
    // const signer = await provider.getSigner()

    // const contract = new ethers.Contract(TICKETS_CONTRACT, ASIQTIX_TICKETS_ABI, signer)
    // const nextId = await contract.nextEventId()
    // 2. TEST DULU PAKAI callStatic
    try {
      await contract.createEvent.staticCall(
        priceWei,
        maxSupply,
        eventTime,
        metadataURI
      )
    } catch (e) {
      console.error('callStatic createEvent REVERT:', e)
      console.error('reason:', e.reason)
      console.error('raw error:', e.error ?? e.data ?? e.info)

      alert(
        e?.reason ||
        e?.error?.message ||
        e?.message ||
        'Create event gagal (revert dari smart contract)'
      )
      // jangan lanjut kirim transaksi kalau callStatic gagal
      return
    }

    const tx = await contract.createEvent(
      priceWei,
      maxSupply,
      eventTime,
      metadataURI
    )
    const receipt = await tx.wait()
    if (!receipt.status) throw new Error('Transaksi createEvent gagal di blockchain')

    // const chainEventId = Number(nextId.toString())
    // Ambil eventId dari event EventCreated di log
    let chainEventId = null
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log) // {topics: log.topics, data: log.data}
        if (parsed?.name === 'EventCreated') {
          chainEventId = Number(parsed.args.eventId.toString())
          break
        }
      } catch {
        // bukan log EventCreated dari kontrak ini
      }
    }
    if (chainEventId == null) {
      throw new Error('Tidak bisa menemukan eventId dari log EventCreated')
    }

    // 5) Simpan ke backend (Supabase) – chain_event_id nyambung ke eventId on-chain
    const payload = {
      title: newEvent.title,
      date_iso: toIso(newEvent.date_iso),
      venue: newEvent.venue,
      description: newEvent.description || '',
      image_url: newEvent.image_url || null,
      price_idr: priceIdr,
      total_tickets: Number(newEvent.total_tickets) || 0,
      listed: !!newEvent.listed,
      chain_event_id: chainEventId
    }

    await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    // 6) Reset form & reload list
    Object.assign(newEvent, {
      title: '',
      date_iso: '',
      venue: '',
      description: '',
      image_url: '',
      price_idr: 0,
      total_tickets: 0,
      listed: true
    })
    priceIdrDisplay.value = ''

    newImageFile.value = null
    if (newImagePreview.value) {
      URL.revokeObjectURL(newImagePreview.value)
      newImagePreview.value = ''
    }

    // reset NFT
    newNftImageFile.value = null
    if (newNftImagePreview.value) {
      URL.revokeObjectURL(newNftImagePreview.value)
    }
    newNftImagePreview.value = ''
    newNftImageUrl.value = ''

    showCreate.value = false
    await loadEvents()
    alert(`Event berhasil dibuat. ID on-chain: ${chainEventId}`)
  } catch (e) {
    console.error(e)
    alert(`Create event gagal: ${e?.message || e}`)
  } finally {
    uploading.value = false
  } // diganti 26-11-2025
}

const editId = ref(null)

// Mengganti price_pol menjadi price_idr
const edit = reactive({
  title: '', date_iso: '', venue: '', description: '',
  image_url: '', price_idr: 0, total_tickets: 0, listed: true
})


function startEdit(ev) {
  editId.value = ev.id
  edit.title = ev.title || ''
  try {
    const d = new Date(ev.date_iso)
    const p = n => String(n).padStart(2, '0')
    edit.date_iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { edit.date_iso = '' }
  edit.venue = ev.venue || ''
  edit.description = ev.description || ''
  edit.image_url = ev.image_url || ''
  edit.price_idr = Number(ev.price_idr || 0)  // diganti 25-11-2025
  edit.total_tickets = Number(ev.total_tickets || 0)
  edit.listed = !!ev.listed
  showEdit.value = true
}
function cancelEdit() { showEdit.value = false; editId.value = null }

async function saveEdit() {
  try {
    assertEventDateAllowedFromLocalInput(edit.date_iso)
    const payload = {
      title: edit.title,
      date_iso: toIso(edit.date_iso),
      venue: edit.venue,
      description: edit.description,
      image_url: edit.image_url || null,
      price_idr: Number(edit.price_idr) || 0, // diganti 25-11-2025
      total_tickets: Number(edit.total_tickets) || 0,
      listed: !!edit.listed
    }
    await api(`/api/events/${editId.value}`, { method: 'PUT', body: JSON.stringify(payload) })
    showEdit.value = false
    editId.value = null
    await loadEvents()
    alert('Event updated.')
  } catch (e) { alert(`Update failed: ${e.message}`) }
}

async function removeEvent(id) {
  if (!confirm('Delete this event?')) return
  try { await api(`/api/events/${id}`, { method: 'DELETE' }); await loadEvents(); alert('Deleted.') }
  catch (e) { alert(`Delete failed: ${e.message}`) }
}

async function toggleList(ev) {
  try { await api(`/api/events/${ev.id}/list`, { method: 'PATCH', body: JSON.stringify({ listed: !ev.listed }) }); await loadEvents() }
  catch (e) { alert(`List/Delist failed: ${e.message}`) }
}

function imgFor (ev) {
  // kalau event punya banner hasil upload, pakai itu
  if (ev.image_url && ev.image_url.length > 0) return ev.image_url
}

</script>

<template>
  <div class="home-page" :style="rootStyle">
    <header class="topbar">
      <div class="brand"><img src="/logo_with_text.png" alt="Tickety" /></div>
      <form class="search search--top" @submit.prevent>
        <input class="search-input" v-model="searchQuery" type="search" placeholder="Search concerts, venues…" />
        <button class="search-btn" type="submit">🔍</button>
      </form>
      <button class="hamburger" @click.stop="toggleSidebar" aria-label="Toggle Sidebar"><span/><span/><span/></button>
    </header>

    <SideNavSB v-model="sidebarOpen" />

    <main class="container">
      <section class="hero">
        <div class="hero-bg" aria-hidden="true"></div>
        <h2 class="hero-title">{{ heroTitle }}</h2>
      </section>

      <div v-if="errorMsg" class="alert error">{{ errorMsg }}</div>

      <section class="cards">
        <article v-for="ev in filteredEvents" :key="ev.id" class="card">
          <div class="img-wrap">
            <div class="img" :style="{ backgroundImage: `url(${imgFor(ev)})` }"></div>
            <div class="img-overlay"></div>
            <div class="title">{{ ev.title }}</div>
            <div v-if="canManageEvent(ev)" class="adm-tools">
              <button class="adm-btn" @click="startEdit(ev)" title="Edit">✎</button>
              <button class="adm-btn" @click="toggleList(ev)" :title="ev.listed ? 'Delist' : 'List'">
                {{ ev.listed ? '⛔' : '✅' }}
              </button>
              <button class="adm-btn danger" @click="removeEvent(ev.id)" title="Delete">🗑</button>
            </div>
          </div>
          <div class="meta">
            <div><span class="k">Location:</span> <span class="v">{{ ev.venue }}</span></div>
            <div><span class="k">Date:</span> <span class="v">{{ new Date(ev.date_iso).toLocaleString('id-ID') }}</span></div>
          </div>
          <p class="desc">{{ ev.description || '(Blank Text)' }}</p>
          <button class="buy" @click="buyTicket(ev)">BUY TICKET</button>
        </article>
      </section>
    </main>

    <button v-if="isAdmin || isPromoter" class="fab" title="Add event" aria-label="Create new event" @click="showCreate = true">＋<span class="sr-only">Create new event</span></button>

    <div v-if="showCreate" class="modal" @click.self="showCreate=false">
      <div class="modal-card">
        <button class="modal-x" aria-label="Close" @click="showCreate=false">×</button>
        <h3>Create Event</h3>
        <form class="form" @submit.prevent="createEvent">
          <div class="scroll">
            <label>Title <input v-model="newEvent.title" /></label>
            <label>
              Date (UTC)
              <input
                type="datetime-local"
                step="60"
                v-model="newEvent.date_iso"
                :min="minEventDateLocalValue()"
                :max="maxEventDateLocalValue()"
              />
            </label>
            <label>Venue <input v-model="newEvent.venue" /></label>
            <label class="file"><span>Image</span><input type="file" accept="image/*" @change="onNewImageChange" /></label>
            <div v-if="newImagePreview || newEvent.image_url" class="img-preview" :style="{ backgroundImage: `url(${newImagePreview || newEvent.image_url})` }"></div>
            <label class="block text-sm font-medium mb-1">NFT Image (optional)</label>
            <input type="file" accept="image/*" @change="onNftImageChange" />
            <p class="mt-1 text-xs text-gray-400">Jika tidak diisi, NFT akan memakai gambar banner event.</p>
            <div v-if="newNftImagePreview" class="mt-2"><span class="text-xs text-gray-300">Preview NFT:</span><img :src="newNftImagePreview" alt="NFT preview" class="mt-1 h-24 rounded object-cover"/></div>
            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">Price (IDR)</label>
              <div class="relative">
                <span
                  class="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gray-400"
                >
                  Rp
                </span>
                <input
                  type="text"
                  :value="priceIdrDisplay"
                  @input="onPriceIdrInput"
                  inputmode="numeric"
                  class="w-full rounded border px-3 py-2 pl-10"
                  placeholder="contoh: 150.000"
                />
              </div>
              <div class="mt-1 text-xs text-gray-300 flex items-center gap-2">
                <span v-if="polRateLoading">Mengambil harga POL/IDR...</span>
                <span v-else-if="polRateError">
                  {{ polRateError }}
                  <button type="button" class="underline ml-1" @click="fetchPolRate">
                    coba lagi
                  </button>
                </span>
                <span v-else-if="priceInPol !== null">
                  ≈ {{ priceInPol.toFixed(4) }} POL
                  <span class="opacity-70 ml-1">
                    (1 POL ≈ {{ polRateIdr?.toLocaleString('id-ID') }} IDR)
                  </span>
                  <button
                    type="button"
                    class="text-[10px] px-2 py-1 border rounded ml-2 opacity-70 hover:opacity-100"
                    @click="fetchPolRate"
                  >
                    Refresh
                  </button>
                </span>
              </div>
            </div>
            <!-- <label>Price (IDR) <input type="number" min="0" step="1" v-model.number="newEvent.price_idr" /></label> -->
            <label>Total Tickets <input type="number" min="0" step="1" v-model.number="newEvent.total_tickets" /></label>
            <label class="chk"><input type="checkbox" v-model="newEvent.listed" /> Listed</label>
            <label>Description <textarea rows="3" v-model="newEvent.description" /></label>
          </div>
          <div class="actions-bar">
            <button type="button" class="btn ghost" @click="showCreate=false">Cancel</button>
            <button type="submit" class="btn primary" :disabled="uploading">{{ uploading ? 'Uploading…' : 'Create' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="showEdit" class="modal" @click.self="cancelEdit()">
      <div class="modal-card">
        <button class="modal-x" aria-label="Close" @click="cancelEdit()">×</button>
        <h3>Edit Event</h3>
        <form class="form" @submit.prevent="saveEdit">
          <div class="scroll">
            <label>Title <input v-model="edit.title" /></label>
            <label>
              Date (UTC)
              <input
                type="datetime-local"
                step="60"
                v-model="edit.date_iso"
                :min="minEventDateLocalValue()"
                :max="maxEventDateLocalValue()"
              />
            </label>
            <label>Venue <input v-model="edit.venue" /></label>
            <label>Image URL <input v-model="edit.image_url" placeholder="https://..." /></label>
            <label>Price (IDR) <input type="number" min="0" step="1" v-model.number="edit.price_idr" /></label>
            <label>Total Tickets <input type="number" min="0" step="1" v-model.number="edit.total_tickets" /></label>
            <label class="chk"><input type="checkbox" v-model="edit.listed" /> Listed</label>
            <label>Description <textarea rows="3" v-model="edit.description" /></label>
          </div>
          <div class="actions-bar">
            <button type="button" class="btn ghost" @click="cancelEdit()">Cancel</button>
            <button type="submit" class="btn primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================
   Home Page (scoped, single source of truth)
   ========================= */
.home-page{
  --bg: #0b0d12;
  --panel: #0f131b;
  --border: #1c2536;
  --text: #f4f6fb;
  --muted: #ccd3e1;
  --brand: #f2c78a;
  --accent: #e34b2b;
  --accent2: #7c0b0b;
  --pill: rgba(255,255,255,.1);
  --yellow: #f7c86a;

  --brand-size: clamp(34px, 14vw, 40px);
  --topbar-h: clamp(88px, 12vw, 144px);

  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  outline: none;
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
  grid-template-areas: "brand . ham";
  align-items: center;
  gap: clamp(10px, 2.4vw, 16px);
  padding: 0 clamp(12px, 2vw, 18px);

  background: rgba(10,12,18,.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255,255,255,.06);
}

.home-page .brand{
  grid-area: brand;
  display: inline-flex;
  align-items: center;
  min-width: var(--brand-size);
}
.home-page .brand img{
  height: var(--brand-size);
  width: auto;
  margin-left: 10px;
  display: block;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,.5));
}

/* Search (center, desktop) */
.home-page .search{
  display: grid;
  grid-template-columns: 1fr auto;
  background: rgba(255,255,255,.9);
  border-radius: 32px;
  box-shadow: 0 10px 28px rgba(0,0,0,.35);
  overflow: hidden;
  min-width: 0;
}
.home-page .search--top{
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 50%;
  translate: 0 -50%;
  width: min(900px, 62vw);
  z-index: 1050;
}
.home-page .search-input{
  border: none;
  outline: none;
  padding: clamp(10px, 2.2vw, 16px) clamp(12px, 2vw, 18px);
  font-size: clamp(14px, 2.2vw, 16px);
  color: #222;
  background: transparent;
  min-width: 0;
}
.home-page .search-input::placeholder{ color:#6b7280; }
.home-page .search-btn{
  border: none;
  background: transparent;
  width: clamp(48px, 6vw, 64px);
  cursor: pointer;
  font-size: clamp(16px, 3vw, 18px);
  color: #111;
}

/* Hamburger */
.home-page .hamburger{
  grid-area: ham;
  justify-self: end;
  width: clamp(40px, 5vw, 44px);
  height: clamp(40px, 5vw, 44px);
  display:flex;
  align-items:center;
  justify-content:center;
  background: var(--pill);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  z-index: 1100;
}
.home-page .hamburger span{
  display:block;
  width: clamp(16px, 2.4vw, 18px);
  height: 2px;
  background:#fff;
  margin: 2px 0;
  border-radius: 2px;
  opacity: .9;
}

/* =========================
   SIDEBAR (card)
   ========================= */
.home-page .sb-card{
  position: fixed;
  top: calc(var(--topbar-h) + 10px);
  right: 20px;
  left: auto;
  bottom: 16px;

  max-height: calc(100svh - (var(--topbar-h) + 10px) - 16px);
  overflow: auto;

  width: 220px;
  background: var(--brand);
  color: #2b1c08;
  border-radius: 16px;
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
  border: 1px solid rgba(0,0,0,.12);
  padding: 14px 12px;
  z-index: 1050;
}
.home-page .sb-menu{ display:flex; flex-direction:column; gap:10px; }
.home-page .sb-item{
  display:block;
  padding: 12px 14px;
  font-weight: 800;
  text-transform: lowercase;
  letter-spacing: .2px;
  border-radius: 12px;
  transition: background .15s ease, transform .15s ease;
  color: inherit;
  text-decoration: none;
}
.home-page .sb-item.active{ background: rgba(0,0,0,.10); }
.home-page .sb-item:hover{ background: rgba(0,0,0,.06); transform: translateX(2px); }
.home-page .sb-danger{ color:#6b1b12; }
.home-page .sb-backdrop{ position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 1000; }
.home-page .sb-enter-from, .home-page .sb-leave-to { opacity: 0; transform: translateX(12px); }
.home-page .sb-enter-active, .home-page .sb-leave-active { transition: all .18s ease; }

/* =========================
   HERO
   ========================= */
.home-page .hero{
  position: relative;
  min-height: calc(100vh - var(--topbar-h));
  display: grid;
  place-items: center;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  width: 100vw;
}
.home-page .hero::before{ content: none; }

.home-page .hero-bg{
  position:absolute;
  inset:0;
  background:
    linear-gradient(180deg, rgba(12,14,18,.10) 0%, rgba(12,14,18,.35) 35%, rgba(12,14,18,.68) 78%, rgba(12,14,18,.88) 100%),
    radial-gradient(80% 55% at 50% 8%, rgba(255,166,72,.28) 0%, rgba(255,166,72,.12) 40%, rgba(0,0,0,0) 70%),
    radial-gradient(120% 85% at 50% 60%, rgba(0,0,0,0) 60%, rgba(0,0,0,.35) 82%, rgba(0,0,0,.60) 100%),
    var(--hero-img);
  background-size: cover;
  background-position: center top;
  filter: brightness(.95);
}

.home-page .hero-title{
  position: relative;
  z-index: 1;
  text-align: center;
  color: #f4f6fb;
  font-weight: 900;
  letter-spacing: .15em;
  font-size: clamp(24px, 5.6vw, 72px);
  line-height: 1.15;
  padding: 16px;
}

/* =========================
   CONTENT
   ========================= */
.home-page .container{
  max-width: 1200px;
  margin: clamp(-140px, -10vw, -96px) auto 40px;
  padding: 0 clamp(14px, 2vw, 20px);
}

.home-page .alert{
  background: #111827;
  border: 1px solid var(--border);
  padding: 12px 14px;
  border-radius: 12px;
  color: var(--text);
}
.home-page .alert.error{ background: #3d1a1a; border-color:#5c2a2a; }

/* =========================
   CARDS
   ========================= */
.home-page .cards{
  display:grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  align-items: start;
}

.home-page .card{
  border: 1px solid #2a3342;
  border-radius: 18px;
  background: #6B0A00;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 34px rgba(0,0,0,.35);
  transition: transform .18s ease, box-shadow .18s ease;
}
.home-page .card:hover{
  transform: translateY(-2px);
  box-shadow: 0 22px 46px rgba(0,0,0,.45);
}

.home-page .img-wrap{
  position: relative;
  height: 220px;
  overflow: hidden;
  isolation: isolate;
}

.home-page .img{
  position:absolute;
  inset:0;
  background-size: cover;
  background-position: center;
  transform: scale(1.02);
}
.home-page .img::after{
  content:"";
  position:absolute;
  inset:0;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0) 40%,
    rgba(124,12,20,.65) 75%,
    rgba(124,12,20,.85) 100%
  );
  z-index: 1;
}

.home-page .img-overlay{
  position:absolute;
  inset:0;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0) 0%,
    rgba(107,10,0,0.15) 25%,
    rgba(107,10,0,0.5) 60%,
    rgba(107,10,0,0.75) 100%
  );
  z-index: 1;
}

/* IMPORTANT FIX:
   - Jangan pakai left:50% + translateX(-50%) untuk title panjang (rawan “kepotong” + susah ellipsis)
   - Pakai inset kiri-kanan + padding + ellipsis
*/
.home-page .img-wrap .title{
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 2;

  text-align: center;
  color: #fff;
  font-weight: 900;
  font-size: 20px;
  letter-spacing: .15em;
  text-transform: uppercase;
  text-shadow: 0 2px 6px rgba(0,0,0,.6);

  /* anti kepotong + aman untuk judul panjang */
  padding: 0 2px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-page .meta{
  display: grid;
  gap: 8px;
  padding: 14px 16px 8px;
  font-size: 14px;
  color: #e6e8ef;
}
.home-page .meta .k{ font-weight: 700; color: #f0b35a; margin-right: 6px; }
.home-page .meta .v{ opacity: .95; }

.home-page .desc{
  padding: 0 16px 14px;
  font-size: 13px;
  line-height: 1.35;
  color: #cbd5e1;
}

.home-page .buy{
  margin: 0 16px 18px;
  width: fit-content;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #49361a;
  background: #f0dcb8;
  color: #281c06;
  font-weight: 900;
  font-size: 13px;
  cursor: pointer;
}
.home-page .buy:hover{ filter: brightness(.96); }

/* =========================
   ADMIN TOOLS
   ========================= */
.home-page .adm-tools{
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 3;
  display: flex;
  gap: 6px;
}
.home-page .adm-btn{
  background: rgba(0,0,0,.5);
  border: 1px solid rgba(255,255,255,.18);
  color: #fff;
  border-radius: 8px;
  padding: 6px 8px;
  font-weight: 700;
  cursor: pointer;
}
.home-page .adm-btn.danger{
  background: rgba(120,0,0,.6);
  border-color: rgba(255,255,255,.18);
}

/* =========================
   FAB
   ========================= */
.home-page .fab{
  position: fixed;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(20px, env(safe-area-inset-bottom));
  width: 64px;
  height: 64px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #F4F1DE;
  color: #1f2937;
  font-weight: 900;
  font-size: 32px;
  line-height: 0;
  cursor: pointer;
  box-shadow: 0 16px 34px rgba(0,0,0,.36);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.home-page .fab:hover{ transform: translateY(-1px); box-shadow: 0 20px 40px rgba(0,0,0,.38); }
.home-page .fab:active{ transform: translateY(0); box-shadow: 0 12px 28px rgba(0,0,0,.28); }

.home-page .sr-only{
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,1,1);
  white-space: nowrap;
  border: 0;
}

/* =========================
   MODAL
   ========================= */
.home-page .modal{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
  overflow: hidden;
}
.home-page .modal-card{
  position: relative;
  width: 100%;
  max-width: 560px;
  background: #F4F1DE;
  color: #232747;
  border: 1px solid #232747;
  border-radius: 14px;
  padding: 16px 16px 0;
  box-shadow: 0 18px 40px rgba(0,0,0,.45);
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  overflow: hidden;
}
.home-page .modal-card h3{
  margin: 0 0 10px;
  font-weight: 800;
  color: #232747;
}
.home-page .modal-x{
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #232747;
  background: #232747;
  color: #F4F1DE;
  font-size: 22px;
  line-height: 0;
  cursor: pointer;
}

.home-page .form{
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.home-page .scroll{
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
  padding-bottom: 96px;
}
.home-page .form label{
  display: grid;
  gap: 6px;
  font-size: 14px;
  margin-bottom: 10px;
  color: #232747;
}
.home-page .form input,
.home-page .form textarea{
  background: #ffffff;
  color: #232747;
  border: 1px solid #232747;
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
}
.home-page .form label.file input[type="file"]{
  padding: 10px;
  background: #ffffff;
  color: #232747;
  border: 1px dashed #232747;
  border-radius: 10px;
}
.home-page .img-preview{
  width: 100%;
  height: 180px;
  background-size: cover;
  background-position: center;
  border-radius: 12px;
  border: 1px solid #232747;
  margin-bottom: 10px;
}
.home-page .form .chk{
  display: flex;
  align-items: center;
  gap: 10px;
  color: #232747;
}
.home-page .actions-bar{
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px 14px;
  background: #F4F1DE;
  border-top: 1px solid #232747;
  z-index: 10;
}
.home-page .btn{
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
}
.home-page .btn.ghost{
  background: #F4F1DE;
  color: #232747;
  border: 1px solid #232747;
}
.home-page .btn.primary{
  background: #232747;
  color: #F4F1DE;
  border: 1px solid #232747;
}

/* =========================
   BREAKPOINTS
   ========================= */
@media (max-width: 1100px){
  .home-page .topbar{
    grid-template-columns: minmax(180px, 260px) 1fr 64px;
    grid-template-areas: "brand . ham";
    height: clamp(80px, 11vw, 132px);
  }
}

@media (max-width: 720px){
  .home-page .topbar{
    grid-template-columns: 1fr 64px;
    grid-template-areas: "search ham";
    position: sticky;
  }

  .home-page .brand img{ display: none; }

  .home-page .search--top{
    position: static;
    transform: none;
    translate: 0;
    width: 100%;
    grid-area: search;
    justify-self: center;
  }

  .home-page .hero-title{
    letter-spacing: .18em;
    font-size: clamp(22px, 6.2vw, 42px);
  }

  .home-page .container{
    margin: clamp(-110px, -9vw, -80px) auto 28px;
  }

  .home-page .sb-card{
    top: 0; right: 0; left: auto; bottom: 0;
    height: 100vh;
    width: min(86vw, 340px);
    border-radius: 0;
    padding: 18px 16px;
    background: #0e0e0e;
    color: #f6f6f6;
    border-left: 1px solid rgba(255,255,255,.08);
    box-shadow: -12px 0 40px rgba(0,0,0,.45);
  }
  .home-page .sb-item{ color:#f6f6f6; font-size: 16px; }
  .home-page .sb-item.active{ background: rgba(255,255,255,.08); }
  .home-page .sb-item:hover{ background: rgba(255,255,255,.10); transform: translateX(2px); }

  .home-page .sb-enter-from,
  .home-page .sb-leave-to{
    transform: translateX(100%);
    opacity: 0.01;
  }
  .home-page .sb-enter-active,
  .home-page .sb-leave-active{
    transition: transform .22s ease, opacity .22s ease;
  }
  .home-page .sb-backdrop{
    background: rgba(0,0,0,.55);
    backdrop-filter: blur(2px);
  }
}

/* Laptop kecil */
@media (min-width: 721px) and (max-width: 1024px){
  .home-page .sb-card{ right: 16px; top: calc(var(--topbar-h) + 8px); }
  .home-page .sb-card{ background: var(--brand); color:#2b1c08; }
  .home-page .sb-item{ color:#2b1c08; }
}

/* Safe area iOS */
@supports (padding: max(0px)){
  .home-page .sb-card{
    padding-bottom: max(18px, env(safe-area-inset-bottom));
  }
}
</style>
