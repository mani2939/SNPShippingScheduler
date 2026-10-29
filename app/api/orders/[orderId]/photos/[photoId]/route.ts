import { isAdmin } from "../../../../../../lib/security";
import { getCustomer } from "../../../../../../lib/customer-auth";
import { pool } from "../../../../../../lib/db";
import { readOrderPhoto } from "../../../../../../lib/order-photos";
export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"};
export async function GET(_request: Request, context: {params:Promise<{orderId:string;photoId:string}>}) {
  try {
    const admin = await isAdmin(); const customer = admin ? null : await getCustomer();
    if (!admin && !customer) return new Response(null,{status:401,headers});
    const {orderId,photoId} = await context.params;
    if (![orderId,photoId].every(id=>/^[0-9a-f-]{36}$/i.test(id))) return new Response(null,{status:404,headers});
    const photo = await readOrderPhoto(pool(),orderId,photoId,customer?.id || null);
    if (!photo) return new Response(null,{status:404,headers});
    return new Response(new Uint8Array(photo.image),{headers:{...headers,"Content-Type":photo.content_type,"Content-Disposition":"inline"}});
  } catch { return new Response(null,{status:503,headers}); }
}
