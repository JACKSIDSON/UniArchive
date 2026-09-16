import { describe, it, expect } from 'vitest';
import { encryptBuffer, decryptBuffer, serializeEnvelope, parseEnvelope, WrongPasswordError } from '../../src/main/export/encrypt';

describe('encrypt', () => {
  const payload = Buffer.from('UniArchive 导出内容：'.repeat(200), 'utf8');

  it('加解密往返一致', () => {
    const env = encryptBuffer(payload, 'correct horse battery');
    const out = decryptBuffer(env, 'correct horse battery');
    expect(out.equals(payload)).toBe(true);
  });

  it('错误密码无法解密（抛出 WrongPasswordError）', () => {
    const env = encryptBuffer(payload, 'correct horse battery');
    expect(() => decryptBuffer(env, 'wrong password')).toThrow(WrongPasswordError);
  });

  it('密文被篡改后无法解密', () => {
    const env = encryptBuffer(payload, 'pw123456');
    const ct = Buffer.from(env.ciphertext, 'base64');
    ct[10] = ct[10] ^ 0xff;
    expect(() => decryptBuffer({ ...env, ciphertext: ct.toString('base64') }, 'pw123456')).toThrow();
  });

  it('每次加密使用不同 salt / iv', () => {
    const a = encryptBuffer(payload, 'same-password');
    const b = encryptBuffer(payload, 'same-password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it('envelope 二进制序列化往返一致', () => {
    const env = encryptBuffer(payload, 'pw');
    const buf = serializeEnvelope(env);
    expect(buf.subarray(0, 6).toString('utf8')).toBe('UAENC1');
    const parsed = parseEnvelope(buf);
    expect(decryptBuffer(parsed, 'pw').equals(payload)).toBe(true);
  });

  it('非加密包解析报错', () => {
    expect(() => parseEnvelope(Buffer.from('random bytes here'))).toThrow();
  });
});
