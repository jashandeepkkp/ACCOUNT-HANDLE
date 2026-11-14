export function normalizeExchangeSegment(value) {
  const segment = String(value ?? "").trim().toLowerCase();
  if (segment === "nse_cm" || segment === "nse") return "NSE";
  if (segment === "bse_cm" || segment === "bse") return "BSE";
  return null;
}

export function normalizeCashEquity(row) {
  if (!row || typeof row !== "object") return null;
  const exchange = normalizeExchangeSegment(row.exch_seg ?? row.exchange);
  const symbol = String(row.symbol ?? row.tradingsymbol ?? "").trim().toUpperCase();
  const token = String(row.token ?? row.symboltoken ?? "").trim();
  const name = String(row.name ?? symbol).trim();
  const instrumentType = String(row.instrumenttype ?? row.instrument_type ?? "").trim();
  const expiry = String(row.expiry ?? row.expirydate ?? "").trim();
  const strike = Number(row.strike ?? -1);
  if (!exchange || !symbol || !/^\d{1,20}$/.test(token)) return null;
  if ((exchange === "NSE" && !symbol.endsWith("-EQ")) || instrumentType !== "" || expiry !== "" || (Number.isFinite(strike) && strike > 0)) return null;
  return { exchange, symbol, token, name, tickSize: Number(row.tick_size ?? 0) / 100, lotSize: Math.max(1, Number(row.lotsize ?? row.lot_size ?? 1) || 1) };
}

export function searchCashEquities(rows, query, exchange) {
  const q = String(query ?? "").trim().toUpperCase();
  if (q.length < 2) return [];
  const allowed = exchange === "NSE" || exchange === "BSE" ? exchange : null;
  return rows.map(normalizeCashEquity).filter(Boolean)
    .filter(item => (!allowed || item.exchange === allowed) && (item.symbol.includes(q) || item.name.toUpperCase().includes(q)))
    .sort((a, b) => Number(a.symbol !== q && a.symbol !== q + "-EQ") - Number(b.symbol !== q && b.symbol !== q + "-EQ") || a.symbol.localeCompare(b.symbol))
    .slice(0, 15);
}

export function validateInstrumentSelection(selection, instrument) {
  return Boolean(instrument && selection &&
    selection.exchange === instrument.exchange &&
    String(selection.tradingSymbol ?? "").toUpperCase() === instrument.symbol &&
    String(selection.symbolToken ?? "") === instrument.token);
}


const INDEX_OPTION_UNDERLYINGS = Object.freeze({ NIFTY:"NFO", BANKNIFTY:"NFO", FINNIFTY:"NFO", SENSEX:"BFO" });

export function normalizeIndexOption(row) {
  if (!row || typeof row !== "object") return null;
  const segment=String(row.exch_seg??row.exchange??"").trim().toLowerCase();
  const exchange=segment==="nse_fo"||segment==="nfo"?"NFO":segment==="bse_fo"||segment==="bfo"?"BFO":null;
  const symbol=String(row.symbol??row.tradingsymbol??"").trim().toUpperCase();
  const token=String(row.token??row.symboltoken??"").trim();
  const name=String(row.name??"").trim().toUpperCase();
  const instrumentType=String(row.instrumenttype??row.instrument_type??"").trim().toUpperCase();
  const expiry=String(row.expiry??row.expirydate??"").trim().toUpperCase();
  const rawStrike=Number(row.strike),lotSize=Number(row.lotsize??row.lot_size),tickSize=Number(row.tick_size)/100;
  if(!exchange||!symbol||!/^\d{1,20}$/.test(token)||!/^\d{1,2}[A-Z]{3}\d{4}$/.test(expiry))return null;
  const optionType=symbol.endsWith("CE")?"CE":symbol.endsWith("PE")?"PE":"";
  if(instrumentType!=="OPTIDX"||!optionType||!Number.isFinite(rawStrike)||rawStrike<=0)return null;
  const underlying=Object.keys(INDEX_OPTION_UNDERLYINGS).find(key=>symbol.startsWith(key)&&(name===key||name===key+" 50"||name===key+" BANK"||name===key+" FIN SERVICE"));
  if(!underlying||INDEX_OPTION_UNDERLYINGS[underlying]!==exchange)return null;
  const strike=rawStrike/100;
  if(!Number.isSafeInteger(lotSize)||lotSize<1||!Number.isFinite(tickSize)||tickSize<=0)return null;
  return {exchange,symbol,token,name:underlying,underlying,expiry,strike,optionType,lotSize,tickSize};
}
export function searchIndexOptionExpiries(rows,underlying) {
  const key=String(underlying??"").trim().toUpperCase();
  if(!Object.hasOwn(INDEX_OPTION_UNDERLYINGS,key))return [];
  const month=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const date=value=>{const m=value.match(/^(\d{1,2})([A-Z]{3})(\d{4})$/);return m?Date.UTC(Number(m[3]),month.indexOf(m[2]),Number(m[1])):0;};
  return [...new Set(rows.map(normalizeIndexOption).filter(x=>x&&x.underlying===key).map(x=>x.expiry))].sort((a,b)=>date(a)-date(b));
}
export function searchIndexOptions(rows,{underlying,expiry,optionType}={}) {
  const key=String(underlying??"").trim().toUpperCase(),exp=String(expiry??"").trim().toUpperCase(),type=String(optionType??"").trim().toUpperCase();
  if(!Object.hasOwn(INDEX_OPTION_UNDERLYINGS,key)||!/^\d{1,2}[A-Z]{3}\d{4}$/.test(exp)||!["CE","PE"].includes(type))return [];
  return rows.map(normalizeIndexOption).filter(Boolean).filter(x=>x.underlying===key&&x.expiry===exp&&x.optionType===type).sort((a,b)=>a.strike-b.strike).slice(0,500);
}
export function findVerifiedIndexOption(rows,exchange,symbol,token) {
  const found=rows.map(normalizeIndexOption).find(x=>x&&x.exchange===String(exchange).toUpperCase()&&x.symbol===String(symbol).toUpperCase()&&x.token===String(token));
  if(!found)throw new Error("Option contract/token does not match Angel One's current index-options instrument master.");
  return found;
}
export function brokerProductType(product) {
  if(product==="MIS")return "INTRADAY";
  if(product==="CNC")return "DELIVERY";
  if(product==="NRML")return "CARRYFORWARD";
  return null;
}
export function validateOptionLotQuantity(quantity,lotSize) {
  return Number.isSafeInteger(quantity)&&quantity>0&&Number.isSafeInteger(lotSize)&&lotSize>0&&quantity%lotSize===0;
}

