/**
 * ECDH P-256 + HKDF-SHA-256 + AES-256-GCM — alinhado a mex-trading/src/utils/crypto.rs
 * info = "mex-connect-v1", salt = 32 zeros (HKDF salt None), IV 12 bytes, JWK x/y base64url.
 */

function b64Standard(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}

function b64UrlNoPad(bytes: ArrayBuffer | Uint8Array): string {
  return b64Standard(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type EcdhEncryptedBody = {
  exchange_type: string
  encrypted: true
  ephemeral_pub: { kty: string; crv: string; x: string; y: string }
  ciphertext_b64: string
  iv_b64: string
}

export async function encryptConnectCredentials(
  apiBase: string,
  sessionToken: string,
  exchangeType: string,
  payload: {
    api_key: string
    api_secret: string
    passphrase?: string
    uid?: string
  },
): Promise<EcdhEncryptedBody> {
  if (!window.crypto?.subtle) {
    throw new Error('Este navegador não suporta Web Crypto. Use Chrome/Firefox atualizado.')
  }

  const pubRes = await fetch(`${apiBase}/connect/session/${sessionToken}/pubkey`)
  const pubData = await pubRes.json()
  if (!pubRes.ok || !pubData.pubkey?.x || !pubData.pubkey?.y) {
    throw new Error(pubData.error || 'Falha ao obter chave pública da sessão')
  }

  const serverKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: pubData.pubkey.x,
      y: pubData.pubkey.y,
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  const clientPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: serverKey },
    clientPair.privateKey,
    256,
  )

  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('mex-connect-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(payload))
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plain)

  const clientJwk = (await crypto.subtle.exportKey('jwk', clientPair.publicKey)) as JsonWebKey
  if (!clientJwk.x || !clientJwk.y) {
    throw new Error('Falha ao exportar chave pública efêmera')
  }

  return {
    exchange_type: exchangeType,
    encrypted: true,
    ephemeral_pub: {
      kty: 'EC',
      crv: 'P-256',
      x: clientJwk.x,
      y: clientJwk.y,
    },
    ciphertext_b64: b64Standard(cipherBuf),
    iv_b64: b64Standard(iv),
  }
}

// silence unused helper in case tree-shake
void b64UrlNoPad
void b64UrlToBytes
