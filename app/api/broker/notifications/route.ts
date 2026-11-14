import {NextRequest,NextResponse} from "next/server";
import {getSession} from "@/lib/server/session";
import {listBrokerAccountsWithSessions,accountSession} from "@/lib/angel-one/account-store";
import {openSession} from "@/lib/angel-one/session";
import {liveDb,reconcileOrders} from "@/lib/angel-one/live-trading";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(_request:NextRequest){
 if(!await getSession())return NextResponse.json({error:"Application login required."},{status:401});
 try{
  const accounts=await listBrokerAccountsWithSessions();
  const sql=await liveDb();
  const accountErrors:string[]=[];
  for(const account of accounts){
   const session=accountSession(account,openSession);
   if(!session){accountErrors.push(account.label+": broker session expired or unavailable");continue;}
   try{await reconcileOrders(sql,session,account.id);}
   catch(e){accountErrors.push(account.label+": "+(e instanceof Error?e.message:"Order status refresh failed"));}
  }
  const rows=await sql`SELECT id,idempotency_key,account_id,order_tag,trading_symbol,exchange,side,product,quantity,limit_price,status,broker_order_id,broker_payload,created_at,updated_at FROM eagle_trades_live_orders ORDER BY created_at DESC LIMIT 250`;
  const accountById=new Map(accounts.map(a=>[a.id,a]));
  const masters=rows.filter((r:any)=>r.account_id==="master");
  const followerAccounts=accounts.filter(a=>a.role==="FOLLOWER");
  const followerRows=rows.filter((r:any)=>r.account_id!=="master");
  const byMaster=new Map<string,any[]>();
  for(const row of followerRows){
   const match=String(row.idempotency_key??"").match(/^COPY:([^:]+):/);
   if(!match)continue;
   const list=byMaster.get(match[1])??[];
   list.push(row);
   byMaster.set(match[1],list);
  }
  const groups=masters.map((master:any)=>{
   const linked=byMaster.get(String(master.broker_order_id??""))??[];
   const rowByAccount=new Map(linked.map((row:any)=>[row.account_id,row]));
   const followerResults=followerAccounts.map(account=>{
    const row:any=rowByAccount.get(account.id);
    if(!row)return {accountId:account.id,accountLabel:account.label,status:account.authorized_for_copy?"NOT_COPIED":"NOT_AUTHORIZED",quantity:0,brokerOrderId:null,averagePrice:null,updatedAt:null};
    const payload=row.broker_payload&&typeof row.broker_payload==="object"?row.broker_payload:{};
    const averagePrice=Number((payload as any).averageprice??(payload as any).averagePrice??(payload as any).avgprice??0);
    return {accountId:account.id,accountLabel:account.label,status:row.status,quantity:row.quantity,brokerOrderId:row.broker_order_id,averagePrice:Number.isFinite(averagePrice)&&averagePrice>0?averagePrice:null,updatedAt:row.updated_at};
   });
   const filled=followerResults.filter(x=>["COMPLETE","COMPLETED","FILLED"].includes(String(x.status).toUpperCase())).length;
   const rejected=followerResults.filter(x=>["REJECTED","CANCELLED","CANCELED","BLOCKED_COPY","SUBMISSION_UNCERTAIN"].includes(String(x.status).toUpperCase())).length;
   return {id:master.id,masterOrderId:master.broker_order_id,symbol:master.trading_symbol,exchange:master.exchange,side:master.side,product:master.product,quantity:master.quantity,limitPrice:master.limit_price,status:master.status,createdAt:master.created_at,updatedAt:master.updated_at,followers:followerResults,copySummary:{total:followerResults.length,filled,issues:rejected,pending:followerResults.length-filled-rejected}};
  });
  return NextResponse.json({orders:groups,accountErrors,refreshedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not load broker order notifications."},{status:503});}
}
