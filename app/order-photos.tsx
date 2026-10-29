"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Images, RefreshCw } from "lucide-react";
import { compressPhoto } from "../lib/photo-compression";
import type { OrderPhoto } from "../lib/order-photos";
export default function OrderPhotos({orderId,admin=false}:{orderId:string;admin?:boolean}) {
  const [photos,setPhotos]=useState<OrderPhoto[]>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [progress,setProgress]=useState("");
  const [savings,setSavings]=useState<{name:string;before:number;after:number}[]>([]);
  const [refresh,setRefresh]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const endpoint=`/api/orders/${orderId}/photos`;
  useEffect(()=>{const controller=new AbortController();setLoading(true);void(async()=>{try{
    const r=await fetch(endpoint,{cache:"no-store",signal:controller.signal}); const d=await r.json();
    if(!r.ok)throw Error(d.error || "Could not load photos.");setPhotos(d.photos);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load photos.");}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[endpoint,refresh]);
  async function upload(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();const files=Array.from(input.current?.files || []);setError("");setMessage("");
    if(!files.length){setError("Choose packaging photos to upload.");return;}
    if(files.length+photos.length>12){setError("Each order can have up to 12 photos.");return;}

    setBusy(true);setSavings([]);let added=0;
    try{for(const [index,file] of files.entries()){setProgress(`Compressing photo ${index+1} of ${files.length}…`);const compressed=await compressPhoto(file);setSavings(v=>[...v,{name:file.name,before:file.size,after:compressed.bytes.byteLength}]);setProgress(`Uploading photo ${index+1} of ${files.length}…`);const body=new FormData();body.append("photo",new File([compressed.bytes],compressed.name,{type:compressed.type}));const r=await fetch(endpoint,{method:"POST",body});const d=await r.json();if(!r.ok)throw Error(d.error || "Could not upload photo.");added++;}
      if(input.current)input.current.value="";
    }catch(e){setError(e instanceof Error?e.message:"Upload failed. Please try again.");}
    finally{setBusy(false);setProgress("");if(added){setMessage(`${added} packaging photo${added===1?"":"s"} uploaded. The customer can now view ${added===1?"it":"them"}.`);if(input.current)input.current.value="";setRefresh(v=>v+1);}}
  }
  return <section className="panel packaging-photos" aria-labelledby={`photos-${orderId}`}>
    <div className="packaging-heading"><div><h3 id={`photos-${orderId}`}><Images size={20}/> Final product & packaging</h3><p className="muted">{admin?"Upload photos of the finished product and its packaging for this customer.":"Photos of your finished product and packaging, shared by SNP Dispatch."}</p></div><button type="button" className="secondary" disabled={loading||busy} onClick={()=>{setError("");setRefresh(v=>v+1);}}><RefreshCw size={15}/> Refresh photos</button></div>
    {admin&&<form className="packaging-upload" onSubmit={upload}><div><label htmlFor={`upload-${orderId}`}>Add packaging photos</label><input ref={input} id={`upload-${orderId}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||loading||photos.length>=12} aria-describedby={`photo-help-${orderId}`}/><p id={`photo-help-${orderId}`} className="muted">JPEG, PNG or WebP · Originals up to 25 MB · Automatically compressed to 200 KB or less · Maximum 12 photos per order</p></div><button className="primary" disabled={busy||loading||photos.length>=12}><ImagePlus size={17}/>{busy?"Processing…":"Compress & upload"}</button></form>}
    {admin&&<p className="compression-note">Photos are compressed on your device before upload. For manual adjustments, <a href="https://squoosh.app/" target="_blank" rel="noopener noreferrer">open Squoosh ↗</a>.</p>}
    {progress&&<p role="status" className="status-message">{progress}</p>}
    {!!savings.length&&<ul className="compression-savings" aria-label="Photo compression results">{savings.map((s,i)=><li key={i}><span>{s.name}</span><strong>{Math.ceil(s.before/1024)} KB → {Math.ceil(s.after/1024)} KB</strong><span>{Math.max(0,Math.round((1-s.after/s.before)*100))}% smaller</span></li>)}</ul>}
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="status-message" role="status">{message}</p>}
    {loading?<p role="status">Loading packaging photos…</p>:photos.length?<div className="packaging-gallery">{photos.map((photo,i)=><a key={photo.id} href={`${endpoint}/${photo.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open packaging photo ${i+1} in full size`}><img src={`${endpoint}/${photo.id}`} alt={`Final product and packaging for this order, photo ${i+1}`} loading="lazy"/><span>Photo {i+1} <span aria-hidden="true">↗</span></span></a>)}</div>:!error&&<div className="packaging-empty"><Images size={28}/><p>{admin?"No photos yet. Add photos above to share them with the customer.":"Packaging photos haven’t been added to this order yet."}</p></div>}
  </section>;
}
