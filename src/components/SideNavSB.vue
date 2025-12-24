<script setup>
import { computed, ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const open = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const close = () => {
  open.value = false
}

// --- ROLE HANDLING ---
const role = ref('customer')

// helper API sederhana (sama pola dengan dashboard)
const RAW_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_HOST = RAW_BASE.replace(/\/api$/i, '')
const wallet = () => (localStorage.getItem('walletAddress') || '').toString()

async function loadRole () {
  try {
    const res = await fetch(`${API_HOST}/api/me`, {
      headers: {
        'content-type': 'application/json',
        'x-wallet-address': wallet()
      }
    })
    if (!res.ok) return
    const data = await res.json().catch(() => ({}))
    role.value = data?.role || 'customer'
  } catch (e) {
    console.error('Failed to load role in SideNavSB:', e)
  }
}

onMounted(loadRole)
</script>

<template>
  <div class="drawer" :class="{ 'is-open': isOpen }" aria-hidden="true">
    <div class="drawer-backdrop" @click="close"></div>

    <div class="drawer-panel" role="dialog" aria-modal="true" @click.stop>
      <nav class="mini-nav" aria-label="Main">
        <RouterLink class="link" active-class="active" to="/home"    @click="close">Home</RouterLink>
        <RouterLink
          v-if="role === 'admin'"
          class="link"
          active-class="active"
          to="/admin/dashboard"
          @click="close"
        >
          Admin Dashboard
        </RouterLink>
        
        <!-- Hanya promoter yang bisa melihat link Promoter Dashboard -->
        <RouterLink
          v-if="role === 'promoter'"
          class="link"
          active-class="active"
          to="/promoter/dashboard"
          @click="close"
        >
          Promoter Dashboard
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
</style>