export function evaluateRisk({ quantity, price, maxQuantity, maxNotional, dailyOrderCount, maxDailyOrders, dailyPnl, maxDailyLoss }) {
  const notional = quantity * price;
  if (!Number.isSafeInteger(quantity) || quantity < 1) return { allowed: false, reason: "INVALID_QUANTITY" };
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(notional)) return { allowed: false, reason: "INVALID_NOTIONAL" };
  if (!Number.isSafeInteger(maxQuantity) || maxQuantity < 1 || quantity > maxQuantity) return { allowed: false, reason: "QUANTITY_LIMIT" };
  if (!Number.isSafeInteger(maxNotional) || maxNotional < 1 || notional > maxNotional) return { allowed: false, reason: "NOTIONAL_LIMIT" };
  if (!Number.isSafeInteger(maxDailyOrders) || maxDailyOrders < 1 || dailyOrderCount >= maxDailyOrders) return { allowed: false, reason: "DAILY_ORDER_LIMIT" };
  if (!Number.isFinite(dailyPnl) || !Number.isFinite(maxDailyLoss) || maxDailyLoss < 1 || dailyPnl <= -maxDailyLoss) return { allowed: false, reason: "DAILY_LOSS_LIMIT_OR_UNKNOWN_PNL" };
  return { allowed: true, notional };
}

export function isEligibleFollower(account, now = Date.now()) {
  if (!account || account.role !== "FOLLOWER" || !account.id || account.id === "master") return false;
  if (account.authorized_for_copy !== true) return false;
  const expiresAt = new Date(account.session_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now && Boolean(account.encrypted_session);
}

export function isOpenBrokerOrderStatus(value) {
  const status = String(value ?? "").trim().toLowerCase().replaceAll("_", " ");
  return ["open", "pending", "open pending", "trigger pending", "after market order req received", "modify pending", "cancel pending", "partially filled", "partially executed"].includes(status);
}

export function normalizePlaceOrderResponse(payload) {
  if (!payload || payload.status !== true || !payload.data || typeof payload.data !== "object") {
    throw new Error(String(payload?.message ?? "Angel One rejected the order request."));
  }
  const orderId = String(payload.data.orderid ?? payload.data.orderId ?? "");
  const uniqueOrderId = String(payload.data.uniqueorderid ?? payload.data.uniqueOrderId ?? "");
  if (!orderId) throw new Error("Angel One response did not include an order ID.");
  return { orderId, uniqueOrderId, accepted: true, finalStatusKnown: false };
}

export function makeCopyOrderTag(idempotencyKey, accountId) {
  const input = String(idempotencyKey) + ":" + String(accountId);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return "ET" + (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}


/**
 * Fail-closed price guard for delayed MARKET-order copying.
 * Compare the follower's current LTP with the Master's actual average fill price.
 */
export function evaluateCopyMarketPrice({ masterAveragePrice, followerLtp, maxDeviationBps }) {
  if (!Number.isFinite(masterAveragePrice) || masterAveragePrice <= 0 ||
      !Number.isFinite(followerLtp) || followerLtp <= 0 ||
      !Number.isSafeInteger(maxDeviationBps) || maxDeviationBps < 1 || maxDeviationBps > 5000) {
    return { allowed: false, reason: "INVALID_MARKET_COPY_PRICE_GUARD" };
  }
  const deviationBps = Math.abs(followerLtp - masterAveragePrice) / masterAveragePrice * 10000;
  return deviationBps <= maxDeviationBps
    ? { allowed: true, deviationBps }
    : { allowed: false, reason: "MARKET_COPY_PRICE_DEVIATION", deviationBps };
}
