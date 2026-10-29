import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "../../../../../lib/security";
import { getCustomer } from "../../../../../lib/customer-auth";
import { pool, transaction } from "../../../../../lib/db";
import { canViewOrder, orderPhotos, addOrderPhoto, boundedFormData } from "../../../../../lib/order-photos";
export const dynamic = "force-dynamic";
type Context = {params:Promise<{orderId:string}>};
const headers = {"Cache-Control":"private, no-store"};
export async function GET(_request: NextRequest, context: Context) {
  try {
    const admin = await isAdmin(); const customer = admin ? null : await getCustomer();
    if (!admin && !customer) return NextResponse.json({error:"Please sign in."},{status:401,headers});
    const {orderId} = await context.params;
    if (!(await canViewOrder(pool(),orderId,customer?.id || null))) return NextResponse.json({error:"Order not found."},{status:404,headers});
    return NextResponse.json({photos:await orderPhotos(pool(),orderId,customer?.id || null)},{headers});
  } catch { return NextResponse.json({error:"Could not load packaging photos."},{status:503,headers}); }
}
export async function POST(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({error:"Invalid request origin."},{status:403,headers});
  if (!(await isAdmin())) return NextResponse.json({error:"Admin sign-in required."},{status:401,headers});
  try {
    const {orderId} = await context.params;
    if (!(await canViewOrder(pool(),orderId,null))) return NextResponse.json({error:"Order not found."},{status:404,headers});
    const form = await boundedFormData(request); const photo = form.get("photo");
    if (!(photo instanceof File)) throw Error("Choose a photo to upload.");
    const photoBytes = await photo.arrayBuffer();
    await transaction(db=>addOrderPhoto(db,orderId,photo.name,new Uint8Array(photoBytes)));
    return NextResponse.json({ok:true},{headers});
  } catch(e) {
    const message = e instanceof Error ? e.message : "";
    return NextResponse.json({error:/^(Choose |Each order|Order not found)/.test(message)?message:"Could not upload photo. Please try again."},{status:400,headers});
  }
}
