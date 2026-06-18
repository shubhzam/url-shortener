const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

// converts a positive integer to a base62 string
export function encode(id: number): string {
  if (id === 0) return ALPHABET[0]!

  let result = ''
  while (id > 0) {
    result = ALPHABET[id % 62] + result
    id = Math.floor(id / 62)
  }
  return result
}