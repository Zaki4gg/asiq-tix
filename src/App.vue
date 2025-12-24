<script setup>
import { RouterView } from 'vue-router'
import AppFooter from '@/components/AppFooter.vue'
</script>

<template>
  <div id="app" class="app-shell">
    <main class="app-main">
      <RouterView />
    </main>
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

.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1 0 auto;
}

body {
  background-color: #0b0d12;
  color: #e6e8ef;
  overflow: auto;
}

#app { max-width: none !important; margin: 0 !important; padding: 0 !important; }
</style>
