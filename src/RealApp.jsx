import React, {useEffect, useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import './real.css';

const money=n=>new Intl.NumberFormat('fa-IR').format(Number(n)/10)+' تومان';
const date=s=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'long',timeStyle:'short'}).format(new Date(s));

export function RealApp(){
  // This component only mounts when both public Supabase settings are present.
  // Do not initialize the client at module load: the standalone demo has no backend.
  const [client]=useState(()=>createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY));
  const [user,setUser]=useState(null),[email,setEmail]=useState(''),[events,setEvents]=useState([]),[event,setEvent]=useState(null);
  const [session,setSession]=useState(null),[seats,setSeats]=useState([]),[chosen,setChosen]=useState([]),[orders,setOrders]=useState([]);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const callbackOrder=new URLSearchParams(window.location.search).get('order');
  useEffect(()=>{
    client.auth.getUser().then(({data})=>setUser(data.user??null));
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,s)=>setUser(s?.user??null));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{client.from('events').select('id,title,description,hero_url,venues(name,city,address,latitude,longitude),event_sessions(id,starts_at,sales_open)').eq('status','published').order('created_at',{ascending:false}).then(({data,error})=>{if(error)setNotice('دریافت اجراها ناموفق بود.');else setEvents(data??[])});},[]);
  useEffect(()=>{if(!session)return;setChosen([]);client.from('session_seats').select('id,seat_label,price_irr,state,hold_expires_at').eq('session_id',session.id).order('seat_label').then(({data,error})=>{if(error)setNotice('دریافت صندلی‌ها ناموفق بود.');else setSeats(data??[])});},[session]);
  useEffect(()=>{if(!user){setOrders([]);return}client.from('orders').select('id,state,amount_irr,expires_at,created_at').eq('buyer_id',user.id).order('created_at',{ascending:false}).limit(20).then(({data,error})=>{if(!error)setOrders(data??[])});},[user,callbackOrder]);
  async function signIn(e){e.preventDefault();setBusy(true);const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});setBusy(false);setNotice(error?'ارسال لینک ورود انجام نشد.':'لینک ورود به ایمیل شما فرستاده شد.');}
  async function pay(){
    setBusy(true);setNotice('');
    try{
      const hold=await client.functions.invoke('hold-seats',{body:{session_id:session.id,seat_ids:chosen}});
      if(hold.error||!hold.data?.order_id)throw Error('رزرو صندلی ناموفق بود؛ موجودی را دوباره بررسی کنید.');
      const payment=await client.functions.invoke('start-payment',{body:{order_id:hold.data.order_id}});
      if(payment.error||!payment.data?.redirect_url)throw Error('دریافت لینک درگاه ناموفق بود. سفارش تا پایان مهلت رزرو باقی می‌ماند.');
      const target=new URL(payment.data.redirect_url);
      if(target.protocol!=='https:'||target.hostname!=='payment.zarinpal.com')throw Error('آدرس درگاه معتبر نیست.');
      window.location.assign(target.href);
    }catch(e){setNotice(e.message);setBusy(false)}
  }
  const selected=seats.filter(s=>chosen.includes(s.id));
  const callbackStatus=orders.find(o=>o.id===callbackOrder);
  const venue=event?.venues;
  const maps=venue&&`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.latitude&&venue.longitude?`${venue.latitude},${venue.longitude}`:`${venue.address} ${venue.city}`)}`;
  return <div className="live" dir="rtl">
    <header><div className="live-brand"><img src="/assets/sahno-logo.png" alt="نشان صحنو"/><strong>صحنو</strong></div><span>نسخهٔ متصل به دادهٔ واقعی</span>{user?<button onClick={()=>client.auth.signOut()}>خروج از حساب</button>:<span>ورود با ایمیل</span>}</header>
    <main>
      <h1>رویدادهای صحنو</h1>
      <p>فقط اجراهای منتشرشده و تأییدشده در این فهرست نمایش داده می‌شوند.</p>
      {notice&&<p className="live-notice" role="status">{notice}</p>}
      {callbackOrder&&<section className="live-card"><h2>نتیجهٔ سفارش</h2><p>وضعیت قطعی صرفاً از پایگاه داده خوانده می‌شود، نه از آدرس بازگشت درگاه.</p><p>{callbackStatus?`سفارش ${callbackOrder}: ${callbackStatus.state==='paid'?'پرداخت تأیید شد':callbackStatus.state==='needs_reconciliation'?'نیازمند بررسی مالی':'هنوز پرداخت تأیید نشده است'}`:user?'سفارش در حساب شما پیدا نشد.':'برای بررسی سفارش وارد شوید.'}</p></section>}
      {!user&&<form className="live-card" onSubmit={signIn}><h2>ورود خریدار</h2><label>ایمیل<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button disabled={busy}>ارسال لینک ورود</button><small>این مرحله هویت ایمیلی را بررسی می‌کند؛ احراز هویت حقوقی برگزارکنندگان فرایندی جداگانه است.</small></form>}
      {user&&<section className="live-card"><h2>حساب من</h2><p>{user.email}</p><h3>سفارش‌های اخیر</h3>{orders.length?orders.map(o=><p key={o.id}>{o.id.slice(0,8)} · {money(o.amount_irr)} · {o.state==='paid'?'پرداخت‌شده':o.state==='needs_reconciliation'?'در حال بررسی':'در انتظار پرداخت'}</p>):<p>هنوز سفارشی ثبت نشده است.</p>}</section>}
      {!event?<div className="live-grid">{events.length?events.map(e=><button className="live-card live-event" key={e.id} onClick={()=>{setEvent(e);setSession(null)}}>{e.hero_url&&<img src={e.hero_url} alt=""/>}<h2>{e.title}</h2><p>{e.venues?.name} · {e.venues?.city}</p><span>جزئیات و سانس‌ها ←</span></button>):<section className="live-card">فعلاً اجرای منتشرشده‌ای وجود ندارد. نمونه‌های نمایشی به فروش واقعی منتقل نشده‌اند.</section>}</div>:<>
        <button className="live-back" onClick={()=>{setEvent(null);setSession(null)}}>← بازگشت به اجراها</button>
        <section className="live-card"><h2>{event.title}</h2><p>{event.description}</p><p>{venue?.name} · {venue?.address}، {venue?.city}</p>{maps&&<a href={maps} target="_blank" rel="noopener noreferrer">مسیریابی در گوگل‌مپ</a>}</section>
        <h2>انتخاب سانس</h2><div className="live-grid">{event.event_sessions?.filter(s=>s.sales_open&&new Date(s.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(s=><button key={s.id} className={`live-card ${session?.id===s.id?'live-selected':''}`} onClick={()=>setSession(s)}>{date(s.starts_at)}</button>)}</div>
        {session&&<><h2>صندلی‌ها</h2><div className="live-grid live-seats">{seats.map(s=>{const available=s.state==='available'||(s.state==='held'&&new Date(s.hold_expires_at)<new Date());return <button key={s.id} disabled={!available||busy} className={chosen.includes(s.id)?'live-selected':''} onClick={()=>setChosen(xs=>xs.includes(s.id)?xs.filter(x=>x!==s.id):xs.length<6?[...xs,s.id]:xs)}>{s.seat_label}<small>{available?money(s.price_irr):'ناموجود'}</small></button>})}</div><section className="live-card"><h3>خلاصه انتخاب</h3><p>{selected.map(s=>s.seat_label).join('، ')||'صندلی انتخاب نشده است'}</p><strong>{money(selected.reduce((n,s)=>n+Number(s.price_irr),0))}</strong><button disabled={!user||!chosen.length||busy} onClick={pay}>{busy?'در حال پردازش…':'رزرو و انتقال به درگاه'}</button>{!user&&<small>برای خرید ابتدا وارد حساب شوید.</small>}</section></>}
      </>}
    </main>
  </div>;
}
