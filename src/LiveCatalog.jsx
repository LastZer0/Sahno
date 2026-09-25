import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './real.css';

// The publishable key grants only public RLS access. Never put a service key here.
const url = 'https://lblofaxdenfekxvrqnut.supabase.co';
const publishableKey = 'sb_publishable_KVdGssQ7z02Hq4degiuJYg_VWOoZ74n';
const client = createClient(url, publishableKey);

export function LiveCatalog() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let active = true;
    client.from('events')
      .select('id,title,description,hero_url,venues(name,city,address,latitude,longitude),event_sessions(id,starts_at,sales_open)')
      .eq('status', 'published').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        setStatus(error ? 'error' : 'ready');
        if (!error) setEvents(data ?? []);
      });
    return () => { active = false; };
  }, []);

  return <div className="live" dir="rtl">
    <header><div className="live-brand"><img src="/assets/sahno-logo.png" alt="نشان صحنو"/><strong>صحنو</strong></div><span>پیش‌نمایش کاتالوگ واقعی · فروش غیرفعال</span><a href="/">بازگشت به نسخهٔ نمایشی</a></header>
    <main>
      <h1>رویدادهای صحنو</h1>
      <p>این صفحه فقط اجراهای منتشرشدهٔ پایگاه دادهٔ اختصاصی صحنو را نشان می‌دهد. ورود و خرید در این پیش‌نمایش فعال نیست.</p>
      {status === 'loading' && <p role="status">در حال دریافت اجراها…</p>}
      {status === 'error' && <p className="live-notice" role="alert">اتصال به کاتالوگ برقرار نشد. لطفاً بعداً دوباره تلاش کنید.</p>}
      {status === 'ready' && (events.length ? <div className="live-grid">{events.map(event => {
        const venue = event.venues;
        const location = venue?.latitude != null && venue?.longitude != null
          ? `${venue.latitude},${venue.longitude}` : `${venue?.address ?? ''} ${venue?.city ?? ''}`;
        const map = location.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null;
        return <article className="live-card" key={event.id}>
          {event.hero_url && <img src={event.hero_url} alt=""/>}
          <h2>{event.title}</h2><p>{event.description}</p>
          <p>{venue?.name} · {venue?.city}</p>
          {map && <a href={map} target="_blank" rel="noopener noreferrer">مسیریابی در گوگل‌مپ</a>}
          <h3>سانس‌ها</h3>
          {(event.event_sessions ?? []).filter(session => session.sales_open && new Date(session.starts_at) > new Date()).map(session =>
            <p key={session.id}>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(session.starts_at))}</p>)}
        </article>;
      })}</div> : <section className="live-card">هنوز اجرای تأییدشده‌ای منتشر نشده است. داده‌های نمایشی به پایگاه داده منتقل نشده‌اند.</section>)}
    </main>
  </div>;
}
