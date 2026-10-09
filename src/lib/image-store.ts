/**
 * Private image storage for visual regression. Images never go into database rows, and nothing here is public:
 * the report serves them through an authorised route, using the server-side key.
 */

const BUCKET = "visual-regression";
const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,300}\.png$/;
const TIMEOUT_MS = 15_000;

export interface ImageStore {
  put(key: string, bytes: Buffer): Promise<void>;
  /** Null when the image does not exist. */
  get(key: string): Promise<Buffer | null>;
}

function checkKey(key: string): string {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Invalid image key");
  return key;
}

export function supabaseImageStore(config: { url: string; serviceKey: string }): ImageStore {
  const base = config.url.replace(/\/$/, "");
  const auth = { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey };
  return {
    async put(key, bytes) {
      const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${checkKey(key)}`, {
        method: "POST",
        headers: { ...auth, "content-type": "image/png", "x-upsert": "true" },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Image upload failed with HTTP ${response.status}`);
    },
    async get(key) {
      const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${checkKey(key)}`, {
        headers: auth,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

/** The Supabase store when both settings exist. Null means visual checks are unavailable on this deployment. */
export function configuredImageStore(): ImageStore | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
    throw new Error("SUPABASE_URL must be an https URL");
  }
  return supabaseImageStore({ url, serviceKey });
}

export function memoryImageStore(): ImageStore & { keys: () => string[] } {
  const images = new Map<string, Buffer>();
  return {
    async put(key, bytes) {
      images.set(checkKey(key), Buffer.from(bytes));
    },
    async get(key) {
      return images.get(checkKey(key)) ?? null;
    },
    keys: () => [...images.keys()],
  };
}
