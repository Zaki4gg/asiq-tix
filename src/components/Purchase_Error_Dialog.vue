<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  message: { type: String, default: '' }
})

const emit = defineEmits(['close'])
const close = () => emit('close')
</script>

<template>
  <div v-if="props.open" class="modal-backdrop">
    <div class="modal">
      <div class="card">
        <h2>Pembelian Gagal</h2>
        <p class="msg">
          {{ message || 'Terjadi kesalahan saat memproses transaksi.' }}
        </p>
        <div class="actions">
          <button class="btn" type="button" @click="close">Tutup</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 16, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal {
  max-width: 360px;
  width: 92%;
}
.card {
  background: #151826;
  border-radius: 16px;
  border: 1px solid #252b3b;
  padding: 18px 16px 14px;
  color: #e9edf7;
}
h2 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.msg {
  font-size: 0.85rem;
  color: #cbd2f0;
  margin: 0 0 14px;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.btn {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.8rem;
  border: 1px solid #394158;
  background: transparent;
  color: #e9edf7;
  cursor: pointer;
}
</style>
