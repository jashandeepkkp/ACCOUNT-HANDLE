import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCashEquity, searchCashEquities, validateInstrumentSelection, normalizeIndexOption, searchIndexOptionExpiries, searchIndexOptions, findVerifiedIndexOption, validateOptionLotQuantity,
  brokerProductType, evaluateRisk, isEligibleFollower, isOpenBrokerOrderStatus,
  normalizePlaceOrderResponse, makeCopyOrderTag, evaluateCopyMarketPrice
} from "../lib/angel-one/trading-core.mjs";

const master = [
  { token: "3045", symbol: "SBIN-EQ", name: "SBIN", expiry: "", strike: "-1.000000", lotsize: "1", instrumenttype: "", exch_seg: "nse_cm", tick_size: "5.000000" },
  { token: "2885", symbol: "RELIANCE-EQ", name: "RELIANCE", expiry: "", strike: "-1.000000", lotsize: "1", instrumenttype: "", exch_seg: "nse_cm", tick_size: "5.000000" },
  { token: "999", symbol: "NIFTY26NOVFUT", name: "NIFTY", expiry: "26NOV2026", strike: "-1", lotsize: "75", instrumenttype: "FUTIDX", exch_seg: "nse_fo", tick_size: "5" },
  { token: "888", symbol: "SBIN-EQ", name: "SBIN", expiry: "", strike: "-1", lotsize: "1", instrumenttype: "", exch_seg: "nfo" },
  { token: "5001", symbol: "RELIANCE-A", name: "RELIANCE", expiry: "", strike: "-1", lotsize: "1", instrumenttype: "", exch_seg: "bse_cm" }
];

test("instrument master accepts cash equity and rejects derivative segments", () => {
  assert.equal(normalizeCashEquity(master[0]).token, "3045");
  assert.equal(normalizeCashEquity(master[2]), null);
  assert.equal(normalizeCashEquity(master[3]), null);
  assert.equal(normalizeCashEquity(master[4]).exchange, "BSE");
});

test("instrument search is exchange-scoped and returns canonical broker symbol/token", () => {
  const found = searchCashEquities(master, "sbin", "NSE");
  assert.equal(found.length, 1);
  assert.equal(found[0].symbol, "SBIN-EQ");
  assert.equal(found[0].token, "3045");
  assert.equal(searchCashEquities(master, "reliance", "BSE")[0].token, "5001");
});

test("order selection must exactly match master symbol, exchange and token", () => {
  const instrument = normalizeCashEquity(master[0]);
  assert.equal(validateInstrumentSelection({ exchange: "NSE", tradingSymbol: "SBIN-EQ", symbolToken: "3045" }, instrument), true);
  assert.equal(validateInstrumentSelection({ exchange: "NSE", tradingSymbol: "SBIN-EQ", symbolToken: "1" }, instrument), false);
});

test("supported cash and options products map to SmartAPI values", () => {
  assert.equal(brokerProductType("MIS"), "INTRADAY");
  assert.equal(brokerProductType("CNC"), "DELIVERY");
  assert.equal(brokerProductType("NRML"), "CARRYFORWARD");
});

test("risk limits fail closed for unknown P&L and reject breached limits", () => {
  const base = { quantity: 2, price: 100, maxQuantity: 10, maxNotional: 1000, dailyOrderCount: 1, maxDailyOrders: 5, dailyPnl: 0, maxDailyLoss: 500 };
  assert.equal(evaluateRisk(base).allowed, true);
  assert.equal(evaluateRisk({ ...base, quantity: 11 }).reason, "QUANTITY_LIMIT");
  assert.equal(evaluateRisk({ ...base, price: 1000 }).reason, "NOTIONAL_LIMIT");
  assert.equal(evaluateRisk({ ...base, dailyPnl: -500 }).reason, "DAILY_LOSS_LIMIT_OR_UNKNOWN_PNL");
  assert.equal(evaluateRisk({ ...base, dailyPnl: NaN }).allowed, false);
});

test("followers require explicit copy authorization and an unexpired encrypted session", () => {
  const follower = { id: "follower-1", role: "FOLLOWER", authorized_for_copy: true, session_expires_at: new Date(Date.now() + 60000).toISOString(), encrypted_session: "sealed" };
  assert.equal(isEligibleFollower(follower), true);
  assert.equal(isEligibleFollower({ ...follower, authorized_for_copy: false }), false);
  assert.equal(isEligibleFollower({ ...follower, session_expires_at: new Date(Date.now() - 1).toISOString() }), false);
});

