"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, History, Package } from "lucide-react";
import type { Order } from "../lib/orders";
import type { CustomerBooking } from "../lib/customer-history";
import { money } from "./orders";
import { dateLabel } from "../lib/schedule";
export default function CustomerDashboard({name,onNavigate}:{name:string;onNavigate:(section:string)=>void}) {
  const [data,setData]=useState<{orders:Order[];bookings:CustomerBooking[];moreOrders:boolean;moreBookings:boolean}|null>(null);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError("");void(async()=>{try{
    const responses=await Promise.all([fetch("/api/customer/orders",{cache:"no-store",signal:controller.signal}),fetch("/api/customer/bookings",{cache:"no-store",signal:controller.signal})]);
    if(responses.some(r=>r.status===401)){window.location.assign("/account");return;}
    if(responses.some(r=>!r.ok))throw Error("Could not load your dashboard. Please try again.");
    const [orders,bookings]=await Promise.all(responses.map(r=>r.json()));
    setData({orders:orders.orders,bookings:bookings.bookings,moreOrders:orders.hasMore,moreBookings:bookings.hasMore});
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load dashboard.");}})();return()=>controller.abort();},[retry]);
  return <><div className="admin-intro"><div><div className="eyebrow">YOUR ACCOUNT / DASHBOARD</div><h1>Welcome, {name.split(" ")[0]}.</h1><p className="muted">Manage your dispatches and keep track of your orders.</p></div><button className="secondary" onClick={()=>onNavigate("dispatch")}><CalendarDays size={16}/> Book a dispatch</button></div>
    {error?<div role="alert" className="error">{error} <button className="secondary" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>:!data?<p role="status">Loading your dashboard…</p>:<>
    <div className="admin-metrics customer-metrics">
      <button className="admin-metric" onClick={()=>onNavigate("orders")}><span className="admin-metric-top"><span>Recent orders</span><Package size={19}/></span><strong>{data.orders.length.toString().padStart(2,"0")}{data.moreOrders?"+":""}</strong><small>View your order history</small></button>
      <button className="admin-metric" onClick={()=>onNavigate("history")}><span className="admin-metric-top"><span>Recent bookings</span><History size={19}/></span><strong>{data.bookings.length.toString().padStart(2,"0")}{data.moreBookings?"+":""}</strong><small>Dispatch dates and tracking</small></button>
      <button className="admin-metric" onClick={()=>onNavigate("dispatch")}><span className="admin-metric-top"><span>Your next dispatch</span><CalendarDays size={19}/></span><strong className="dashboard-card-word">Book a date</strong><small>Monday · Wednesday · Friday</small></button>
    </div>
    <div className="dashboard-section-heading"><div><h2>Recent orders</h2><p className="muted">Your latest purchases at a glance.</p></div><button className="secondary" onClick={()=>onNavigate("orders")}>View all orders <ArrowRight size={16}/></button></div>
    <section className="panel table-wrap dashboard-recent-orders"><table><thead><tr><th>Order</th><th>Date</th><th>Shipping</th><th>Total</th></tr></thead><tbody>{data.orders.slice(0,5).map(o=><tr key={o.id}><td><button className="order-number" onClick={()=>onNavigate("orders")}>#{o.number}</button></td><td>{dateLabel(o.order_date)}</td><td>{money(o.shipping_pence)}</td><td><strong>{money(o.total_pence)}</strong></td></tr>)}</tbody></table>{!data.orders.length&&<div className="empty">Orders added by SNP Dispatch will appear here.</div>}</section>
    </>}
  </>;
}
