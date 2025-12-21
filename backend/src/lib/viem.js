// src/lib/viem.js
import 'dotenv/config'
import { ethers } from 'ethers'
import abiMod from '../abi/Ticket1155Custodial.json' with { type: 'json' }
const NFT_ABI = abiMod.default ?? abiMod

export const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

function ensureEnv(required) {
  const missing = required.filter(k => !process.env[k])
  if (missing.length) throw new Error('Missing ENV: ' + missing.join(', '))
}

export function getProvider () {
  ensureEnv(['RPC_URL'])
  return new ethers.JsonRpcProvider(process.env.RPC_URL)
}

export function getAdminWalletOpt () {
  const pk = process.env.ADMIN_PRIVATE_KEY
  if (!pk) return null
  return new ethers.Wallet(pk, getProvider())
}

export function getContractWithSigner () {
  ensureEnv(['CONTRACT_ADDRESS'])
  const signer = getAdminWalletOpt()
  if (!signer) throw new Error('ADMIN_PRIVATE_KEY is required for this operation')
  return new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer)
}

export async function assertChainId () {
  const want = Number(process.env.CHAIN_ID || 0)
  if (!want) return true
  const net = await getProvider().getNetwork()
  const got = Number(net.chainId)
  if (want !== got) throw new Error(`RPC chainId mismatch. Want ${want}, got ${got}`)
  return true
}

// ========== High-level helpers used by routes ==========
export async function mintCustodial ({ buyerAddress, tokenId, qty = 1, orderId = '' }) {
  await assertChainId()
  const c = getContractWithSigner()
  const tx = await c.mintToVault(buyerAddress, BigInt(tokenId), BigInt(qty), String(orderId))
  const rc = await tx.wait()
  return rc?.hash || tx?.hash
}

export async function redeemFromVault ({ to, tokenId, qty = 1, orderId = '' }) {
  await assertChainId()
  const c = getContractWithSigner()
  const tx = await c.redeemFromVault(to, BigInt(tokenId), BigInt(qty), String(orderId))
  const rc = await tx.wait()
  return rc?.hash || tx?.hash
}

export async function getVaultAddress () {
  const c = getContractWithSigner()
  return await c.vault()
}

export async function getVaultBalance (tokenId) {
  const c = getContractWithSigner()
  const vault = await c.vault()
  const bal = await c.balanceOf(vault, BigInt(tokenId))
  return bal.toString()
}

export { NFT_ABI }
