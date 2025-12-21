<script setup>
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
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
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => route.fullPath, close)
</script>

<template>
  <div class="drawer" :class="{ 'is-open': isOpen }" aria-hidden="true">
    <div class="drawer-backdrop" @click="close"></div>

    <div class="drawer-panel" role="dialog" aria-modal="true" @click.stop>
      <nav class="mini-nav" aria-label="Main">
        <RouterLink class="link" active-class="active" to="/home"    @click="close">Home</RouterLink>
        <RouterLink class="link" active-class="active" to="/profile" @click="close">Profile</RouterLink>
        <RouterLink class="link" active-class="active" to="/wallet"  @click="close">Wallet</RouterLink>
        <RouterLink class="link" active-class="active" to="/history" @click="close">History</RouterLink>
        <RouterLink class="link-btn" to="/logout" @click="close">Log out</RouterLink>
      </nav>
    </div>
  </div>
</template>

<style scoped>
/* Kunci warna drawer agar tidak ditimpa account.css */
.drawer{
  position:fixed; inset:0; z-index:60; pointer-events:none; opacity:0; visibility:hidden;
  transition:opacity .2s ease, visibility .2s ease;
}
.drawer.is-open{ pointer-events:auto; opacity:1; visibility:visible; }

.drawer-backdrop{
  position:absolute; inset:0; background:rgba(0,0,0,.35) !important;
}

.drawer-panel{
  position:absolute;
  top: clamp(72px, 10vw, 120px);
  right:18px; left:auto; bottom:18px;
  width:min(86vw, 320px);
  overflow:auto;

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
