"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BarChart3, CheckCircle2, FileText, Loader2, Search, ShieldCheck, Sparkles, Upload, Users, Wallet, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

type Tx = { date: string; time: string; description: string; debit: number; credit: number; party: string; direction: "sent" | "received" | "other"; ref?: string };
type Person = { name: string; count: number; total: number; received: number; sent: number };

const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const internal = /OWealth (Withdrawal|Balance)|Auto-save to OWealth|VAT on Transfer Fee|Stamp Duty|OWealth Interest Earned/i;

function parseParty(desc: string, direction: "sent" | "received") {
  const normalized = clean(desc);
  const marker = direction === "sent" ? /Transfer to (.+?)(?: \| |$)/i : /Transfer from (.+?)(?: \| |$)/i;
  const m = normalized.match(marker);
  if (m) return clean(m[1]);
  return normalized;
}

function parseTransactions(text: string): Tx[] {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const result: Tx[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(\d{2} \w{3} \d{4}) (\d{2}:\d{2}:\d{2}) \d{2} \w{3} \d{4} (.+)$/);
    if (!head) continue;
    const date = head[1];
    const time = head[2];
    let description = head[3];
    let j = i + 1;
    const parts: string[] = [];
    while (j < lines.length && !/^\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2}/.test(lines[j]) && !/^Credit Count$|^Debit Count$|^Trans\. Time/.test(lines[j])) {
      parts.push(lines[j]);
      j++;
      if (parts.length > 8) break;
    }
    const chunk = [description, ...parts].join(" ");
    const amounts = [...chunk.matchAll(/(?:^|\s)(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})(?=\s|$)/g)].map(m => Number(m[1].replace(/,/g, "")));
    const debitCredit = chunk.match(/(Transfer to|Airtime|Auto-save|VAT on Transfer Fee|Stamp Duty|OWealth Withdrawal).*?(\d[\d,]*\.\d{2}|\d[\d,]*)\s+--/i);
    const hasCredit = /--\s+\d[\d,]*(?:\.\d{2})?\s+(?:\d[\d,]*(?:\.\d{2})?)/.test(chunk);
    let debit = 0, credit = 0;
    if (/Transfer from/i.test(chunk)) credit = amounts[0] ?? 0;
    else if (/Transfer to|Airtime|Auto-save to|VAT on Transfer Fee|Stamp Duty|OWealth Withdrawal/i.test(chunk)) debit = amounts[0] ?? 0;
    else if (hasCredit && amounts.length) credit = amounts[0];
    if (debitCredit && /Transfer to/i.test(chunk)) debit = Number(debitCredit[2].replace(/,/g, ""));
    if (/Transfer from/i.test(chunk)) credit = Number((chunk.match(/--\s*(\d[\d,]*(?:\.\d{2})?)/)?.[1] ?? "0").replace(/,/g, ""));
    if (debit <= 0 && credit <= 0) continue;
    const direction: Tx["direction"] = /Transfer to/i.test(chunk) ? "sent" : /Transfer from/i.test(chunk) ? "received" : "other";
    if (direction === "other" || internal.test(chunk)) continue;
    const party = parseParty(chunk, direction);
    if (!party) continue;
    result.push({ date, time, description: clean(chunk), debit, credit, party, direction });
    i = j - 1;
  }
  return result;
}

