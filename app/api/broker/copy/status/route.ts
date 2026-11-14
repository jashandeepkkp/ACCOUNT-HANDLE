import {NextRequest,NextResponse} from "next/server";
import {getSession} from "@/lib/server/session";
import {listBrokerAccountsWithSessions,accountSession} from "@/lib/angel-one/account-store";
import {openSession} from "@/lib/angel-one/session";
import {liveDb,reconcileOrders} from "@/lib/angel-one/live-trading";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function payloadOf(value:unknown):Record<string,unknown>{
 if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;
 if(typeof value==="string"){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==="object"?parsed as Record<string,unknown>:{};}catch{return {};}}
 return {};
}
function safeStatus(value:unknown){return String(value??"UNKNOWN").trim().toUpperCase().replaceAll(" ","_");}

export async function GET(_request:NextRequest){
 if(!await getSession())return NextResponse.json({error:"Application login required."},{status:401});
 try{
  const accounts=await listBrokerAccountsWithSessions();
  const master=accounts.find(a=>a.id==="master"&&a.role==="MASTER");
  if(!master)return NextResponse.json({orders:[],message:"Connect the Angel One Master account to view live order execution."});
  const sql=await liveDb();
  const masterSession=accountSession(master,openSession);
  const syncErrors:string[]=[];
  if(masterSession){try{await reconcileOrders(sql,masterSession,"master");}catch{syncErrors.push("Master order book could not be refreshed.");}}
  const followers=accounts.filter(a=>a.role==="FOLLOWER");
  await Promise.all(followers.map(async account=>{
   const session=accountSession(account,openSession);
   if(!session){syncErrors.push(account.label+": broker session expired or unavailable.");return;}
   try{await reconcileOrders(sql,session,account.id);}catch{syncErrors.push(account.label+": order book refresh failed.");}
  }));
  const rows=await sql`SELECT idempotency_key,account_id,broker_order_id,trading_symbol,symbol_token,exchange,side,product,quantity,limit_price,status,broker_payload,created_at,updated_at FROM eagle_trades_live_orders WHERE created_at>=now()-interval '30 days' ORDER BY created_at DESC LIMIT 1000`;
  const masterRows=rows.filter((row:any)=>row.account_id==="master"&&row.broker_order_id);
  const followerRows=rows.filter((row:any)=>row.account_id!=="master");
  const labelById=new Map(accounts.map(a=>[a.id,a.label]));
  const orders=masterRows.map((masterOrder:any)=>{
   const brokerId=String(masterOrder.broker_order_id);
   const copied=followerRows.filter((row:any)=>String(row.idempotency_key).startsWith("COPY:"+brokerId+":"));
   const copiedByAccount=new Map(copied.map((row:any)=>[String(row.account_id),row]));
   const followerResults=followers.map(account=>{
    const row:any=copiedByAccount.get(account.id);
    const payload=payloadOf(row?.broker_payload);
    return {
     accountId:account.id,
     accountLabel:account.label||labelById.get(account.id)||"Follower account",
     status:row?safeStatus(row.status):"NOT_COPIED",
     quantity:row?Number(row.quantity):null,
     averagePrice:row?Number(payload.averageprice??payload.averagePrice??payload.avgprice??0)||null:null,
     brokerOrderId:row?.broker_order_id?String(row.broker_order_id):null,
     updatedAt:row?.updated_at??null,
     reason:typeof payload.reason==="string"?payload.reason:typeof payload.error==="string"?payload.error:null
    };
   });
   const payload=payloadOf(masterOrder.broker_payload);
   return {
    id:String(masterOrder.id),
    masterOrderId:brokerId,
    symbol:String(masterOrder.trading_symbol),
    exchange:String(masterOrder.exchange),
    side:String(masterOrder.side),
    product:String(masterOrder.product),
    quantity:Number(masterOrder.quantity),
    orderType:String(payload.ordertype??"LIMIT").toUpperCase(),
    masterStatus:safeStatus(masterOrder.status),
    masterAveragePrice:Number(payload.averageprice??payload.averagePrice??payload.avgprice??0)||null,
    placedAt:masterOrder.created_at,
    updatedAt:masterOrder.updated_at,
    followers:followerResults
   };
  });
  return NextResponse.json({orders,followersConfigured:followers.length,refreshedAt:new Date().toISOString(),syncErrors},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:"Could not load Master and Follower order execution."},{status:503});
 }
}
