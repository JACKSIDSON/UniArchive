import crypto from 'node:crypto';
import { argon2id } from '@noble/hashes/argon2';
import { randomBytes } from '@noble/hashes/utils';

/**
 * 加密：AES-256-GCM + Argon2id（memory=64MB, iterations=3, parallelism=1）
 *
 * DECISION: KDF 使用 @noble/hashes 的纯 JS Argon2id 实现，
 * 避免原生 argon2 模块带来的编译/平台依赖，参数与规格书默认一致。
 * 密码错误处理：GCM 校验失败统一抛出 WRONG_PASSWORD，不泄露细节。
 */

export const KDF = {
  name: 'argon2id' as const,
  memory: 65536, // 64 MiB（Argon2 规格中 m 以 KiB 计）
  iterations: 3,
  parallelism: 1,
  dkLen: 32
};

export const IV_LEN = 12;
export const SALT_LEN = 16;

export interface EncryptionEnvelope {
  /** base64 */
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
  kdf: { name: 'argon2id'; memory: number; iterations: number; parallelism: number };
}

export class WrongPasswordError extends Error {
  constructor() {
    super('密码错误或文件已损坏，无法解密');
    this.name = 'WrongPasswordError';
  }
}

function deriveKey(password: string, salt: Uint8Array): Buffer {
  const key = argon2id(new TextEncoder().encode(password), salt, {
    t: KDF.iterations,
    m: KDF.memory,
    p: KDF.parallelism,
    dkLen: KDF.dkLen
  });
  return Buffer.from(key);
}

export function encryptBuffer(plain: Buffer, password: string): EncryptionEnvelope {
  const salt = randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    salt: Buffer.from(salt).toString('base64'),
    kdf: { name: KDF.name, memory: KDF.memory, iterations: KDF.iterations, parallelism: KDF.parallelism }
  };
}

export function decryptBuffer(env: EncryptionEnvelope, password: string): Buffer {
  try {
    const salt = Buffer.from(env.salt, 'base64');
    const iv = Buffer.from(env.iv, 'base64');
    const tag = Buffer.from(env.tag, 'base64');
    const ct = Buffer.from(env.ciphertext, 'base64');
    const key = deriveKey(password, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new WrongPasswordError();
  }
}

/** 把 envelope 打包成单个二进制文件（UEAP 中的 vault.enc） */
export function serializeEnvelope(env: EncryptionEnvelope): Buffer {
  const header = Buffer.from(
    JSON.stringify({ v: 1, alg: 'AES-256-GCM', iv: env.iv, tag: env.tag, salt: env.salt, kdf: env.kdf }),
    'utf8'
  );
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32BE(header.length, 0);
  return Buffer.concat([Buffer.from('UAENC1'), headerLen, header, Buffer.from(env.ciphertext, 'base64')]);
}

export function parseEnvelope(buf: Buffer): EncryptionEnvelope {
  const magic = buf.subarray(0, 6).toString('utf8');
  if (magic !== 'UAENC1') throw new Error('不是有效的加密包');
  const headerLen = buf.readUInt32BE(6);
  const header = JSON.parse(buf.subarray(10, 10 + headerLen).toString('utf8')) as {
    iv: string;
    tag: string;
    salt: string;
    kdf: EncryptionEnvelope['kdf'];
  };
  return {
    ciphertext: buf.subarray(10 + headerLen).toString('base64'),
    iv: header.iv,
    tag: header.tag,
    salt: header.salt,
    kdf: header.kdf
  };
}
