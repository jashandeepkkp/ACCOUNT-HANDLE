"use client";
import { useEffect, useRef, useState } from "react";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Props = { symbol: string; exchange: "NSE" | "BSE"; theme: "light" | "dark" };
const ranges = [{ label: "1m", value: "ONE_MINUTE" }, { label: "5m", value: "FIVE_MINUTE" }, { label: "15m", value: "FIFTEEN_MINUTE" }, { label: "30m", value: "THIRTY_MINUTE" }, { label: "1h", value: "ONE_HOUR" }, { label: "1D", value: "ONE_DAY" }];

export default function AngelOneMasterChart({ symbol, exchange, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [interval, setInterval] = useState("FIVE_MINUTE");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");
  useEffect(() => {
    let active = true;
    let busy = false;
    const load = async () => {
      if (!symbol.trim()) { setCandles([]); setError("Enter a symbol in the Master trade ticket."); return; }
      if (busy) return;
      busy = true;
      setLoading(true);
      try {
        const response = await fetch("/api/broker/master-chart?symbol=" + encodeURIComponent(symbol.trim()) + "&exchange=" + exchange + "&interval=" + interval, { cache: "no-store", credentials: "same-origin" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Angel One chart is unavailable.");
        if (active) { setCandles(data.candles || []); setFetchedAt(data.fetchedAt || ""); setError(""); }
      } catch (e) {
        if (active) { setCandles([]); setError(e instanceof Error ? e.message : "Angel One chart request failed."); }
      } finally { busy = false; if (active) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [symbol, exchange, interval]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const width = rect.width, height = rect.height;
      const dark = theme === "dark";
      ctx.fillStyle = dark ? "#111827" : "#ffffff"; ctx.fillRect(0, 0, width, height);
      const left = 12, right = 68, top = 16, bottom = 26;
      const plotW = width - left - right, plotH = height - top - bottom;
      const min = Math.min(...candles.map(c => c.low)), max = Math.max(...candles.map(c => c.high));
      const pad = Math.max((max - min) * 0.08, max * 0.001);
      const lo = min - pad, hi = max + pad;
      const y = (price: number) => top + (hi - price) / (hi - lo) * plotH;
      ctx.font = "11px Arial"; ctx.textAlign = "right"; ctx.fillStyle = dark ? "#9ca3af" : "#667085";
      for (let i = 0; i <= 4; i++) {
        const price = hi - (hi - lo) * i / 4, py = top + plotH * i / 4;
        ctx.strokeStyle = dark ? "#293548" : "#e8edf3"; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(width - right, py); ctx.stroke();
        ctx.fillText(price.toFixed(2), width - 8, py + 4);
      }
      const step = plotW / candles.length, bodyW = Math.max(2, Math.min(12, step * 0.65));
      candles.forEach((c, i) => {
        const x = left + step * (i + 0.5), up = c.close >= c.open, color = up ? "#16a36a" : "#e05260";
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();
        const y1 = y(Math.max(c.open, c.close)), y2 = y(Math.min(c.open, c.close));
        ctx.fillRect(x - bodyW / 2, y1, bodyW, Math.max(1, y2 - y1));
      });
      const last = candles[candles.length - 1];
      ctx.fillStyle = last.close >= last.open ? "#16a36a" : "#e05260";
      ctx.fillRect(width - right + 3, y(last.close) - 9, right - 10, 18);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.fillText(last.close.toFixed(2), width - right / 2, y(last.close) + 4);
      ctx.fillStyle = dark ? "#9ca3af" : "#667085"; ctx.textAlign = "left";
      ctx.fillText(new Date(candles[0].time * 1000).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), left, height - 7);
      ctx.textAlign = "right";
      ctx.fillText(new Date(last.time * 1000).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), width - right, height - 7);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [candles, theme]);

  return <div className={"angel-master-chart " + (theme === "dark" ? "is-dark" : "")}>
    <div className="angel-chart-toolbar">
      <div><b>{symbol || "Select symbol"}</b><span>{exchange} · ANGEL ONE MASTER DATA</span></div>
      <div className="angel-chart-intervals">{ranges.map(item => <button key={item.value} className={interval === item.value ? "active" : ""} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div>
    </div>
    {error ? <div className="angel-chart-message" role="status">{error}</div> : !candles.length && loading ? <div className="angel-chart-message">Loading verified Angel One Master candles…</div> : !candles.length ? <div className="angel-chart-message">No candle data returned by Angel One.</div> : <canvas ref={canvasRef} className="angel-chart-canvas" aria-label={symbol + " Angel One Master candlestick chart"} />}
    <div className="angel-chart-footer"><span>{loading ? "Updating…" : "Angel One historical OHLC"}</span><span>{candles.length} candles · refreshes every 60 seconds</span><span>{fetchedAt ? "Fetched " + new Date(fetchedAt).toLocaleTimeString("en-IN") : "—"}</span></div>
  </div>;
}
