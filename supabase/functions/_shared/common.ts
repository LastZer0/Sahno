import { createClient } from 'npm:@supabase/supabase-js@2.58.0'

export const appOrigin = Deno.env.get('SAHNO_APP_ORIGIN') ?? ''
export const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
export const admin = createClient(supabaseUrl, secret, {auth:{persistSession:false}})

export function json(body: unknown, status=200) {
  return new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':appOrigin,'access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','vary':'Origin'}})
}
export function preflight(req: Request) { return req.method === 'OPTIONS' ? json({},204) : null }
export function validOrigin(req: Request) { return !!appOrigin && req.headers.get('origin')===appOrigin }
export async function userFromRequest(req: Request) {
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') ?? ''
  if(!token) return null
  const {data,error}=await admin.auth.getUser(token)
  return error ? null : data.user
}
export function fail(error: unknown,status=400){
  // Return a generic error; provider and database details stay in server logs.
  console.error(error)
  return json({error:'درخواست انجام نشد. لطفاً دوباره تلاش کنید.'},status)
}
export function requireConfig(){if(!supabaseUrl || !secret || !appOrigin) throw Error('missing_backend_config')}
