<script setup>
import { computed, onMounted, onBeforeUnmount, watch, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  // opsional untuk posisi khusus, tetap dipakai
  extraClass: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const role = ref('customer')
const isAdmin = computed(() => role.value === 'admin')
const isPromoter = computed(() => 
  role.value === 'promoter' || role.value === 'promotor'
) //toleransi typo lama)

const API_HOST = import.meta.env.VITE_API_BASE || ''

function getWallet () {
  return localStorage.getItem('walletAddress') || ''
}

async function loadRole () {
  const w = getWallet()
  if (!w) return
  try {
    const res = await fetch(`${API_HOST}/api/me`, {
      headers: { 'x-wallet-address': w }
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.role) {
      role.value = data.role
    }
  } catch {
    role.value = 'customer'
  }
}

onMounted(loadRole)

const route = useRoute()
const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})
function close(){ isOpen.value = false }

function onKey(e){ if (e.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => route.fullPath, close)
</script>

<template>
  <transition name="sb">
    <aside
      v-if="isOpen"
      class="sb-card"
      :class="extraClass"
      role="dialog"
      aria-modal="true"
      @click.stop
    >
      <nav class="sb-menu" aria-label="Main">
        <RouterLink class="sb-item" active-class="active" to="/home"   @click="close">
          {{ isAdmin ? 'Admin Dashboard'
                     : (isPromoter ? 'Promoter Dashboard' : 'Home') }}
        </RouterLink>
        <!-- <RouterLink v-if="isPromotor" class="sb-item" active-class="active" to="/promotor" @click="close">Promotor Dashboard</RouterLink> -->
        <!-- <RouterLink class="sb-item" active-class="active" to="/home"    @click="close">Home</RouterLink> -->
        <RouterLink class="sb-item" active-class="active" to="/profile" @click="close">Profile</RouterLink>
        <RouterLink class="sb-item" active-class="active" to="/wallet"  @click="close">Wallet</RouterLink>
        <RouterLink class="sb-item" active-class="active" to="/history" @click="close">History</RouterLink>
        <RouterLink class="sb-item sb-danger" to="/logout" @click="close">Log out</RouterLink>
      </nav>
    </aside>
  </transition>

  <div v-if="isOpen" class="sb-backdrop" @click="close" />
</template>

<style scoped>
.sb-card{
  background:#F4F1DE !important;
  color:#2b1c08 !important;
  border:1px solid rgba(0,0,0,.12) !important;
  border-radius:16px;
  box-shadow:0 18px 40px rgba(0,0,0,.35);
  padding:14px 12px;
}
.sb-menu{ display:flex; flex-direction:column; gap:10px; }
.sb-item{
  color:#2b1c08 !important;
  text-decoration:none;
  font-weight:800;
  padding:12px 14px;
  border-radius:12px;
}
.sb-item:hover{ background:rgba(0,0,0,.06) !important; }
.sb-item.active{ background:rgba(0,0,0,.10) !important; }
.sb-danger{ color:#6b1b12 !important; }

.sb-backdrop{
  position:fixed; inset:0; background:rgba(0,0,0,.35) !important;
}
</style>
