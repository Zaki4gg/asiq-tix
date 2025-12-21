<script setup>
import { RouterView } from 'vue-router'
import AppFooter from '@/components/AppFooter.vue'   // ⟵ tambahkan
</script>

<template>
  <!-- Shell flex agar footer “nempel” di bawah untuk halaman pendek -->
  <div id="app" class="app-shell">
    <main class="app-main">
      <RouterView />
    </main>

    <!-- Footer tampil di semua halaman kecuali login -->
    <AppFooter />
  </div>
</template>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Shell fleksibel: RouterView mengambil ruang, footer di bawah */
.app-shell {
  min-height: 100dvh;              /* pakai d-vh agar aman di mobile */
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1 0 auto;                  /* isi halaman “mendorong” footer ke bawah */
}

/* Warna dasar yang sudah Anda pakai */
body {
  background-color: #0b0d12;
  color: #e6e8ef;
  overflow: auto;
}

/* Hapus batasan yang memaksa ukuran tertentu */
#app { max-width: none !important; margin: 0 !important; padding: 0 !important; }
</style>
