import {searchCashEquities} from "@/lib/angel-one/trading-core.mjs";
const MASTER_URL="https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";
let cache:{rows:unknown[];loadedAt:number}|null=null;
async function master(){if(cache&&Date.now()-cache.loadedAt<6*60*60*1000)return cache.rows;const response=await fetch(MASTER_URL,{cache:"no-store",signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error("Angel One instrument master is unavailable.");const data=await response.json();if(!Array.isArray(data)||data.length<1000)throw new Error("Angel One instrument master response is invalid.");cache={rows:data,loadedAt:Date.now()};return cache.rows;}
export async function findVerifiedInstrument(exchange:string,symbol:string,token:string){const rows=await master();const found=searchCashEquities(rows,symbol,exchange).find(x=>x.symbol===symbol.toUpperCase()&&x.token===String(token));if(!found)throw new Error("Instrument/token does not match Angel One's current instrument master.");return found;}
export async function searchInstruments(exchange:string,q:string){return searchCashEquities(await master(),q,exchange);}
export function instrumentMasterLoadedAt(){return cache?.loadedAt??null;}
