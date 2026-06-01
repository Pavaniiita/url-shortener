/**
 * Base62 encoding — uses [0-9][a-z][A-Z] = 62 characters.
 * 7 characters → 62^7 ≈ 3.5 trillion unique codes.
 *
 * Interview talking point: "We use nanoid for randomness, then Base62-encode
 * to keep URLs short and URL-safe. No special characters means no encoding needed."
 */

const { nanoid } = require('nanoid');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 7;

function generateCode() {
  // nanoid with a custom Base62 alphabet — collision-resistant and URL-safe
  const alphabet = BASE62;
  let result = '';
  const bytes = require('crypto').randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += alphabet[bytes[i] % 62];
  }
  return result;
}

function isValidCode(code) {
  return /^[0-9a-zA-Z-_]{3,20}$/.test(code);
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { generateCode, isValidCode, isValidUrl };
