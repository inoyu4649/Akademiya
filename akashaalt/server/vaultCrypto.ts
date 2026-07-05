import crypto from "crypto";
import argon2 from "argon2";

// AkashaAlt API Key Zero-Knowledge Vault — Argon2id KDF + AES-256-GCM
// 서버는 사용자의 AkashaAlt API 비밀번호와 AI Provider API Key 평문을 절대 영구 저장하지 않는다.

export const ENC_VERSION = 1;

export const KDF_DEFAULTS = {
  timeCost: 3,
  memoryCost: 65536, // KB = 64MB
  parallelism: 1,
} as const;

// canary: 비밀번호 검증용 고정 평문 — 그 자체로는 어떤 비밀 정보도 담지 않는다.
export const VAULT_CANARY = "AkashaAlt-Vault-Check-v1";

export interface KdfParams {
  salt: Buffer;
  timeCost: number;
  memoryCost: number;
  parallelism: number;
}

export interface EncryptedBlob {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

/** Argon2id로 비밀번호+salt에서 AES-256 키(32바이트) 파생 */
export async function deriveKey(password: string, params: KdfParams): Promise<Buffer> {
  const raw = await argon2.hash(password, {
    type: argon2.argon2id,
    salt: params.salt,
    timeCost: params.timeCost,
    memoryCost: params.memoryCost,
    parallelism: params.parallelism,
    hashLength: 32,
    raw: true,
  });
  return Buffer.from(raw);
}

/** AES-256-GCM 암호화 — 매 호출마다 새 nonce 사용 */
export function encryptWithKey(key: Buffer, plaintext: string): EncryptedBlob {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, nonce, authTag };
}

/** AES-256-GCM 복호화 — auth tag 불일치 시 예외(비밀번호 오류 또는 손상된 암호문) */
export function decryptWithKey(key: Buffer, blob: EncryptedBlob): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, blob.nonce);
  decipher.setAuthTag(blob.authTag);
  const plaintext = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** 새 볼트 생성: salt 생성 + canary 암호화 (비밀번호 최초 설정 / 초기화 시 사용) */
export async function createVault(password: string) {
  const salt = crypto.randomBytes(32);
  const params: KdfParams = { salt, ...KDF_DEFAULTS };
  const key = await deriveKey(password, params);
  const canary = encryptWithKey(key, VAULT_CANARY);
  key.fill(0); // 파생 키를 즉시 메모리에서 제거 (호출자가 별도로 캐시에 저장해야 함)
  return { params, canary };
}

/** 비밀번호로 볼트 언락 시도: 성공 시 파생 키 반환, 실패(오탈자 등) 시 null */
export async function tryUnlockVault(
  password: string,
  params: KdfParams,
  canary: EncryptedBlob
): Promise<Buffer | null> {
  const key = await deriveKey(password, params);
  try {
    const decoded = decryptWithKey(key, canary);
    if (decoded !== VAULT_CANARY) {
      key.fill(0);
      return null;
    }
    return key;
  } catch {
    key.fill(0);
    return null;
  }
}
