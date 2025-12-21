<script setup>
import { onMounted } from 'vue'

function clearLocalAuth () {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('walletAddress')
  localStorage.removeItem('walletRole')
  localStorage.removeItem('asiqtix-user')
}

function doLogout () {
  clearLocalAuth()
  window.location.href = '/'   // langsung ke login
}

function cancelLogout () {
  // balik ke halaman sebelumnya
  if (window.history.length > 1) window.history.back()
  else window.location.href = '/'
}

onMounted(() => {
  const ok = window.confirm('Apakah Anda yakin ingin keluar?')
  if (ok) doLogout()
  else cancelLogout()
})
</script>

<template>
  <!-- fallback kalau browser blokir window.confirm -->
  <div class="wrap">
    <div class="card">
      <h2>Keluar dari akun?</h2>
      <p>Anda akan menghapus sesi login dari perangkat ini.</p>
      <div class="actions">
        <button class="btn danger" @click="performLogout">OK, Keluar</button>
        <button class="btn ghost" @click="cancelLogout">Batal</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap{min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e6e8ef}
.card{background:#111826;border:1px solid #222938;border-radius:14px;padding:20px 22px;max-width:420px;width:92%}
.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
.btn{padding:10px 14px;border-radius:10px;border:1px solid transparent;cursor:pointer}
.btn.danger{background:#e34b2b;color:#fff}
.btn.ghost{background:transparent;border-color:#2a3344;color:#e6e8ef}
</style>
