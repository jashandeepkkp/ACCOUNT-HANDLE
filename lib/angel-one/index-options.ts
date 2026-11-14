import {searchIndexOptions,searchIndexOptionExpiries} from "@/lib/angel-one/trading-core.mjs";
const MASTER_URL="https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
let cache:{rows:unknown[];loadedAt:number}|null=null;
async function master(){if(cache&&Date.now()-cache.loadedAt<6*60*60*1000)return cache.rows;const response=await fetch(MASTER_URL,{cache:"no-store",signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error("Angel One instrument master is unavailable.");const data=await response.json();if(!Array.isArray(data)||data.length<1000)throw new Error("Angel One instrument master response is invalid.");cache={rows:data,loadedAt:Date.now()};return cache.rows;}
export async function indexOptionExpiries(underlying:string){return searchIndexOptionExpiries(await master(),underlying);}
export async function searchVerifiedIndexOptions(underlying:string,expiry:string,optionType:string){return searchIndexOptions(await master(),{underlying,expiry,optionType});}
export async function findVerifiedIndexOption(exchange:string,symbol:string,token:string){const rows=await master();const {findVerifiedIndexOption}=await import("@/lib/angel-one/trading-core.mjs");return findVerifiedIndexOption(rows,exchange,symbol,token);}
export function optionInstrumentMasterLoadedAt(){return cache?.loadedAt??null;}