test("open broker order states include pending and partial-execution states but not terminal states", () => {
  assert.equal(isOpenBrokerOrderStatus("open pending"), true);
  assert.equal(isOpenBrokerOrderStatus("trigger pending"), true);
  assert.equal(isOpenBrokerOrderStatus("partially filled"), true);
  assert.equal(isOpenBrokerOrderStatus("complete"), false);
  assert.equal(isOpenBrokerOrderStatus("rejected"), false);
});

test("SmartAPI place-order response must include broker order id and is not assumed filled", () => {
  assert.deepEqual(normalizePlaceOrderResponse({ status: true, data: { orderid: "123", uniqueorderid: "uuid" } }), { orderId: "123", uniqueOrderId: "uuid", accepted: true, finalStatusKnown: false });
  assert.throws(() => normalizePlaceOrderResponse({ status: true, data: {} }));
});

test("copy order tags are stable and bounded to Angel One's tag limit", () => {
  const a = makeCopyOrderTag("key-123", "follower-a");
  assert.equal(a, makeCopyOrderTag("key-123", "follower-a"));
  assert.notEqual(a, makeCopyOrderTag("key-123", "follower-b"));
  assert.ok(a.length < 20);
});


test("market copy fails closed without valid fill price, LTP and slippage limit", () => {
  assert.equal(evaluateCopyMarketPrice({ masterAveragePrice: 100, followerLtp: 100.2, maxDeviationBps: 50 }).allowed, true);
  assert.equal(evaluateCopyMarketPrice({ masterAveragePrice: 100, followerLtp: 101, maxDeviationBps: 50 }).reason, "MARKET_COPY_PRICE_DEVIATION");
  assert.equal(evaluateCopyMarketPrice({ masterAveragePrice: 0, followerLtp: 100, maxDeviationBps: 50 }).allowed, false);
  assert.equal(evaluateCopyMarketPrice({ masterAveragePrice: 100, followerLtp: 100, maxDeviationBps: 0 }).allowed, false);
});


const indexOptions = [
  { token:"99901", symbol:"NIFTY26NOV2025000CE", name:"NIFTY", expiry:"26NOV2026", strike:"2500000.000000", lotsize:"75", instrumenttype:"OPTIDX", exch_seg:"nse_fo", tick_size:"5.000000" },
  { token:"99902", symbol:"NIFTY26NOV2025000PE", name:"NIFTY", expiry:"26NOV2026", strike:"2500000.000000", lotsize:"75", instrumenttype:"OPTIDX", exch_seg:"nse_fo", tick_size:"5.000000" },
  { token:"99903", symbol:"SENSEX26NOV2025000CE", name:"SENSEX", expiry:"26NOV2026", strike:"2500000.000000", lotsize:"20", instrumenttype:"OPTIDX", exch_seg:"bse_fo", tick_size:"5.000000" },
  { token:"99904", symbol:"RELIANCE26NOV1400CE", name:"RELIANCE", expiry:"26NOV2026", strike:"140000.000000", lotsize:"250", instrumenttype:"OPTSTK", exch_seg:"nse_fo", tick_size:"5.000000" }
];

test("index option master accepts only supported index OPTIDX CE/PE contracts", () => {
  const nifty = normalizeIndexOption(indexOptions[0]);
  assert.equal(nifty.exchange, "NFO");
  assert.equal(nifty.underlying, "NIFTY");
  assert.equal(nifty.strike, 25000);
  assert.equal(nifty.optionType, "CE");
  assert.equal(nifty.lotSize, 75);
  assert.equal(normalizeIndexOption(indexOptions[3]), null);
});

test("index option search filters by underlying expiry and CE/PE", () => {
  assert.deepEqual(searchIndexOptionExpiries(indexOptions, "NIFTY"), ["26NOV2026"]);
  assert.equal(searchIndexOptions(indexOptions, { underlying:"NIFTY", expiry:"26NOV2026", optionType:"PE" })[0].token, "99902");
  assert.equal(searchIndexOptions(indexOptions, { underlying:"SENSEX", expiry:"26NOV2026", optionType:"CE" })[0].exchange, "BFO");
  assert.throws(() => findVerifiedIndexOption(indexOptions, "NFO", "NIFTY26NOV2025000CE", "99999"));
});

test("index option quantities must be whole contract lots", () => {
  assert.equal(validateOptionLotQuantity(75, 75), true);
  assert.equal(validateOptionLotQuantity(150, 75), true);
  assert.equal(validateOptionLotQuantity(74, 75), false);
  assert.equal(validateOptionLotQuantity(0, 75), false);
});

