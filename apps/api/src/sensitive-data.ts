import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type EncryptionDomain = "phone" | "legal-name" | "identity-document" | "payout-holder" | "payout-account" | "admin-mfa";

export class SensitiveDataProtector {
  private readonly encryptionKey: Buffer;

  constructor(
    encryptionSecret: string,
    private readonly piiHmacKey: string,
    private readonly authHmacKey: string,
  ) {
    this.encryptionKey = createHash("sha256").update(encryptionSecret, "utf8").digest();
  }

  normalizePhone(value: string): string {
    const normalized = value.normalize("NFKC").replace(/[\s-]/gu, "");
    if (!/^1\d{10}$/u.test(normalized)) throw new TypeError("Invalid mainland China mobile number.");
    return normalized;
  }

  normalizeLegalName(value: string): string {
    const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (normalized.length < 2 || normalized.length > 64) throw new TypeError("Invalid legal name.");
    return normalized;
  }

  normalizeDocument(value: string): string {
    const normalized = value.normalize("NFKC").replace(/[\s-]/gu, "").toUpperCase();
    if (!/^[0-9A-Z]{6,32}$/u.test(normalized)) throw new TypeError("Invalid identity document number.");
    return normalized;
  }

  encrypt(domain: EncryptionDomain, plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(`xiongzai:${domain}:v1`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(domain: EncryptionDomain, encoded: string): string {
    const [version, ivPart, tagPart, ciphertextPart, extra] = encoded.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart || extra) throw new TypeError("Invalid encrypted value.");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(ivPart, "base64url"));
    decipher.setAAD(Buffer.from(`xiongzai:${domain}:v1`, "utf8"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
  }

  piiHash(domain: "phone" | "legal-name" | "identity-document" | "payout-holder" | "payout-account", value: string): string {
    return createHmac("sha256", this.piiHmacKey).update(`xiongzai:${domain}:v1\0${value}`, "utf8").digest("hex");
  }

  authHash(domain: "sms-code" | "refresh-token" | "admin-session", value: string): string {
    return createHmac("sha256", this.authHmacKey).update(`xiongzai:${domain}:v1\0${value}`, "utf8").digest("hex");
  }

  hashesEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  maskPhone(phone: string): string {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  maskLegalName(name: string): string {
    return name.length <= 2 ? `${name[0]}*` : `${name[0]}${"*".repeat(Math.min(name.length - 2, 4))}${name.at(-1)}`;
  }

  maskDocument(document: string): string {
    return `${"*".repeat(Math.max(4, Math.min(document.length - 4, 14)))}${document.slice(-4)}`;
  }

  normalizePayoutValue(value:string):string { const normalized=value.normalize("NFKC").trim().replace(/\s+/gu,""); if(normalized.length<3||normalized.length>128)throw new TypeError("Invalid payout account value."); return normalized; }
  maskPayoutAccount(value:string):string { if(value.length<=7)return `${value.slice(0,1)}***${value.slice(-1)}`; return `${value.slice(0,3)}${"*".repeat(Math.min(8,value.length-5))}${value.slice(-2)}`; }
}
