<script setup>
import { computed, onMounted, onBeforeUnmount, watch, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

const props = defineProps({ modelValue: { type: Boolean, required: true } })
const emit  = defineEmits(['update:modelValue'])

const route = useRoute()
const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})
function close(){ isOpen.value = false }
function onKey(e){ if (e.key === 'Escape') close() }

// ====== ROLE HANDLING (admin / promoter / customer) ======
const role = ref('customer')
const roleLoading = ref(false)

const RAW_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
// pastikan host tidak double /api
const API_HOST = RAW_BASE.replace(/\/api\/?$/i, '')

function walletFromLocalStorage () {
  return (localStorage.getItem('walletAddress') || '').toString().trim().toLowerCase()
}

// Ambil wallet dari MetaMask tanpa memunculkan prompt
async function walletFromMetamask () {
  if (typeof window === 'undefined' || !window.ethereum?.request) return ''
  try {
    const accs = await window.ethereum.request({ method: 'eth_accounts' })
    const acc = Array.isArray(accs) ? (accs[0] || '') : ''
    return String(acc || '').trim().toLowerCase()
  } catch {
    return ''
  }
}

async function getActiveWallet () {
  // Prioritas: MetaMask (lebih valid) → fallback localStorage
  const mm = await walletFromMetamask()
  if (mm) return mm
  return walletFromLocalStorage()
}

async function loadRole () {
  const w = await getActiveWallet()
  if (!w) {
    role.value = 'customer'
    return
  }

  roleLoading.value = true
  try {
    const res = await fetch(`${API_HOST}/api/me`, {
      headers: {
        'x-wallet-address': w
      },
      credentials: 'include'
    })
    if (!res.ok) {
      // kalau gagal, jangan tebak-tebakan: fallback customer
      role.value = 'customer'
      return
    }
    const data = await res.json().catch(() => ({}))
    role.value = (data?.role || 'customer')
  } catch (e) {
    console.error('[DrawerNav] failed to load role', e)
    role.value = 'customer'
  } finally {
    roleLoading.value = false
  }
}

// Events dari MetaMask agar role/menu ikut berubah saat akun diganti
function onAccountsChanged () {
  // reload role setiap akun berubah
  loadRole()
}

// lifecycle
onMounted(() => {
  window.addEventListener('keydown', onKey)

  // load awal
  loadRole()

  // listen MM account changes
  if (typeof window !== 'undefined' && window.ethereum?.on) {
    window.ethereum.on('accountsChanged', onAccountsChanged)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (typeof window !== 'undefined' && window.ethereum?.removeListener) {
    window.ethereum.removeListener('accountsChanged', onAccountsChanged)
  }
})

// close saat route berubah
watch(() => route.fullPath, close)

// refresh role saat drawer dibuka (biar tidak stale)
watch(isOpen, (v) => {
  if (v) loadRole()
})
</script>

<template>
  <div class="drawer" :class="{ 'is-open': isOpen }" :aria-hidden="!isOpen">
    <div class="drawer-backdrop" @click="close"></div>

    <div class="drawer-panel" role="dialog" aria-modal="true" @click.stop>
      <nav class="mini-nav" aria-label="Main">
        <RouterLink class="link" active-class="active" to="/home" @click="close">Home</RouterLink>

        <!-- Status kecil (opsional) -->
        <div v-if="roleLoading" class="role-hint">Loading role…</div>

        <!-- Hanya admin -->
        <RouterLink
          v-if="role === 'admin'"
          class="link"
          active-class="active"
          to="/admin/dashboard"
          @click="close"
        >
          Admin Dashboard
        </RouterLink>

        <!-- Hanya promoter -->
        <RouterLink
          v-if="role === 'promoter'"
          class="link"
          active-class="active"
          to="/promoter/dashboard"
          @click="close"
        >
          Promoter Dashboard
        </RouterLink>

        <!-- Scan khusus promoter -->
        <!-- Sesuaikan path ini dengan route Anda (misalnya /scan atau /promoter/scan) -->
        <RouterLink
          v-if="role === 'promoter'"
          class="link"
          active-class="active"
          to="/scan"
          @click="close"
        >
          Scan Ticket
        </RouterLink>

        <RouterLink class="link" active-class="active" to="/profile" @click="close">Profile</RouterLink>
        <RouterLink class="link" active-class="active" to="/wallet"  @click="close">Wallet</RouterLink>
        <RouterLink class="link" active-class="active" to="/history" @click="close">History</RouterLink>
        <RouterLink class="link-btn" to="/logout" @click="close">Log out</RouterLink>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.drawer{
  position:fixed; inset:0; z-index:60; pointer-events:none; opacity:0; visibility:hidden;
  transition:opacity .2s ease, visibility .2s ease;
}
.drawer.is-open{ pointer-events:auto; opacity:1; visibility:visible; }

.drawer-backdrop{
  position:absolute; inset:0; background:rgba(0,0,0,.35) !important;
}

.drawer-panel{
  position: absolute;
  top: calc(var(--topbar-h, 64px) + 16px);
  right: 18px;
  left: auto;

  width: min(86vw, 320px);
  max-height: calc(100vh - (var(--topbar-h, 64px) + 32px));
  overflow: auto;

  background:#F4F1DE !important;
  color:#2b1c08 !important;
  border:1px solid rgba(0,0,0,.12) !important;
  border-radius:16px;
  box-shadow:0 18px 40px rgba(0,0,0,.35);
  padding:14px 12px;

  transform:translateX(12px);
  opacity:.01;
  transition: transform .22s ease, opacity .22s ease;
}

.drawer.is-open .drawer-panel{ transform:none; opacity:1; }

.mini-nav{ display:grid; gap:10px; }
.link, .link-btn{
  text-decoration:none; font-weight:800; border-radius:12px; padding:12px 14px;
}
.link{ color:#2b1c08 !important; }
.link:hover{ background:rgba(0,0,0,.06) !important; }
.link.active{ background:rgba(0,0,0,.10) !important; }
.link-btn{ color:#6b1b12 !important; text-align:left; }

.role-hint{
  font-size: 12px;
  opacity: .75;
  padding: 0 14px 6px;
}
</style>
