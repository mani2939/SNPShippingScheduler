"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Package, Receipt, RefreshCw } from "lucide-react";
import type { Order } from "../lib/orders";
export const money = (pence: number) => new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(pence/100);
const orderDate = (date: string) => new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"));
export function OrderList({ orders }: { orders: Order[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const order = orders.find(o => o.id === selected);
  if (order) return <div className="order-detail">
    <button className="secondary" onClick={()=>setSelected(null)}><ArrowLeft size={16}/> All orders</button>
    <div className="order-title"><h2>Order #{order.number}</h2><span className="badge">Recorded</span></div>
    <p className="muted">{orderDate(order.order_date)}</p>
    <div className="order-detail-grid"><section className="panel order-summary"><h3><Receipt size={19}/> Order summary</h3><dl><div><dt>Subtotal</dt><dd>{money(order.total_pence-order.shipping_pence)}</dd></div><div><dt>Standard shipping</dt><dd>{money(order.shipping_pence)}</dd></div><div className="order-grand-total"><dt>Total</dt><dd>{money(order.total_pence)}</dd></div></dl></section><section className="panel order-summary"><h3><Package size={19}/> Order information</h3>{order.name && <p><strong>{order.name}</strong><br/>{order.email}</p>}<p>Order date: {orderDate(order.order_date)}</p><p className="muted">Added by SNP Dispatch.</p></section></div>
  </div>;
  return <section className="panel table-wrap orders-list"><table><thead><tr><th>Order</th><th>Date</th>{orders.some(o=>o.name) && <th>Customer</th>}<th>Shipping</th><th>Total</th><th></th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><button className="order-number" onClick={()=>setSelected(o.id)}>#{o.number}</button></td><td>{orderDate(o.order_date)}</td>{orders.some(o=>o.name) && <td><strong>{o.name}</strong><small>{o.email}</small></td>}<td>{money(o.shipping_pence)}</td><td><strong>{money(o.total_pence)}</strong></td><td><button className="secondary" onClick={()=>setSelected(o.id)} aria-label={`View order ${o.number}`}>View order</button></td></tr>)}</tbody></table>{!orders.length && <div className="empty"><Package size={28}/><h3>No orders yet</h3><p>Orders added by SNP Dispatch will appear here.</p></div>}</section>;
}
export default function CustomerOrders() {
  const [orders,setOrders]=useState<Order[]>([]), [page,setPage]=useState(0), [hasMore,setHasMore]=useState(false), [loading,setLoading]=useState(true), [error,setError]=useState(""), [refresh,setRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");void (async()=>{try{const r=await fetch(`/api/customer/orders?page=${page}`,{cache:"no-store",signal:controller.signal});if(r.status===401){window.location.assign("/account");return;}const d=await r.json();if(!r.ok)throw Error(d.error);setOrders(d.orders);setHasMore(d.hasMore);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load orders.");}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[page,refresh]);
  return <><div className="page-intro"><div><div className="eyebrow">YOUR ACCOUNT / ORDERS</div><h1>Order history</h1><p>Your past orders, all in one place.</p></div><button className="secondary" disabled={loading} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={16}/> Refresh</button></div>{loading?<p role="status">Loading orders…</p>:error?<p className="error" role="alert">{error}</p>:<OrderList orders={orders}/>}<nav className="history-pagination" aria-label="Order history pages"><button className="secondary" disabled={loading||!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button className="secondary" disabled={loading||!hasMore} onClick={()=>setPage(p=>p+1)}>Next</button></nav></>;
}
