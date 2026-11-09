"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Position = { id:number; symbol:string; exchange:string; product:string; qty:number; avg:number; ltp:number; pnl:number; account:string; state:"OPEN"|"CLOSED" };
const seed:Position[] = [
 {id:1,symbol:"NIFTY 26 NOV 24800 CE",exchange:"NFO",product:"NRML",qty:50,avg:182.4,ltp:194.2,pnl:590,account:"Alpha",state:"OPEN"},
 {id:2,symbol:"BANKNIFTY 26 NOV 56200 PE",exchange:"NFO",product:"MIS",qty:-30,avg:318.6,ltp:342.1,pnl:-705,account:"Alpha",state:"OPEN"},
 {id:3,symbol:"RELIANCE",exchange:"NSE",product:"CNC",qty:12,avg:1462.5,ltp:1481.2,pnl:224.4,account:"Beta",state:"OPEN"},
 {id:4,symbol:"HDFCBANK",exchange:"NSE",product:"MIS",qty:-40,avg:1768.2,ltp:1759.8,pnl:336,account:"Beta",state:"OPEN"},
 {id:5,symbol:"FINNIFTY 26 NOV 25800 CE",exchange:"NFO",product:"NRML",qty:0,avg:112.3,ltp:106.5,pnl:-290,account:"Gamma",state:"CLOSED"},
 {id:6,symbol:"SBIN",exchange:"NSE",product:"CNC",qty:25,avg:842.1,ltp:850.4,pnl:207.5,account:"Gamma",state:"OPEN"},
 {id:7,symbol:"SENSEX 27 NOV 82000 PE",exchange:"BFO",product:"MIS",qty:-20,avg:224.8,ltp:217.6,pnl:144,account:"Alpha",state:"OPEN"},
 {id:8,symbol:"TCS",exchange:"NSE",product:"CNC",qty:0,avg:3920,ltp:3884,pnl:-360,account:"Beta",state:"CLOSED"}
];
const money=(n:number)=>new Intl.NumberFormat("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
function TradingViewChart({symbol,theme}:{symbol:string;theme:"light"|"dark"}){
 const containerRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{
  const container=containerRef.current;
  if(!container)return;
  container.innerHTML="";
  const widget=document.createElement("div");
  widget.className="tradingview-widget-container__widget";
  widget.style.height="calc(100% - 28px)";
  widget.style.width="100%";
  const attribution=document.createElement("div");
  attribution.className="tradingview-attribution";
  const link=document.createElement("a");
  link.href="https://www.tradingview.com/";
  link.target="_blank";
  link.rel="noopener nofollow";
  link.textContent="Charts provided by TradingView";
  attribution.appendChild(link);
  const script=document.createElement("script");
  script.type="text/javascript";
  script.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async=true;
  script.text=JSON.stringify({
   autosize:true,symbol,interval:"15",timezone:"Asia/Kolkata",theme,style:"1",locale:"en",
   allow_symbol_change:true,calendar:false,details:true,hide_side_toolbar:false,
   hide_top_toolbar:false,hide_legend:false,hide_volume:false,hotlist:false,
   save_image:true,withdateranges:true,studies:[],support_host:"https://www.tradingview.com"
  });
  container.appendChild(widget);
  container.appendChild(attribution);
  container.appendChild(script);
  return ()=>{container.innerHTML="";};
 },[symbol,theme]);
 return <div className="tradingview-live-chart" ref={containerRef} aria-label={`TradingView market chart for ${symbol}`}/>;
}

