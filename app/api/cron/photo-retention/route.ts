import { pool } from "../../../../lib/db";
import { authorizedPhotoCleanup, cleanupOrderPhotos, migrateLegacyOrderPhotos, verifyPhotoBlobStorage } from "../../../../lib/photo-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = {"Cache-Control": "no-store"};

export async function GET(request: Request) {
  if (!authorizedPhotoCleanup(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({error: "Unauthorized"}, {status: 401, headers});
  }
  try {
    // Always remove expired content before spending time migrating legacy photos.
    const cleanup = await cleanupOrderPhotos(pool());
    const migrated = await migrateLegacyOrderPhotos(pool());
    const storageVerified = new URL(request.url).searchParams.get("verify") === "1"
      ? await verifyPhotoBlobStorage(pool()) : undefined;
    return Response.json({ok: true, ...cleanup, migrated, storageVerified}, {headers});
  } catch {
    // Do not expose Blob credentials, image paths or database details.
    console.error("Order photo maintenance failed; queued Blob deletions will be retried.");
    return Response.json({error: "Photo maintenance failed. Retry the scheduled job."}, {status: 503, headers});
  }
}
