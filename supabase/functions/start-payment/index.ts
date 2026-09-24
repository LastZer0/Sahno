import {admin,appOrigin,fail,json,preflight,requireConfig,userFromRequest,validOrigin,supabaseUrl} from '../_shared/common.ts'

const gateway='https://payment.zarinpal.com'
Deno.serve(async req=>{
  const options=preflight(req);if(options)return options
  if(req.method!=='POST' || !validOrigin(req))return json({error:'درخواست نامعتبر'},403)
  try {
    requireConfig()
    const merchant=Deno.env.get('ZARINPAL_MERCHANT_ID')
    if(!merchant)throw Error('missing_gateway_config')
    const user=await userFromRequest(req)
    if(!user)return json({error:'برای پرداخت وارد حساب شوید.'},401)
    const {order_id}=await req.json()
    const {data:order,error}=await admin.from('orders').select('id,buyer_id,amount_irr,state,expires_at').eq('id',order_id).single()
    if(error || !order || order.buyer_id!==user.id)return json({error:'سفارش پیدا نشد.'},404)
    if(order.state!=='awaiting_payment' || Date.parse(order.expires_at)<=Date.now())return json({error:'مهلت این رزرو تمام شده است.'},409)
    const existing=await admin.from('payments').select('authority,amount_irr,state').eq('order_id',order.id).eq('provider','zarinpal').maybeSingle()
    if(existing.data?.state==='initiated' && Number(existing.data.amount_irr)===Number(order.amount_irr))
      return json({redirect_url:`${gateway}/pg/StartPay/${encodeURIComponent(existing.data.authority)}`})
    if(existing.data)return json({error:'این سفارش نیازمند بررسی پشتیبانی است.'},409)
    const amount=Number(order.amount_irr)
    if(!Number.isSafeInteger(amount) || amount<10000)return json({error:'مبلغ سفارش نامعتبر است.'},400)
    const response=await fetch(`${gateway}/pg/v4/payment/request.json`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({merchant_id:merchant,amount,currency:'IRR',description:`سفارش صحنو ${order.id}`,callback_url:`${supabaseUrl}/functions/v1/return-payment`,metadata:{order_id:order.id}})})
    const result=await response.json()
    const authority=result?.data?.authority
    if(!response.ok || result?.data?.code!==100 || typeof authority!=='string')throw Error('gateway_request_failed')
    const inserted=await admin.from('payments').insert({order_id:order.id,provider:'zarinpal',authority,amount_irr:amount}).select('authority').single()
    if(inserted.error){
      // Another request may have won the unique(order_id,provider) race.
      const retry=await admin.from('payments').select('authority').eq('order_id',order.id).eq('provider','zarinpal').maybeSingle()
      if(retry.data?.authority)return json({redirect_url:`${gateway}/pg/StartPay/${encodeURIComponent(retry.data.authority)}`})
      throw inserted.error
    }
    return json({redirect_url:`${gateway}/pg/StartPay/${encodeURIComponent(authority)}`})
  }catch(e){return fail(e,502)}
})
