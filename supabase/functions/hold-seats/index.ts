import {admin,fail,json,preflight,requireConfig,userFromRequest,validOrigin} from '../_shared/common.ts'

Deno.serve(async req=>{
  const options=preflight(req);if(options)return options
  if(req.method!=='POST' || !validOrigin(req))return json({error:'درخواست نامعتبر'},403)
  try {
    requireConfig()
    const user=await userFromRequest(req)
    if(!user)return json({error:'برای رزرو وارد حساب شوید.'},401)
    const input=await req.json()
    if(typeof input.session_id!=='string' || !Array.isArray(input.seat_ids) || !input.seat_ids.every((x:unknown)=>typeof x==='string'))return json({error:'صندلی‌ها نامعتبرند.'},400)
    const {data,error}=await admin.rpc('reserve_seats',{p_buyer:user.id,p_session:input.session_id,p_seats:input.seat_ids})
    if(error)return fail(error,409)
    return json({order_id:data.id,amount_irr:data.amount_irr,expires_at:data.expires_at})
  } catch(e){return fail(e,500)}
})