async function extractPdf(file: File) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return text;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const people = useMemo<Person[]>(() => {
    const map = new Map<string, Person>();
    txs.forEach(t => {
      const key = t.party.toLowerCase();
      const current = map.get(key) ?? { name: t.party, count: 0, total: 0, received: 0, sent: 0 };
      current.count++;
      current.total += t.direction === "received" ? t.credit : t.debit;
      if (t.direction === "received") current.received += t.credit; else current.sent += t.debit;
      map.set(key, current);
    });
    return [...map.values()];
  }, [txs]);

  const senders = [...people].filter(p => p.received > 0).sort((a,b) => b.received - a.received);
  const recipients = [...people].filter(p => p.sent > 0).sort((a,b) => b.sent - a.sent);
  const filtered = txs.filter(t => `${t.party} ${t.description}`.toLowerCase().includes(query.toLowerCase()));
  const totalIn = txs.reduce((s,t) => s + t.credit, 0);
  const totalOut = txs.reduce((s,t) => s + t.debit, 0);
  const unique = people.length;

  async function handleFile(file?: File) {
    if (!file) return;
    setError(""); setLoading(true); setFileName(file.name); setTxs([]);
    try {
      if (file.type !== "application/pdf") throw new Error("Please upload a PDF statement.");
      const text = await extractPdf(file);
      const parsed = parseTransactions(text);
      if (!parsed.length) throw new Error("I couldn't find transfer transactions in this PDF. This MVP currently supports text-based OPay statements.");
      setTxs(parsed);
    } catch (e: any) { setError(e?.message || "Could not analyze this PDF."); setFileName(""); }
    finally { setLoading(false); }
  }

  return <main>
    <nav className="nav"><div className="brand"><div className="brandMark">S</div><span>Statemently</span></div><div className="navBadge"><ShieldCheck size={15}/> Your PDF stays in your browser</div></nav>

    {!txs.length ? <section className="hero">
      <div className="eyebrow"><Sparkles size={15}/> OPay statement intelligence</div>
      <h1>Understand where your<br/><em>money is going.</em></h1>
      <p className="heroCopy">Drop your OPay statement here. Statemently turns a dense transaction history into a clear picture of who you send money to, who sends you money, and how often you interact.</p>
      <button className="uploadCard" onClick={() => inputRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); handleFile(e.dataTransfer.files?.[0])}}>
        <div className="uploadIcon">{loading ? <Loader2 className="spin"/> : <Upload/>}</div>
        <div><strong>{loading ? "Analyzing your statement…" : "Upload OPay statement"}</strong><span>{loading ? "Reading transactions locally" : "PDF only · up to 20 MB"}</span></div><div className="uploadArrow">→</div>
      </button>
      <input ref={inputRef} hidden type="file" accept="application/pdf" onChange={e=>handleFile(e.target.files?.[0])}/>
      {error && <div className="error">{error}</div>}
      <div className="featureRow"><span><CheckCircle2/> Top senders & recipients</span><span><CheckCircle2/> Transaction frequency</span><span><CheckCircle2/> No upload to a server</span></div>
    </section> : <section className="dashboard">
      <div className="dashTop"><div><div className="eyebrow">Analysis complete</div><h2>Your money flow</h2><p>{fileName} · {txs.length} transfer{txs.length===1?"":"s"} found</p></div><button className="secondary" onClick={()=>{setTxs([]);setFileName("")}}><X size={16}/> Analyze another</button></div>
      <div className="stats"><Stat icon={<ArrowDownLeft/>} label="Money received" value={money(totalIn)} tone="green"/><Stat icon={<ArrowUpRight/>} label="Money sent" value={money(totalOut)} tone="red"/><Stat icon={<Users/>} label="People / accounts" value={String(unique)} tone="purple"/><Stat icon={<BarChart3/>} label="Transfers" value={String(txs.length)} tone="blue"/></div>
      <div className="grid2"><Ranking title="Top senders" subtitle="Who sent you the most" data={senders} amount="received"/><Ranking title="Top recipients" subtitle="Who you sent the most to" data={recipients} amount="sent"/></div>
      <div className="panel"><div className="panelHead"><div><h3>Transaction history</h3><p>Normalized transfer activity · internal OWealth entries excluded</p></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a person…"/></div></div><div className="table">{filtered.slice(0,50).map((t,i)=><div className="row" key={`${t.date}-${t.time}-${i}`}><div className={`dir ${t.direction}`}>{t.direction==="received"?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</div><div className="party"><strong>{t.party}</strong><span>{t.date} · {t.time}</span></div><div className="desc">{t.description}</div><strong className={t.direction}>{t.direction==="received"?"+":"−"}{money(t.direction==="received"?t.credit:t.debit)}</strong></div>)}{!filtered.length&&<div className="empty">No matching transactions.</div>}</div></div>
      <div className="privacy"><ShieldCheck/><div><strong>Privacy by design</strong><span>The PDF is parsed locally in your browser in this MVP. Nothing is sent to a backend.</span></div></div>
    </section>}
    <footer><span>Statemently · OPay MVP</span><span><FileText size={14}/> Built for clear financial insights</span></footer>
  </main>
}

function Stat({icon,label,value,tone}:{icon:React.ReactNode;label:string;value:string;tone:string}){return <div className="stat"><div className={`statIcon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong></div>}
function Ranking({title,subtitle,data,amount}:{title:string;subtitle:string;data:Person[];amount:"sent"|"received"}){const top=data.slice(0,5);const max=top[0]?.[amount]??1;return <div className="panel rank"><div className="panelHead"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="mini">Top 5</span></div>{top.map((p,i)=><div className="rankRow" key={p.name}><div className="rankNo">0{i+1}</div><div className="rankMain"><div className="rankName"><strong>{p.name}</strong><span>{p.count} transfer{p.count===1?"":"s"}</span></div><div className="bar"><i style={{width:`${Math.max(7,(p[amount]/max)*100)}%`}}/></div></div><strong>{money(p[amount])}</strong></div>)}{!top.length&&<div className="empty">No data yet.</div>}</div>}
