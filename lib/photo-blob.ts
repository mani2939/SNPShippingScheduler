import { del, get, put } from "@vercel/blob";

export interface PhotoBlobStorage {
  upload(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(pathname: string): Promise<ReadableStream<Uint8Array> | null>;
  remove(pathnames: string[]): Promise<void>;
}

function access() {
  const value = process.env.BLOB_ACCESS || "private";
  if (value !== "private" && value !== "public") throw Error("Invalid Blob access configuration.");
  return value;
}

// Server-side only. Credentials and Blob URLs are never sent to the gallery.
export const photoBlobStorage: PhotoBlobStorage = {
  async upload(pathname, bytes, contentType) {
    await put(pathname, Buffer.from(bytes), {
      access: access(), contentType, addRandomSuffix: false,
      allowOverwrite: false, cacheControlMaxAge: 60,
    });
  },
  async read(pathname) {
    const result = await get(pathname, { access: access(), useCache: false });
    return result?.statusCode === 200 ? result.stream : null;
  },
  async remove(pathnames) { if (pathnames.length) await del(pathnames); },
};

export function photoBlobPath(id: string, contentType: string) {
  const environment = process.env.VERCEL_ENV || "development";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  return `snp-dispatch/${environment}/order-photos/${id}.${extension}`;
}
