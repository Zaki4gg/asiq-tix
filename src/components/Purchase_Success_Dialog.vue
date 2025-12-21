<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  eventTitle: { type: String, default: '' },
  venue: { type: String, default: '' },
  dateText: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  pricePerTicketPol: { type: Number, default: 0 },
  totalPol: { type: Number, default: 0 },
  txHash: { type: String, default: '' }
})

const emit = defineEmits(['close'])

function close () {
  emit('close')
}

function openExplorer () {
  if (!props.txHash) return
  // ganti kalau nanti pindah chain
  const url = `https://amoy.polygonscan.com/tx/${props.txHash}`
  window.open(url, '_blank', 'noopener')
}
</script>

<template>
  <div v-if="open" class="modal-backdrop">
    <div class="modal">
      <div class="receipt">
        <header class="receipt-header">
          <h2>Tiket Berhasil Dibeli</h2>
          <p>Terima kasih! Berikut struk pembelian Anda.</p>
        </header>

        <div class="receipt-body">
          <div class="row">
            <span class="label">Event</span>
            <span class="value">{{ eventTitle || '-' }}</span>
          </div>
          <div class="row">
            <span class="label">Lokasi</span>
            <span class="value">{{ venue || '-' }}</span>
          </div>
          <div class="row">
            <span class="label">Tanggal</span>
            <span class="value">{{ dateText || '-' }}</span>
          </div>

          <hr class="divider" />

          <div class="row">
            <span class="label">Qty</span>
            <span class="value">{{ quantity }}</span>
          </div>
          <div class="row">
            <span class="label">Harga / Tiket</span>
            <span class="value">{{ pricePerTicketPol.toFixed(4) }} POL</span>
          </div>
          <div class="row total">
            <span class="label">Total</span>
            <span class="value">{{ totalPol.toFixed(4) }} POL</span>
          </div>

          <hr class="divider" />

          <div class="row hash" v-if="txHash">
            <span class="label">Tx Hash</span>
            <span class="value mono">
              {{ txHash.slice(0, 10) }}…{{ txHash.slice(-8) }}
            </span>
          </div>
        </div>

        <footer class="receipt-footer">
          <button class="btn ghost" type="button" @click="close">
            Tutup
          </button>
          <button
            v-if="txHash"
            class="btn primary"
            type="button"
            @click="openExplorer"
          >
            Lihat di Polygonscan
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 16, 0.78);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal {
  max-width: 420px;
  width: 92%;
}
.receipt {
  background: #0b1020;
  border-radius: 18px;
  border: 1px solid #252b3b;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.6);
  padding: 18px 18px 16px;
  color: #e9edf7;
  position: relative;
}
.receipt::before,
.receipt::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  height: 8px;
  border-top: 1px dashed #394158;
}
.receipt::before {
  top: 60px;
}
.receipt::after {
  bottom: 56px;
}
.receipt-header {
  text-align: center;
  margin-bottom: 18px;
}
.receipt-header h2 {
  font-size: 1.1rem;
  margin: 0;
}
.receipt-header p {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: #9aa4c6;
}
.receipt-body {
  font-size: 0.85rem;
  padding-top: 8px;
  padding-bottom: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.label {
  color: #9aa4c6;
}
.value {
  color: #e9edf7;
  text-align: right;
}
.value.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New', monospace;
  font-size: 0.75rem;
}
.row.total .label {
  font-weight: 600;
}
.row.total .value {
  font-weight: 700;
}
.divider {
  border: none;
  border-top: 1px dashed #394158;
  margin: 10px 0;
}
.receipt-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.btn {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.8rem;
  border: 1px solid transparent;
  cursor: pointer;
}
.btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.btn.ghost {
  background: transparent;
  border-color: #394158;
  color: #e9edf7;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
