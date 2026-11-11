import {NextRequest,NextResponse} from "next/server";
import {getSession} from "@/lib/server/session";
import {liveDb,liveConfigReady} from "@/lib/angel-one/live-trading";
import {listBrokerAccountsWithSessions,accountSession} from "@/lib/angel-one/account-store";
import {openSession} from "@/lib/angel-one/session";
import {smartApiRequest} from "@/lib/angel-one/smartapi";
export const runtime="nodejs";export const dynamic="force-dynamic";
function sameOrigin(r:NextRequest){const o=r.headers.get("origin"),h=r.headers.get("x-forwarded-host")??r.headers.get("host");try{return Boolean(o&&h&&new URL(o).host===h)}catch{return false}}
const OPEN=new Set(["open","pending","open pending","trigger pending","modify pending","cancel pending","partially filled","partially executed","after market order req received","modify after market order req received"]);
export async function POST(request:NextRequest){
 if(!await getSession())return NextResponse.json({error:"Login required."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({error:"Same-origin request required."},{status:403});
 try{
  const body=await request.json();
  if(body?.confirmResume!==true)return NextResponse.json({resumed:false,error:"Explicit confirmResume:true is required."},{status:400});
  if(!liveConfigReady())return NextResponse.json({resumed:false,error:"All broker approval, static IP, encryption and risk configuration gates must pass before recovery."},{status:403});
  const sql=await liveDb();
  const accounts=await listBrokerAccountsWithSessions();
  const local=await sql`SELECT id,account_id,broker_order_id,unique_order_id,status FROM eagle_trades_live_orders WHERE status IN ('SUBMITTING','SUBMISSION_UNCERTAIN','ACKNOWLEDGED','OPEN','OPEN PENDING','PARTIALLY_FILLED','PARTIALLY FILLED','PARTIALLY_EXECUTED','PARTIALLY EXECUTED','PENDING','TRIGGER PENDING','AFTER MARKET ORDER REQ RECEIVED','MODIFY PENDING','MODIFY AFTER MARKET ORDER REQ RECEIVED','CANCEL_PENDING','CANCEL_REQUESTED')`;
  const grouped=new Map<string,Array<Record<string,unknown>>>();
  for(const order of local){const key=String(order.account_id);grouped.set(key,[...(grouped.get(key)??[]),order]);}
  const issues=[];
  for(const [accountId,orders] of grouped){
   const account=accounts.find(a=>a.id===accountId);
   const session=account?accountSession(account,openSession):null;
   if(!session){for(const order of orders)issues.push({orderId:order.id,reason:"Missing or expired broker session"});continue;}
   try{
    const rows=await smartApiRequest<unknown>("/rest/secure/angelbroking/order/v1/getOrderBook","GET",session);
    if(!Array.isArray(rows))throw new Error("Broker order book response is not an array.");
    const book=rows as Array<Record<string,unknown>>;
    for(const order of orders){
     const brokerId=String(order.broker_order_id??""),uniqueId=String(order.unique_order_id??"");
     if(!brokerId&&!uniqueId){issues.push({orderId:order.id,reason:"No broker order identifier; manual verification required"});continue;}
     const match=book.find(r=>(brokerId&&String(r.orderid??"")===brokerId)||(uniqueId&&String(r.uniqueorderid??"")===uniqueId));
     if(!match){issues.push({orderId:order.id,reason:"Order not found in broker order book; manual verification required"});continue;}
     const status=String(match.orderstatus??match.status??"UNKNOWN").toLowerCase().replaceAll("_"," ");
     await sql`UPDATE eagle_trades_live_orders SET status=${status.toUpperCase().replaceAll(" ","_")},broker_payload=${JSON.stringify(match)}::jsonb,updated_at=now() WHERE id=${String(order.id)}`;
     if(OPEN.has(status)||status==="unknown")issues.push({orderId:order.id,reason:"Order is not confirmed terminal",status});
    }
   }catch(e){for(const order of orders)issues.push({orderId:order.id,reason:e instanceof Error?e.message:"Order reconciliation failed"});}
  }
  if(issues.length)return NextResponse.json({resumed:false,issues,message:"Stop remains active. Resolve every open, uncertain or unreconciled tracked order first."},{status:409});
  await sql`UPDATE eagle_trades_live_control SET emergency_stopped=false,updated_at=now(),updated_by='owner-explicit-recovery' WHERE id='global'`;
  return NextResponse.json({resumed:true,emergencyStopped:false,message:"Stop released after tracked orders reconciled. All other live risk gates still apply."});
 }catch(e){return NextResponse.json({resumed:false,error:e instanceof Error?e.message:"Recovery unavailable. Stop remains active."},{status:503});}
}
