<script setup>
import { useMetamask } from '@/composables/useMetamask'; // jika alias '@' belum ada, ganti './composables/useMetamask'
const { connect, switchToSepolia, account, chainId } = useMetamask();

async function onConnect() {
  try {
    await connect();
  } catch (e) {
    alert(e?.message ?? e);
  }
}
</script>

<template>
  <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
    <button @click="onConnect">Connect MetaMask</button>
    <button @click="switchToSepolia">Switch to Sepolia</button>
    <span v-if="account">Akun: {{ account }} | ChainID: {{ chainId }}</span>
  </div>
</template>

<style scoped>
button{ padding:8px 12px; border:1px solid #ccc; border-radius:8px; cursor:pointer; }
</style>
