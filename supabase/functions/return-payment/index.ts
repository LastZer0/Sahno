import {admin,appOrigin,supabaseUrl} from '../_shared/common.ts'

function resultPage(orderId:string,state:string){
  const url=new URL('/payment-result',appOrigin)
  url.searchParams.set('order',orderId)
  url.searchParams.set('state',state)
  return Response.redirect(url.toString(),303)
}
// Public callback: authority is untrusted until verified by the gateway.
Deno.serve(async req=>{
  if(req.method!=='GET' || !appOrigin || !supabaseUrl)return new Response('Unavailable',{status:503})
  const url=new URL(req.url),authority=url.searchParams.get('Authority') ?? '',status=url.searchParams.get('Status') ?? ''
  if(!/^A?[a-zA-Z0-9]{20,60}$/.test(authority))return new Response('Invalid authority',{status:400})
  const {data:payment,error}=await admin.from('payments').select('id,order_id,amount_irr,state').eq('authority',authority).maybeSingle()
  if(error || !payment)return new Response('Unknown transaction',{status:404})
  const orderId=payment.order_id
  if(payment.state==='verified')return resultPage(orderId,'paid')
  if(status!=='OK'){
    // A public callback is not evidence of cancellation; never mutate the ledger here.
    return resultPage(orderId,'pending')
  }
  const merchant=Deno.env.get('ZARINPAL_MERCHANT_ID')
  if(!merchant)return new Response('Unavailable',{status:503})
  try{
    const response=await fetch('https://payment.zarinpal.com/pg/v4/payment/verify.json',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({merchant_id:merchant,amount:Number(payment.amount_irr),authority})})
    const result=await response.json()
    if(!response.ok || ![100,101].includes(result?.data?.code))return resultPage(orderId,'pending')
    if(result.data.code===101){
      // A prior verification without a recorded paid order needs manual reconciliation.
      await admin.from('payments').update({state:'needs_reconciliation'}).eq('id',payment.id).eq('state','initiated')
      return resultPage(orderId,'review')
    }
    const refId=String(result.data.ref_id ?? '')
    if(!refId)return resultPage(orderId,'review')
    const completed=await admin.rpc('complete_verified_payment',{p_authority:authority,p_ref_id:refId})
    if(completed.error){
      await admin.from('payments').update({state:'needs_reconciliation'}).eq('id',payment.id).eq('state','initiated')
      await admin.from('orders').update({state:'needs_reconciliation'}).eq('id',orderId).eq('state','awaiting_payment')
      console.error(completed.error)
      return resultPage(orderId,'review')
    }
    return resultPage(orderId,'paid')
  }catch(e){console.error(e);return resultPage(orderId,'pending')}
})
