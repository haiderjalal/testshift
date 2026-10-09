import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, sign, timingSafeEqual } from "node:crypto";

export const opaque = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (value: string) => createHash("sha256").update(value).digest("base64url");
export function validSignature(body: string, signature: string | null, secret: string): boolean {
  if (secret.length < 32 || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), createHmac("sha256", secret).update(body).digest());
}
function encryptionKey(): Buffer {
  const text = process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(text, "base64");
  if (key.length !== 32 || key.toString("base64") !== text) throw new Error("GitHub encryption key is not configured");
  return key;
}
export function sealToken(token: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`github-user:${userId}`));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString("base64url")).join(".");
}
export function openToken(value: string, userId: string): string {
  const parts = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), parts[0]);
  decipher.setAAD(Buffer.from(`github-user:${userId}`));
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}
export function appJwt(now = Date.now()): string {
  const appId = process.env.GITHUB_APP_ID ?? "";
  if (!/^[1-9]\d{0,15}$/.test(appId)) throw new Error("GitHub App ID is not configured");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540, iss: appId })).toString("base64url");
  const input = `${header}.${payload}`;
  const key = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}
