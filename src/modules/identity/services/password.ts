import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 32
const SALT_LENGTH = 16
const N = 16_384
const R = 8
const P = 1

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, { N, r: R, p: P }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derivedKey = await deriveKey(password, salt)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltValue, keyValue] = encoded.split('$')
  if (algorithm !== 'scrypt' || n !== String(N) || r !== String(R) || p !== String(P)) {
    return false
  }

  try {
    const salt = Buffer.from(saltValue, 'base64url')
    const expected = Buffer.from(keyValue, 'base64url')
    if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false
    const actual = await deriveKey(password, salt)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