export default function Home(){
 const [positions,setPositions]=useState(seed),[tab,setTab]=useState("Positions"),[scope,setScope]=useState("All Accounts"),[view,setView]=useState("ALL"),[direction,setDirection]=useState("NET"),[product,setProduct]=useState("ALL"),[search,setSearch]=useState(""),[selected,setSelected]=useState<number[]>([]),[dark,setDark]=useState(false),[notice,setNotice]=useState(""),[sort,setSort]=useState<"symbol"|"pnl"|"qty">("symbol");
 const [chartRange,setChartRange]=useState("1D"),[historyView,setHistoryView]=useState<"OPEN"|"CLOSED">("OPEN");
 const [tradeAccount,setTradeAccount]=useState("MASTER"),[tradeSymbol,setTradeSymbol]=useState("RELIANCE"),[tradeExchange,setTradeExchange]=useState("NSE"),[tradeSide,setTradeSide]=useState("BUY"),[tradeType,setTradeType]=useState("MARKET"),[tradeProduct,setTradeProduct]=useState("MIS"),[tradeQty,setTradeQty]=useState(1),[tradePrice,setTradePrice]=useState(""),[tradeMessage,setTradeMessage]=useState(""); 
 const submitPaperOrder=()=>{if(!tradeSymbol.trim()||tradeQty<1){setTradeMessage("Enter a valid symbol and quantity.");return;}if(tradeType==="LIMIT"&&Number(tradePrice)<=0){setTradeMessage("Enter a valid limit price.");return;}const entry=tradeType==="LIMIT"?Number(tradePrice):0;setPositions(ps=>[{id:Math.max(0,...ps.map(p=>p.id))+1,symbol:tradeSymbol.trim().toUpperCase(),exchange:tradeExchange,product:tradeProduct,qty:tradeSide==="BUY"?tradeQty:-tradeQty,avg:entry,ltp:entry,pnl:0,account:tradeAccount==="MASTER"?"Master":tradeAccount,state:"OPEN"},...ps]);setHistoryView("OPEN");setTradeMessage("Paper order recorded in OPEN positions for "+tradeAccount+" · "+tradeSide+" "+tradeQty+" "+tradeSymbol.toUpperCase()+". No broker order was sent.");};
 const closeHistoryPosition=(id:number)=>{setPositions(ps=>ps.map(p=>p.id===id?{...p,qty:0,state:"CLOSED"}:p));setTradeMessage("Position marked CLOSED in paper history. No broker order was sent.");};
 const tradeHistory=positions.filter(p=>p.state===historyView);
 const visible=useMemo(()=>positions.filter(p=>(scope==="All Accounts"||p.account===scope)&&(view==="ALL"||p.state===view)&&(product==="ALL"||p.product===product)&&(direction==="NET"||(direction==="LONG"&&p.qty>0)||(direction==="SHORT"&&p.qty<0))&&p.symbol.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="pnl"?b.pnl-a.pnl:sort==="qty"?Math.abs(b.qty)-Math.abs(a.qty):a.symbol.localeCompare(b.symbol)),[positions,scope,view,product,direction,search,sort]);
 const total=visible.length, open=visible.filter(p=>p.state==="OPEN").length, closed=total-open, pnl=visible.reduce((s,p)=>s+p.pnl,0), long=visible.filter(p=>p.qty>0&&p.state==="OPEN").length, short=visible.filter(p=>p.qty<0&&p.state==="OPEN").length, netQty=visible.reduce((s,p)=>s+p.qty,0);
 const toggle=(id:number)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 const exportCsv=()=>{const rows=[["Symbol","Exchange","Product","Net Qty","Avg Price","LTP","P&L","Account","Status"],...visible.map(p=>[p.symbol,p.exchange,p.product,p.qty,p.avg,p.ltp,p.pnl,p.account,p.state])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="copypilot-positions.csv";a.click();URL.revokeObjectURL(a.href);setNotice("CSV export generated.");};
 const squareOff=()=>{if(!selected.length){setNotice("Select at least one position first.");return;}setPositions(ps=>ps.map(p=>selected.includes(p.id)?{...p,qty:0,state:"CLOSED"}:p));setSelected([]);setNotice("Selected positions marked closed in this paper demo.");};
 const reset=()=>{setPositions(seed);setSelected([]);setNotice("Demo positions refreshed.");};
 const candles=[{o:182,h:188,l:179,c:186,v:42},{o:186,h:191,l:183,c:184,v:35},{o:184,h:187,l:176,c:178,v:51},{o:178,h:183,l:174,c:181,v:29},{o:181,h:190,l:180,c:188,v:48},{o:188,h:194,l:185,c:192,v:58},{o:192,h:195,l:187,c:189,v:31},{o:189,h:193,l:182,c:184,v:39},{o:184,h:188,l:179,c:186,v:27},{o:186,h:197,l:184,c:195,v:63},{o:195,h:201,l:192,c:199,v:55},{o:199,h:203,l:193,c:195,v:37},{o:195,h:198,l:188,c:190,v:44},{o:190,h:196,l:187,c:194,v:32},{o:194,h:205,l:192,c:202,v:68},{o:202,h:208,l:198,c:205,v:59},{o:205,h:211,l:201,c:209,v:47},{o:209,h:214,l:204,c:212,v:72}];
 const chartMax=220,chartMin=170,chartY=(price:number)=>20+(chartMax-price)/(chartMax-chartMin)*158;
 return <main className={dark?"app dark":"app"}>
  <header className="appbar"><div className="identity"><div className="logo">E<span>◈</span></div><div><b>EAGLE TRADES</b><small>TRADING TERMINAL <i>PRO</i></small></div></div><div className="top-actions"><label className="account-picker"><span>ACCOUNT SCOPE</span><select value={scope} onChange={e=>setScope(e.target.value)}><option>All Accounts</option><option>Alpha</option><option>Beta</option><option>Gamma</option></select></label><button className="icon-btn" title="Refresh demo" onClick={reset}>↻</button><button className="icon-btn" title="Toggle theme" onClick={()=>setDark(v=>!v)}>{dark?"☀":"☾"}</button><button className="icon-btn" title="Settings" onClick={()=>setNotice("Dashboard preferences are local demo settings.")}>⚙</button></div></header>
  <nav className="tabs">{["Summary","Positions","Orders","Holdings","MarketWatch","Trade","Notifications"].map((t,i)=><button key={t} className={tab===t?"tab active":"tab"} onClick={()=>setTab(t)}><span>{["▦","◉","▤","▣","◫","↗","♧"][i]}</span>{t}{t==="Notifications"&&<em>2</em>}</button>)}</nav>
  <div className="page-title"><div><div className="eyebrow">PORTFOLIO MONITOR / LIVE VIEW</div><h1>{tab}</h1><p>Monitor positions across linked trading accounts.</p></div><div className="market-state"><span className="pulse"></span> PAPER MARKET <b>SIMULATED</b><small>Updated just now</small></div></div>
  {tab==="Trade" ? <><div className="trade-workspace"><section className="card trade-chart">
   <div className="chart-heading"><div><div className="eyebrow">LIVE MARKET CHART / TRADINGVIEW</div><h2>XAUUSD <span>GOLD / US DOLLAR · OANDA</span></h2><p>Interactive market chart · data availability and delays depend on exchange permissions</p></div><span className="paper-pill">MARKET DATA ONLY</span></div>
   <TradingViewChart symbol="OANDA:XAUUSD" theme={dark?"dark":"light"}/>
   <div className="chart-disclaimer">TradingView chart data is for market viewing only. It does not place orders or guarantee real-time exchange quotes. Confirm live prices with your broker before trading.</div>
  </section><section className="card manual-trade">
   <div className="trade-head"><div><div className="eyebrow">ORDER ENTRY / MASTER ACCOUNT</div><h2>Manual Trading</h2><p>Place a simulated order from the master account. Live broker execution is not connected.</p></div><span className="paper-pill">PAPER MODE</span></div>
   <div className="trade-grid">
    <label className="trade-field">Trading account<select value={tradeAccount} onChange={e=>setTradeAccount(e.target.value)}><option value="MASTER">Master Account · Angel One (Demo)</option><option value="Alpha">Follower Alpha · Demo</option><option value="Beta">Follower Beta · Demo</option><option value="Gamma">Follower Gamma · Demo</option></select></label>
    <label className="trade-field">Exchange<select value={tradeExchange} onChange={e=>setTradeExchange(e.target.value)}><option>NSE</option><option>BSE</option><option>NFO</option><option>BFO</option><option>MCX</option></select></label>
    <label className="trade-field wide">Instrument / Trading symbol<input value={tradeSymbol} onChange={e=>setTradeSymbol(e.target.value.toUpperCase())} placeholder="Enter trading symbol"/></label>
    <label className="trade-field">Transaction<select value={tradeSide} onChange={e=>setTradeSide(e.target.value)}><option>BUY</option><option>SELL</option></select></label>
    <label className="trade-field">Order type<select value={tradeType} onChange={e=>setTradeType(e.target.value)}><option>MARKET</option><option>LIMIT</option></select></label>
    <label className="trade-field">Product<select value={tradeProduct} onChange={e=>setTradeProduct(e.target.value)}><option>MIS</option><option>CNC</option><option>NRML</option></select></label>
    <label className="trade-field">Quantity<input type="number" min="1" value={tradeQty} onChange={e=>setTradeQty(Math.max(1,Number(e.target.value)))}/></label>
    {tradeType==="LIMIT"&&<label className="trade-field">Limit price (₹)<input type="number" min="0.05" step="0.05" value={tradePrice} onChange={e=>setTradePrice(e.target.value)} placeholder="0.00"/></label>}
   </div>
   <div className="trade-summary"><div><small>ACCOUNT</small><b>{tradeAccount==="MASTER"?"MASTER · ANGEL ONE DEMO":tradeAccount.toUpperCase()}</b></div><div><small>ORDER</small><b>{tradeSide} · {tradeType} · {tradeProduct}</b></div><div><small>QUANTITY</small><b>{tradeQty}</b></div>{tradeType==="LIMIT"&&<div><small>LIMIT PRICE</small><b>₹{tradePrice||"—"}</b></div>}</div>
   <div className="trade-actions"><button className={tradeSide==="BUY"?"place-buy":"place-sell"} onClick={submitPaperOrder}> {tradeSide==="BUY"?"BUY":"SELL"} · PLACE PAPER ORDER</button><button className="action-btn" onClick={()=>{setTradeSymbol("");setTradePrice("");setTradeMessage("");}}>Clear form</button></div>
   {tradeMessage&&<div className="notice trade-notice" role="status">{tradeMessage}</div>}
   <div className="trade-warning">ⓘ Demo ticket only. It does not submit orders to Angel One, update live positions, or validate funds / margin. Connect and test a broker API in a separately secured backend before enabling real trading.</div>
  </section></div><section className="card trade-history"><div className="history-head"><div><div className="eyebrow">MASTER ACCOUNT / PAPER LEDGER</div><h2>Positions History</h2><p>Orders recorded from Manual Trading. Closing a position only updates this demo ledger.</p></div><div className="history-tabs"><button className={historyView==="OPEN"?"active":""} onClick={()=>setHistoryView("OPEN")}>OPEN <b>{positions.filter(p=>p.state==="OPEN").length}</b></button><button className={historyView==="CLOSED"?"active":""} onClick={()=>setHistoryView("CLOSED")}>CLOSED <b>{positions.filter(p=>p.state==="CLOSED").length}</b></button></div></div><div className="table-scroll"><table className="history-table"><thead><tr><th>SYMBOL</th><th>EXCHANGE</th><th>PRODUCT</th><th>NET QTY</th><th>AVG / ENTRY</th><th>LTP</th><th>P&L</th><th>ACCOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{tradeHistory.map(p=><tr key={p.id}><td className="symbol">{p.symbol}</td><td>{p.exchange}</td><td>{p.product}</td><td>{p.qty}</td><td>{p.avg? "₹"+money(p.avg):"—"}</td><td>{p.ltp? "₹"+money(p.ltp):"—"}</td><td className={p.pnl>=0?"positive":"negative"}>₹{money(p.pnl)}</td><td>{p.account}</td><td><span className={p.state==="OPEN"?"state-open":"state-closed"}>{p.state}</span></td><td>{p.state==="OPEN"?<button className="history-close" onClick={()=>closeHistoryPosition(p.id)}>Close position</button>:<span className="muted-dash">Closed</span>}</td></tr>)}</tbody></table>{!tradeHistory.length&&<div className="empty">No {historyView.toLowerCase()} positions yet. Submit a paper order to create an open position.</div>}</div><div className="history-foot">Paper ledger only · No live broker execution or real-time P&amp;L calculation</div></section></> : <><section className="card summary">
   <div className="summary-head"><div className="section-kicker">◈ PORTFOLIO SUMMARY <span className="exchange">PAPER DATA</span></div><button className="action-btn" onClick={reset}>Reset demo</button></div>
   <div className="summary-metrics">
    <div className="metric"><small>REALIZED / DEMO P&L</small><strong className={pnl>=0?"positive":"negative"}>₹{money(pnl)}</strong><span>Current filtered view</span></div>
    <div className="metric"><small>OPEN POSITIONS</small><strong>{open}</strong><span>Across selected accounts</span></div>
    <div className="metric"><small>CLOSED POSITIONS</small><strong>{closed}</strong><span>Demo history</span></div>
    <div className="metric"><small>NET QUANTITY</small><strong>{netQty}</strong><span>Long {long} · Short {short}</span></div>
   </div>
   <div className="exposure"><div className="direction"><div className="donut"><div/></div><div className="legend"><b>POSITION DIRECTION</b><span><i className="green"/>Long positions <strong>{long}</strong></span><span><i className="red"/>Short positions <strong>{short}</strong></span><span><i className="grey"/>Closed <strong>{closed}</strong></span></div></div><div className="net-exposure"><div><b>VISIBLE POSITIONS</b><strong>{total}</strong></div><div className="bar"><i style={{width:total?((long/total)*100)+"%":"0%"}}/></div><div className="bar-label"><span>LONG {long}</span><b>SHORT {short}</b></div></div></div>
   <div className="summary-foot"><span>Account scope: {scope}</span><span>Simulated values · not live broker data</span></div>
  </section>
  <section className="card positions">
   <div className="toolbar"><div className="segmented">{["ALL","OPEN","CLOSED"].map(v=><button key={v} className={view===v?"chosen":""} onClick={()=>setView(v)}>{v}</button>)}</div><select className="filter-select" value={direction} onChange={e=>setDirection(e.target.value)}><option value="NET">All directions</option><option value="LONG">Long</option><option value="SHORT">Short</option></select><select className="filter-select" value={product} onChange={e=>setProduct(e.target.value)}><option value="ALL">All products</option><option>MIS</option><option>CNC</option><option>NRML</option></select><button className="action-btn" onClick={()=>setSelected(visible.map(p=>p.id))}>Select all</button><button className="action-btn" onClick={()=>setSelected([])}>Deselect</button><button className="square-btn" onClick={squareOff}>Square off selected</button><button className="action-btn" onClick={exportCsv}>Export CSV</button></div>
   <div className="subtoolbar"><div><span className="section-kicker">POSITIONS <span className="exchange">{visible.length} ROWS</span></span></div><label className="search">⌕ <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search symbol..."/></label></div>
   {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
   <div className="table-scroll"><table className="positions-table"><thead><tr><th><input type="checkbox" checked={visible.length>0&&visible.every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked?visible.map(p=>p.id):[])}/></th><th>SYMBOL</th><th>EXCHANGE</th><th>PRODUCT</th><th onClick={()=>setSort("qty")}>NET QTY ↕</th><th>AVG PRICE</th><th>LTP</th><th onClick={()=>setSort("pnl")}>P&L ↕</th><th>ACCOUNT</th><th>STATUS</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={selected.includes(p.id)?"selected":""}><td><input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggle(p.id)}/></td><td className="symbol">{p.symbol}</td><td><span className="exchange">{p.exchange}</span></td><td>{p.product}</td><td>{p.qty}</td><td>₹{money(p.avg)}</td><td className="ltp">₹{money(p.ltp)}</td><td className={p.pnl>=0?"positive":"negative"}>₹{money(p.pnl)}</td><td>{p.account}</td><td><span className={p.state==="OPEN"?"state-open":"state-closed"}>{p.state}</span></td></tr>)}</tbody></table>{!visible.length&&<div className="empty">No positions match these filters.</div>}</div>
   <div className="table-foot"><span>Showing <b>{visible.length}</b> positions</span><span>{selected.length} selected · Demo actions only</span></div>
  </section></>}  <footer><span>EAGLE TRADES PRO <b>v1.0</b> · Multi-account workspace</span><span>⚠ Simulation interface · No broker orders are transmitted</span></footer>
 </main>;
}