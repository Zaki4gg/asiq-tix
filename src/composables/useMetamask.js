// src/composables/useMetamask.js
import { ref } from 'vue'
import { ethers } from 'ethers'
import MetaMaskSDK from '@metamask/sdk'

const account = ref(null)
const chainId = ref(null)

let provider = null
let ethereum = null

function getInjectedMetaMask () {
  if (typeof window === 'undefined') return null
  const eth = window.ethereum
  if (!eth) return null
  if (Array.isArray(eth.providers)) return eth.providers.find(p => p?.isMetaMask) || null
  return eth.isMetaMask ? eth : null
}

function ensureProvider () {
  ethereum = getInjectedMetaMask()
  if (!ethereum) {
    const mmsdk = new MetaMaskSDK({
      dappMetadata: { name: 'NFT Ticketing', url: window.location.origin },
      checkInstallationImmediately: false,
    })
    ethereum = mmsdk.getProvider()
  }
  if (!ethereum) throw new Error('MetaMask tidak terdeteksi.')
  return ethereum
}

export async function connect () {
  const eth = ensureProvider()
  const accounts = await eth.request({ method: 'eth_requestAccounts' })
  provider = new ethers.BrowserProvider(eth)
  const net = await provider.getNetwork()
  account.value = accounts?.[0] || null
  chainId.value = Number(net.chainId)
  eth.on?.('accountsChanged', (accs) => { account.value = accs?.[0] || null })
  eth.on?.('chainChanged', () => window.location.reload())
  return { provider }
}

export async function ensureChain (which = (import.meta.env.VITE_CHAIN || 'polygon')) {
  const eth = ensureProvider()
  const want = String(which || 'polygon').toLowerCase()
  const target = (want === 'amoy')
    ? { chainId: '0x13882', add: {
        chainId: '0x13882',
        chainName: 'Polygon Amoy',
        rpcUrls: [import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://rpc-amoy.polygon.technology'],
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        blockExplorerUrls: ['https://amoy.polygonscan.com'],
      } }
    : { chainId: '0x89', add: {
        chainId: '0x89',
        chainName: 'Polygon Mainnet',
        rpcUrls: [import.meta.env.VITE_POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com'],
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        blockExplorerUrls: ['https://polygonscan.com'],
      } }

  const current = await eth.request({ method: 'eth_chainId' })
  if (current?.toLowerCase() === target.chainId.toLowerCase()) return true
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target.chainId }] })
    return true
  } catch (e) {
    if (e?.code === 4902) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [target.add] })
      return true
    }
    throw e
  }
}

export async function switchToPolygonMainnet () { return ensureChain('polygon') }
export async function switchToPolygonAmoy () { return ensureChain('amoy') }

export { account, chainId }

/* 🔧 Backward-compatible named export */
export function useMetamask () {
  return {
    connect,
    ensureChain,
    switchToPolygonMainnet,
    switchToPolygonAmoy,
    account,
    chainId,
  }
}
