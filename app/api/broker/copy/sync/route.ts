import {NextRequest,NextResponse} from "next/server";
import {getSession} from "@/lib/server/session";
import {listBrokerAccountsWithSessions,accountSession} from "@/lib/angel-one/account-store";
import {openSession} from "@/lib/angel-one/session";
import {smartApiRequest} from "@/lib/angel-one/smartapi";
import {liveDb,liveConfigReady} from "@/lib/angel-one/live-trading";
import {findVerifiedInstrument} from "@/lib/angel-one/instrument-master";
import {evaluateRisk,isEligibleFollower,makeCopyOrderTag} from "@/lib/angel-one/trading-core.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
function sameOrigin(r:NextRequest){const o=r.headers.get("origin"),h=r.headers.get("x-forwarded-host")??r.headers.get("host");try{return Boolean(o&&h&&new URL(o).host===h)}catch{return false}}
function indiaDay(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function pnlOf(value:unknown){if(!Array.isArray(value))throw new Error("Follower position response is invalid; copy blocked.");return value.reduce((sum,row)=>{const p=row as Record<string,unknown>;if(p.realised===undefined&&p.realized===undefined)throw new Error("Follower realized P&L missing; copy blocked.");const n=Number(p.realised??p.realized);if(!Number.isFinite(n))throw new Error("Follower realized P&L malformed; copy blocked.");return sum+n;},0);}
async function ensureCopyTables(sql:any){
 await sql`CREATE TABLE IF NOT EXISTS eagle_trades_copy_sync_control(id text PRIMARY KEY,baseline_complete boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now())`;
 await sql`INSERT INTO eagle_trades_copy_sync_control(id,baseline_complete) VALUES('global',false) ON CONFLICT(id) DO NOTHING`;
 await sql`CREATE TABLE IF NOT EXISTS eagle_trades_copy_source_orders(master_order_id text PRIMARY KEY,source_payload jsonb NOT NULL,state text NOT NULL DEFAULT 'PENDING',lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
}
async function marketReference(session:any,exchange:string,symbol:string,token:string){
 const quote=await smartApiRequest<Record<string,unknown>>("/rest/secure/angelbroking/order/v1/getLtpData","POST",session,{exchange,tradingsymbol:symbol,symboltoken:token});
 const price=Number(quote.ltp);if(!Number.isFinite(price)||price<=0)throw new Error("Angel One LTP unavailable; market copy blocked.");return price;
}
async function processSource(sql:any,source:Record<string,unknown>,followers:any[],limits:any){
 const masterOrderId=String(source.orderid??"");
 const exchange=String(source.exchange??"").toUpperCase();
 const symbol=String(source.tradingsymbol??"").toUpperCase();
 const token=String(source.symboltoken??"");
 const side=String(source.transactiontype??"").toUpperCase();
 const sourceType=String(source.ordertype??"").toUpperCase();
 const rawProduct=String(source.producttype??"").toUpperCase();
 const product=rawProduct==="INTRADAY"||rawProduct==="MIS"?"MIS":rawProduct==="DELIVERY"||rawProduct==="CNC"?"CNC":null;
 if(!masterOrderId||!["NSE","BSE"].includes(exchange)||!["BUY","SELL"].includes(side)||!product||!["MARKET","LIMIT"].includes(sourceType))return [{masterOrderId,status:"SKIPPED",reason:"Unsupported master order type, exchange, side or product."}];
 const status=String(source.orderstatus??source.status??"").toLowerCase().replaceAll("_"," ");
 if(["rejected","cancelled","canceled"].includes(status))return [{masterOrderId,status:"SKIPPED",reason:"Master order was rejected or cancelled."}];
 const instrument=await findVerifiedInstrument(exchange,symbol,token);
 const fixed=Number(process.env.COPY_FIXED_QUANTITY);
 if(!Number.isSafeInteger(fixed)||fixed<1)throw new Error("COPY_FIXED_QUANTITY must be a positive integer.");
 const results=[];
 for(const account of followers){
  const key="COPY:"+masterOrderId+":"+account.id;
  const tag=makeCopyOrderTag(masterOrderId,account.id);
  const session=accountSession(account,openSession);
  const price=sourceType==="LIMIT"?Number(source.price):0;
  let referencePrice=price;
  let orderStatus="BLOCKED_COPY";
  let saved:any[]=[];
  try{
   if(!isEligibleFollower(account)||!session)throw new Error("Follower copy consent or broker session is unavailable.");
   if(sourceType==="LIMIT"&&(!Number.isFinite(price)||price<=0))throw new Error("Master limit price is invalid.");
   if(sourceType==="LIMIT"&&(!Number.isFinite(instrument.tickSize)||instrument.tickSize<=0||Math.abs(Math.round(price/instrument.tickSize)*instrument.tickSize-price)>0.000001))throw new Error("Master limit price does not match instrument tick size.");
   if(sourceType==="MARKET")referencePrice=await marketReference(session,exchange,symbol,token);
   const [positions,count]=await Promise.all([
    smartApiRequest<unknown>("/rest/secure/angelbroking/order/v1/getPosition","GET",session),
    sql`SELECT count(*)::int AS n FROM eagle_trades_live_orders WHERE account_id=${account.id} AND created_at>=${indiaDay()}::date AND created_at<(${indiaDay()}::date+interval '1 day') AND status NOT IN ('REJECTED','BLOCKED_COPY')`
   ]);
   const risk=evaluateRisk({quantity:fixed,price:referencePrice,maxQuantity:limits.maxQty,maxNotional:limits.maxNotional,dailyOrderCount:Number(count[0]?.n??0),maxDailyOrders:limits.maxOrders,dailyPnl:pnlOf(positions),maxDailyLoss:limits.maxLoss});
   if(!risk.allowed)throw new Error("Risk check blocked follower order: "+risk.reason);
   saved=await sql`INSERT INTO eagle_trades_live_orders(id,idempotency_key,account_id,order_tag,trading_symbol,symbol_token,exchange,side,product,quantity,limit_price,status) VALUES(${crypto.randomUUID()},${key},${account.id},${tag},${symbol},${token},${exchange},${side},${product},${fixed},${referencePrice},'SUBMITTING') ON CONFLICT(account_id,idempotency_key) DO NOTHING RETURNING id`;
   if(!saved.length){results.push({accountId:account.id,label:account.label,status:"DUPLICATE",message:"This Master order was already handled for this follower."});continue;}
   try{
    const broker=await smartApiRequest<Record<string,unknown>>("/rest/secure/angelbroking/order/v1/placeOrder","POST",session,{variety:"NORMAL",tradingsymbol:symbol,symboltoken:token,transactiontype:side,exchange,ordertype:sourceType,producttype:product==="MIS"?"INTRADAY":"DELIVERY",duration:"DAY",price:sourceType==="LIMIT"?String(price):"0",quantity:String(fixed),disclosedquantity:"0",triggerprice:"0",squareoff:"0",stoploss:"0",ordertag:tag});
    const brokerOrderId=String(broker.orderid??broker.orderId??"");
    const uniqueId=String(broker.uniqueorderid??broker.uniqueOrderId??"");
    if(!brokerOrderId)throw new Error("Broker acknowledgement omitted order ID; outcome uncertain.");
    await sql`UPDATE eagle_trades_live_orders SET status='ACKNOWLEDGED',broker_order_id=${brokerOrderId},unique_order_id=NULLIF(${uniqueId},''),broker_payload=${JSON.stringify(broker)}::jsonb,updated_at=now() WHERE account_id=${account.id} AND idempotency_key=${key}`;
    orderStatus="ACKNOWLEDGED";
    results.push({accountId:account.id,label:account.label,status:orderStatus,brokerOrderId,quantity:fixed});
   }catch(e){
    await sql`UPDATE eagle_trades_live_orders SET status='SUBMISSION_UNCERTAIN',broker_payload=${JSON.stringify({error:e instanceof Error?e.message:"Unknown broker response"})}::jsonb,updated_at=now() WHERE account_id=${account.id} AND idempotency_key=${key}`;
    results.push({accountId:account.id,label:account.label,status:"SUBMISSION_UNCERTAIN",message:"Check follower order book; do not retry blindly."});
   }
  }catch(e){
   const reason=e instanceof Error?e.message:"Follower risk check failed.";
   const blocked=await sql`INSERT INTO eagle_trades_live_orders(id,idempotency_key,account_id,order_tag,trading_symbol,symbol_token,exchange,side,product,quantity,limit_price,status,broker_payload) VALUES(${crypto.randomUUID()},${key},${account.id},${tag},${symbol},${token},${exchange},${side},${product},${fixed},${Math.max(0,Number.isFinite(referencePrice)?referencePrice:0)},'BLOCKED_COPY',${JSON.stringify({reason})}::jsonb) ON CONFLICT(account_id,idempotency_key) DO NOTHING RETURNING id`;
   results.push({accountId:account.id,label:account.label,status:blocked.length?"BLOCKED":"DUPLICATE",reason});
  }
 }
 return results;
}
export async function POST(request:NextRequest){
 const cronSecret=process.env.CRON_SECRET;
 const cronAuthorized=Boolean(cronSecret&&cronSecret.length>=24&&request.headers.get("authorization")==="Bearer "+cronSecret);
 if(!cronAuthorized&&!await getSession())return NextResponse.json({error:"Application login required."},{status:401});
 if(!cronAuthorized&&!sameOrigin(request))return NextResponse.json({error:"Same-origin request required."},{status:403});
 try{
  const body=await request.json();if(body?.confirmCopySync!==true)return NextResponse.json({error:"Explicit start/continue confirmation required."},{status:400});
  if(process.env.ANGELONE_LIVE_COPY_ENABLED!=="true"||!liveConfigReady())return NextResponse.json({liveCopyEnabled:false,error:"Live Master-to-Follower copy is disabled or its broker, static-IP, encryption and risk gates are incomplete."},{status:403});
  const accounts=await listBrokerAccountsWithSessions();
  const master=accounts.find(a=>a.id==="master"&&a.role==="MASTER");
  if(!master||!master.authorized_for_copy)throw new Error("Master account has not explicitly authorized copy trading.");
  const masterSession=accountSession(master,openSession);if(!masterSession)throw new Error("Master broker session expired.");
  const followers=accounts.filter(a=>a.role==="FOLLOWER");
  if(!followers.length)throw new Error("No follower accounts are connected.");
  const sql=await liveDb();await ensureCopyTables(sql);
  const stop=await sql`SELECT emergency_stopped FROM eagle_trades_live_control WHERE id='global' LIMIT 1`;
  if(Boolean(stop[0]?.emergency_stopped??true))throw new Error("Emergency stop is active; copy is blocked.");
  const [maxQty,maxNotional,maxOrders,maxLoss]=[Number(process.env.LIVE_MAX_ORDER_QTY),Number(process.env.LIVE_MAX_ORDER_NOTIONAL),Number(process.env.LIVE_MAX_ORDERS_PER_DAY),Number(process.env.LIVE_MAX_DAILY_LOSS)];
  if(![maxQty,maxNotional,maxOrders,maxLoss].every(n=>Number.isSafeInteger(n)&&n>0))throw new Error("Follower risk limits are missing or invalid.");
  const data=await smartApiRequest<unknown>("/rest/secure/angelbroking/order/v1/getOrderBook","GET",masterSession);
  if(!Array.isArray(data))throw new Error("Master order book response is invalid.");
  const [control]=await sql`SELECT baseline_complete FROM eagle_trades_copy_sync_control WHERE id='global' LIMIT 1`;
  if(!control?.baseline_complete){
   for(const row of data as Array<Record<string,unknown>>){const id=String(row.orderid??"");if(id)await sql`INSERT INTO eagle_trades_copy_source_orders(master_order_id,source_payload,state) VALUES(${id},${JSON.stringify(row)}::jsonb,'BASELINE') ON CONFLICT(master_order_id) DO NOTHING`;}
   await sql`UPDATE eagle_trades_copy_sync_control SET baseline_complete=true,updated_at=now() WHERE id='global'`;
   return NextResponse.json({liveCopyEnabled:true,baseline:true,copied:0,message:"Initial order-book baseline saved. Existing Master orders were not copied. New Master orders will be copied while monitoring is running."});
  }
  const followersEligible=followers.filter(a=>a.authorized_for_copy);
  const pending=[];
  for(const row of data as Array<Record<string,unknown>>){
   const id=String(row.orderid??"");if(!id)continue;
   // Do not mirror a merely placed/open Master order. Wait until Angel One reports
   // execution, and copy only the actually filled Master quantity as the source fact.
   const status=String(row.orderstatus??row.status??"").toLowerCase().replaceAll("_"," ").trim();
   const filled=Number(row.filledshares??row.filledShares??0);
   if(!["complete","completed","filled"].includes(status)||!Number.isSafeInteger(filled)||filled<1)continue;
   const executedSource={...row,quantity:String(filled)};
   await sql`INSERT INTO eagle_trades_copy_source_orders(master_order_id,source_payload,state) VALUES(${id},${JSON.stringify(executedSource)}::jsonb,'PENDING') ON CONFLICT(master_order_id) DO NOTHING`;
   const claim=await sql`UPDATE eagle_trades_copy_source_orders SET state='PROCESSING',lease_until=now()+interval '60 seconds',updated_at=now() WHERE master_order_id=${id} AND (state='PENDING' OR (state='PROCESSING' AND lease_until<now())) RETURNING source_payload`;
   if(claim.length)pending.push(claim[0].source_payload as Record<string,unknown>);
  }
  const results=[];
  for(const source of pending){
   const outcomes=await processSource(sql,source,followersEligible,{maxQty,maxNotional,maxOrders,maxLoss});
   const failed=outcomes.some(x=>x.status==="SUBMISSION_UNCERTAIN"||x.status==="BLOCKED");
   await sql`UPDATE eagle_trades_copy_source_orders SET state=${failed?"PARTIAL":"DONE"},lease_until=NULL,updated_at=now() WHERE master_order_id=${String(source.orderid)}`;
   results.push({masterOrderId:String(source.orderid),symbol:String(source.tradingsymbol??""),outcomes});
  }
  return NextResponse.json({liveCopyEnabled:true,baseline:false,processed:results.length,results,message:"New Master orders checked. Follower orders are individually recorded and reconciled; uncertain submissions are never retried automatically."});
 }catch(e){return NextResponse.json({liveCopyEnabled:false,error:e instanceof Error?e.message:"Copy synchronization failed."},{status:422});}
}
