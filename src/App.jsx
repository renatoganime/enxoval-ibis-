import { useState, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { Package, ArrowUpRight, ArrowDownLeft, BarChart3, Clock, Settings, FileDown, Trash2, AlertTriangle, RotateCcw, Filter, RefreshCw, Users, CheckCircle, Printer, Plus } from "lucide-react";
import { loadData, saveData, subscribeData } from "./firebase.js";

// ── DEFAULT ITEMS ───────────────────────────────────────────────────────
const DEF_ITENS = [
  { id: "toalha", nome: "Toalha" },
  { id: "piso", nome: "Piso" },
  { id: "lencol_casal", nome: "Lençol Casal" },
  { id: "duvet_casal", nome: "Duvet Casal" },
  { id: "fronha", nome: "Fronha" },
  { id: "edredom_casal", nome: "Edredom Casal" },
  { id: "cobertor_casal", nome: "Cobertor Casal" },
  { id: "protetor_colchao_casal", nome: "Protetor de Colchão Casal" },
  { id: "protetor_travesseiro", nome: "Protetor de Travesseiro" },
  { id: "lencol_solteiro", nome: "Lençol Solteiro" },
  { id: "edredom_solteiro", nome: "Edredom Solteiro" },
  { id: "cobertor_solteiro", nome: "Cobertor Solteiro" },
  { id: "protetor_colchao_solteiro", nome: "Protetor de Colchão Solteiro" },
];
const DEF_EXTERNA = [...DEF_ITENS];
const DEF_INTERNA = [...DEF_ITENS];

const hoje = () => new Date().toISOString().split("T")[0];
const fmtData = (d) => { if (!d) return ""; const p = d.split("-"); return `${p[2]}/${p[1]}/${p[0]}`; };
const fmtReal = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

// ── STYLES ──────────────────────────────────────────────────────────────
const C = { bg: "#0f1117", card: "#1a1d27", border: "#2a2d3a", accent: "#4f8cff", accentSoft: "#4f8cff18", green: "#34d399", greenSoft: "#34d39918", amber: "#fbbf24", amberSoft: "#fbbf2418", red: "#f87171", redSoft: "#f8717118", text: "#e2e8f0", textMuted: "#64748b", textDim: "#475569", purple: "#a78bfa" };

// ── DIALOG CONTEXT ──────────────────────────────────────────────────────
const DialogCtx = createContext();
function useDialog() { return useContext(DialogCtx); }
function DialogProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const showToast = (msg, color) => setToast({ msg, color: color || C.green });
  const showError = (msg) => setToast({ msg, color: C.red });
  const askConfirm = (msg, onYes) => setModal({ msg, onYes });
  return (
    <DialogCtx.Provider value={{ showToast, showError, askConfirm }}>
      {children}
      {toast && <ToastUI msg={toast.msg} color={toast.color} onDone={() => setToast(null)} />}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, maxWidth: 380, width: "100%", animation: "fadeIn .15s ease-out" }}>
            <p style={{ color: C.text, fontSize: 14, lineHeight: 1.5, margin: "0 0 16px", whiteSpace: "pre-line" }}>{modal.msg}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
              <button onClick={() => { modal.onYes(); setModal(null); }} style={{ flex: 1, padding: "10px", background: C.red, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}
function ToastUI({ msg, color, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: color, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif", zIndex: 3000, display: "flex", alignItems: "center", gap: 8, boxShadow: `0 4px 20px ${color}50`, animation: "fadeIn .2s ease-out", maxWidth: "90vw" }}><CheckCircle size={16} /> {msg}</div>;
}

// ── MAIN ────────────────────────────────────────────────────────────────
export default function App() { return <DialogProvider><AppInner /></DialogProvider>; }

function AppInner() {
  const { showToast } = useDialog();
  const [tab, setTab] = useState("saida");
  const [saidas, setSaidas] = useState([]);
  const [entradas, setEntradas] = useState([]);
  const [rejeitos, setRejeitos] = useState([]);
  const [precos, setPrecos] = useState({});
  const [itensExt, setItensExt] = useState(DEF_EXTERNA);
  const [itensInt, setItensInt] = useState(DEF_INTERNA);
  const [ready, setReady] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [storageOk, setStorageOk] = useState(true);

  const allItens = useMemo(() => {
    const map = new Map();
    [...itensExt, ...itensInt].forEach(i => { if (!map.has(i.id)) map.set(i.id, i); });
    return [...map.values()];
  }, [itensExt, itensInt]);
  const getItemNome = useCallback((id) => allItens.find(i => i.id === id)?.nome || id, [allItens]);

  const loadAll = useCallback(async () => {
    const [s, e, r, p, ie, ii] = await Promise.all([
      loadData("saidas", []), loadData("entradas", []), loadData("rejeitos", []),
      loadData("precos", {}), loadData("itensExt", null), loadData("itensInt", null),
    ]);
    setSaidas(s || []); setEntradas(e || []); setRejeitos(r || []); setPrecos(p || {});
    if (!ie) { setItensExt(DEF_EXTERNA); await saveData("itensExt", DEF_EXTERNA); } else { setItensExt(ie); }
    if (!ii) { setItensInt(DEF_INTERNA); await saveData("itensInt", DEF_INTERNA); } else { setItensInt(ii); }
    setLastSync(new Date()); setStorageOk(true); return true;
  }, []);

  useEffect(() => { loadAll().then(() => setReady(true)).catch(() => { setReady(true); setStorageOk(false); }); }, [loadAll]);

  // Real-time sync from Firebase — other users' changes appear automatically
  useEffect(() => {
    const unsubs = [
      subscribeData("saidas", (v) => { if (Array.isArray(v)) setSaidas(v); }),
      subscribeData("entradas", (v) => { if (Array.isArray(v)) setEntradas(v); }),
      subscribeData("rejeitos", (v) => { if (Array.isArray(v)) setRejeitos(v); }),
      subscribeData("precos", (v) => { if (v && typeof v === "object") setPrecos(v); }),
      subscribeData("itensExt", (v) => { if (Array.isArray(v)) setItensExt(v); }),
      subscribeData("itensInt", (v) => { if (Array.isArray(v)) setItensInt(v); }),
    ];
    return () => unsubs.forEach(u => { if (typeof u === "function") u(); });
  }, []);

  const manualSync = async () => { setSyncing(true); await loadAll(); setSyncing(false); showToast("Sincronizado!"); };

  const persist = async (key, val, setter) => {
    setter(val);
    const ok = await saveData(key, val);
    setLastSync(new Date());
    setStorageOk(ok);
  };

  if (!ready) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, fontFamily: "'IBM Plex Sans', sans-serif", gap: 16 }}>
      <Package size={40} color={C.accent} style={{ animation: "pulse 2s infinite" }} />
      <p style={{ color: C.textMuted, fontSize: 13 }}>Conectando ao servidor...</p>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );

  const ctx = { saidas, entradas, rejeitos, precos, itensExt, itensInt, allItens, getItemNome,
    persistSaidas: v => persist("saidas", v, setSaidas), persistEntradas: v => persist("entradas", v, setEntradas),
    persistRejeitos: v => persist("rejeitos", v, setRejeitos), persistPrecos: v => persist("precos", v, setPrecos),
    persistItensExt: v => persist("itensExt", v, setItensExt), persistItensInt: v => persist("itensInt", v, setItensInt),
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{margin:0}input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}.fade-in{animation:fadeIn .3s ease-out}`}</style>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 10px 40px" }}>
        <Header lastSync={lastSync} syncing={syncing} onSync={manualSync} storageOk={storageOk} totalRegistros={saidas.length + entradas.length} />
        <Nav tab={tab} setTab={setTab} rejeitosCount={rejeitos.length} />
        <div className="fade-in" key={tab}>
          {tab === "saida" && <FormSaida {...ctx} />}
          {tab === "entrada" && <FormEntrada {...ctx} />}
          {tab === "rejeitos" && <PainelRejeitos {...ctx} />}
          {tab === "dashboard" && <Dashboard {...ctx} />}
          {tab === "historico" && <Historico {...ctx} />}
          {tab === "config" && <Configuracao {...ctx} />}
        </div>
      </div>
    </div>
  );
}

// ── HEADER ───────────────────────────────────────────────────────────────
function Header({ lastSync, syncing, onSync, storageOk, totalRegistros }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: `linear-gradient(135deg, ${C.accent}, #7c3aed)`, borderRadius: 10, padding: 8, display: "flex" }}><Package size={20} color="#fff" /></div>
        <div><h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: -0.5 }}>ENXOVAL</h1><p style={{ margin: 0, fontSize: 9, color: C.textMuted, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>Ibis Budget Guarulhos</p></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.card, borderRadius: 8, padding: "4px 8px", border: `1px solid ${storageOk ? C.border : C.red + "50"}` }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: storageOk ? C.green : C.red }} />
          <span style={{ fontSize: 9, color: C.textMuted, fontWeight: 500 }}>{storageOk ? (totalRegistros > 0 ? `${totalRegistros} reg` : "Online") : "Offline"}</span>
        </div>
        <button onClick={onSync} style={{ display: "flex", alignItems: "center", gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer", color: C.textMuted, fontSize: 10, fontFamily: "inherit", fontWeight: 500 }}><RefreshCw size={12} style={syncing ? { animation: "spin 1s linear infinite" } : {}} />{lastSync ? lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "..."}</button>
      </div>
    </div>
  );
}

// ── NAV ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "saida", label: "Saída", icon: ArrowUpRight, color: C.accent },
  { id: "entrada", label: "Entrada", icon: ArrowDownLeft, color: C.green },
  { id: "rejeitos", label: "Rejeitos", icon: RotateCcw, color: C.amber },
  { id: "dashboard", label: "Painel", icon: BarChart3, color: C.purple },
  { id: "historico", label: "Histórico", icon: Clock, color: "#818cf8" },
  { id: "config", label: "Config", icon: Settings, color: C.textMuted },
];
function Nav({ tab, setTab, rejeitosCount }) {
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 14, overflowX: "auto", background: C.card, borderRadius: 12, padding: 3, border: `1px solid ${C.border}` }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: "1 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "9px 6px", borderRadius: 9, border: "none", cursor: "pointer", position: "relative", background: tab === t.id ? t.color + "20" : "transparent", color: tab === t.id ? t.color : C.textDim, fontWeight: tab === t.id ? 700 : 500, fontSize: 10, fontFamily: "inherit", transition: "all .2s", borderBottom: tab === t.id ? `2px solid ${t.color}` : "2px solid transparent" }}>
          <t.icon size={15} />{t.label}
          {t.id === "rejeitos" && rejeitosCount > 0 && <span style={{ position: "absolute", top: 2, right: "calc(50% - 18px)", background: C.red, color: "#fff", fontSize: 8, fontWeight: 700, borderRadius: 10, padding: "1px 5px", minWidth: 14, textAlign: "center" }}>{rejeitosCount}</span>}
        </button>
      ))}
    </div>
  );
}

// ── UI COMPONENTS ────────────────────────────────────────────────────────
function Card({ children, style }) { return <div style={{ background: C.card, borderRadius: 14, padding: 18, border: `1px solid ${C.border}`, ...style }}>{children}</div>; }
function Label({ children }) { return <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 4, display: "block" }}>{children}</label>; }
function Input(props) { return <input {...props} style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", outline: "none", color: C.text, boxSizing: "border-box", ...(props.style || {}) }} />; }
function Btn({ children, color = C.accent, onClick, style }) { return <button onClick={onClick} style={{ width: "100%", padding: "11px 18px", background: color, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: .3, ...style }}>{children}</button>; }
function Badge({ children, color }) { return <span style={{ display: "inline-block", background: color + "20", color, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, textTransform: "uppercase", letterSpacing: .5, border: `1px solid ${color}30` }}>{children}</span>; }
function LavanderiaToggle({ value, onChange }) { return <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>{[["externa", "🏭 Externa", C.accent], ["interna", "🏠 Interna", C.green]].map(([l, label, color]) => <button key={l} onClick={() => onChange(l)} style={{ flex: 1, padding: "10px", borderRadius: 9, border: `2px solid ${value === l ? color : C.border}`, background: value === l ? color + "15" : "transparent", color: value === l ? color : C.textDim, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: .5 }}>{label}</button>)}</div>; }
function IconBtn({ icon: Icon, color, onClick, title }) { return <button onClick={onClick} title={title} style={{ background: color + "18", border: `1px solid ${color}30`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", color }}><Icon size={14} /></button>; }

// ── PRINT MODAL ─────────────────────────────────────────────────────────
function PrintModal({ rolo, onClose, getItemNome }) {
  const total = rolo.itens.reduce((a, b) => a + b.qtd, 0);
  const { showToast } = useDialog();
  const copiar = () => {
    const t = [`ROLO #${rolo.rolo} — ${rolo.lavanderia === 'externa' ? 'Externa' : 'Interna'}`, `Data: ${fmtData(rolo.data)} · Resp: ${rolo.responsavel}`, '', ...rolo.itens.map(i => `${getItemNome(i.id)}: ${i.qtd}`), '', `TOTAL: ${total}`, '', '_______________', 'Governança', '', '_______________', 'Motorista'].join('\n');
    try { navigator.clipboard.writeText(t).then(() => showToast("Copiado!")); } catch { try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast("Copiado!"); } catch { showToast("Erro ao copiar", C.red); } }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 10px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.5)", animation: "fadeIn .2s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Rolo #{rolo.rolo}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={copiar} style={{ padding: "6px 14px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>📋 Copiar</button>
            <button onClick={onClose} style={{ padding: "6px 12px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "24px 20px", color: "#1a1a1a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "3px solid #1a1a1a", paddingBottom: 12, marginBottom: 16 }}>
            <div><div style={{ fontSize: 18, fontWeight: 700 }}>Controle de Enxoval</div><div style={{ fontSize: 11, color: "#666" }}>Ibis Budget Guarulhos</div><div style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: rolo.lavanderia === 'externa' ? '#e8f0fe' : '#e6f7ef', color: rolo.lavanderia === 'externa' ? '#1a56db' : '#0d7c3d', textTransform: "uppercase" }}>{rolo.lavanderia === 'externa' ? '🏭 Externa' : '🏠 Interna'}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 28, fontWeight: 700 }}>#{rolo.rolo}</div><div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Nº Rolo</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>{[["Data", fmtData(rolo.data)], ["Responsável", rolo.responsavel], ["Total", total]].map(([l, v]) => <div key={l} style={{ background: "#f5f5f5", borderRadius: 6, padding: "8px 10px" }}><div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 700 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{v}</div></div>)}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead><tr><th style={{ background: "#1a1a1a", color: "#fff", padding: "8px 12px", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>Item</th><th style={{ background: "#1a1a1a", color: "#fff", padding: "8px 12px", textAlign: "right", fontSize: 10, textTransform: "uppercase" }}>Qtd</th></tr></thead>
            <tbody>{rolo.itens.map(i => <tr key={i.id} style={{ borderBottom: "1px solid #e0e0e0" }}><td style={{ padding: "8px 12px", fontSize: 13 }}>{getItemNome(i.id)}</td><td style={{ padding: "8px 12px", textAlign: "right", fontSize: 15, fontWeight: 700 }}>{i.qtd}</td></tr>)}<tr style={{ background: "#f5f5f5" }}><td style={{ padding: "8px 12px", fontWeight: 700 }}>TOTAL</td><td style={{ padding: "8px 12px", textAlign: "right", fontSize: 17, fontWeight: 700 }}>{total}</td></tr></tbody>
          </table>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 40 }}><div><div style={{ borderTop: "1px solid #999", paddingTop: 6, textAlign: "center", fontSize: 10, color: "#666" }}>Governança</div></div><div><div style={{ borderTop: "1px solid #999", paddingTop: 6, textAlign: "center", fontSize: 10, color: "#666" }}>Motorista / Lavanderia</div></div></div>
        </div>
      </div>
    </div>
  );
}

// ── FORM SAÍDA ──────────────────────────────────────────────────────────
function FormSaida({ saidas, entradas, rejeitos, itensExt, itensInt, persistSaidas, persistEntradas, persistRejeitos, getItemNome }) {
  const { showToast, showError, askConfirm } = useDialog();
  const [lav, setLav] = useState("externa"); const [data, setData] = useState(hoje()); const [resp, setResp] = useState(""); const [rolo, setRolo] = useState(""); const [qtds, setQtds] = useState({}); const [printRolo, setPrintRolo] = useState(null);
  const itens = lav === "externa" ? itensExt : itensInt;
  const registrar = () => {
    if (!resp.trim() || !rolo.trim()) return showError("Preencha responsável e nº do rolo.");
    const its = Object.entries(qtds).filter(([_, v]) => Number(v) > 0).map(([id, qtd]) => ({ id, qtd: Number(qtd) }));
    if (!its.length) return showError("Informe ao menos um item.");
    if (saidas.some(s => s.rolo === rolo.trim() && s.lavanderia === lav)) return showError("Rolo já registrado.");
    const novo = { id: Date.now(), lavanderia: lav, data, responsavel: resp.trim(), rolo: rolo.trim(), itens: its };
    persistSaidas([...saidas, novo]); setResp(""); setRolo(""); setQtds({}); showToast("Saída registrada!"); setPrintRolo(novo);
  };
  const excluir = (s) => { const temE = entradas.some(e => e.rolo === s.rolo && e.lavanderia === s.lavanderia); askConfirm(`Excluir rolo #${s.rolo}?${temE ? "\nEntrada e rejeitos vinculados serão excluídos." : ""}`, () => { persistSaidas(saidas.filter(x => x.id !== s.id)); if (temE) { persistEntradas(entradas.filter(e => !(e.rolo === s.rolo && e.lavanderia === s.lavanderia))); persistRejeitos(rejeitos.filter(r => !(r.roloOrigem === s.rolo && r.lavanderia === s.lavanderia))); } showToast("Excluído!"); }); };
  const recentes = saidas.filter(s => s.lavanderia === lav).slice(-5).reverse();
  return (
    <Card>
      {printRolo && <PrintModal rolo={printRolo} onClose={() => setPrintRolo(null)} getItemNome={getItemNome} />}
      <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.text }}>Registrar Saída</h2>
      <LavanderiaToggle value={lav} onChange={l => { setLav(l); setQtds({}); }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}><div><Label>Data</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div><div><Label>Responsável</Label><Input value={resp} onChange={e => setResp(e.target.value)} placeholder="Nome" /></div><div><Label>Nº Rolo</Label><Input value={rolo} onChange={e => setRolo(e.target.value)} placeholder="001" /></div></div>
      <Label>Quantidades</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 14 }}>{itens.map(item => <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, borderRadius: 8, padding: "7px 10px" }}><span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: C.text }}>{item.nome}</span><input type="number" min="0" inputMode="numeric" value={qtds[item.id] || ""} onChange={e => setQtds({ ...qtds, [item.id]: e.target.value })} placeholder="0" style={{ width: 64, background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "6px", fontSize: 14, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, outline: "none", color: C.text }} /></div>)}</div>
      <Btn onClick={registrar}>Registrar Saída</Btn>
      {recentes.length > 0 && <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}><p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 8 }}>Últimos · {lav}</p><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{recentes.map(s => { const temE = entradas.some(e => e.rolo === s.rolo && e.lavanderia === s.lavanderia); return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>#{s.rolo}</span><span style={{ fontSize: 10, color: C.textMuted }}>{fmtData(s.data)} · {s.responsavel}</span>{temE ? <Badge color={C.green}>OK</Badge> : <Badge color={C.amber}>Pendente</Badge>}</div><p style={{ margin: 0, fontSize: 10, color: C.textDim }}>{s.itens.map(i => `${getItemNome(i.id)}: ${i.qtd}`).join(" · ")}</p></div><div style={{ display: "flex", gap: 4 }}><IconBtn icon={Printer} color={C.accent} onClick={() => setPrintRolo(s)} title="Ver" /><IconBtn icon={Trash2} color={C.red} onClick={() => excluir(s)} title="Excluir" /></div></div>; })}</div></div>}
    </Card>
  );
}

// ── FORM ENTRADA ────────────────────────────────────────────────────────
function FormEntrada({ saidas, entradas, rejeitos, itensExt, itensInt, precos, persistEntradas, persistRejeitos, getItemNome }) {
  const { showToast, showError, askConfirm } = useDialog();
  const [lav, setLav] = useState("externa"); const [data, setData] = useState(hoje()); const [resp, setResp] = useState(""); const [rolo, setRolo] = useState(""); const [qtds, setQtds] = useState({}); const [rej, setRej] = useState({});
  const rolosE = entradas.map(e => e.rolo + "|" + e.lavanderia); const pendentes = saidas.filter(s => s.lavanderia === lav && !rolosE.includes(s.rolo + "|" + s.lavanderia)); const saidaRef = saidas.find(s => s.rolo === rolo && s.lavanderia === lav); const itens = lav === "externa" ? itensExt : itensInt;
  const registrar = () => {
    if (!resp.trim() || !rolo.trim()) return showError("Preencha responsável e nº do rolo."); if (!saidaRef) return showError("Rolo não encontrado."); if (rolosE.includes(rolo + "|" + lav)) return showError("Entrada já registrada.");
    const ir = Object.entries(qtds).filter(([_, v]) => Number(v) > 0).map(([id, qtd]) => ({ id, qtd: Number(qtd) })); const ij = Object.entries(rej).filter(([_, v]) => Number(v) > 0).map(([id, qtd]) => ({ id, qtd: Number(qtd) }));
    persistEntradas([...entradas, { id: Date.now(), lavanderia: lav, data, responsavel: resp.trim(), rolo: rolo.trim(), itens: ir, rejeitadosQtd: ij }]);
    if (ij.length > 0) persistRejeitos([...rejeitos, ...ij.map(r => ({ id: Date.now() + Math.random(), itemId: r.id, qtd: r.qtd, lavanderia: lav, roloOrigem: rolo.trim(), dataRejeicao: data, responsavelRejeicao: resp.trim() }))]);
    setResp(""); setRolo(""); setQtds({}); setRej({}); showToast("Entrada registrada!");
  };
  const excluirE = (e) => { askConfirm(`Excluir entrada #${e.rolo}?`, () => { persistEntradas(entradas.filter(x => x.id !== e.id)); persistRejeitos(rejeitos.filter(r => !(r.roloOrigem === e.rolo && r.lavanderia === e.lavanderia))); showToast("Excluído!"); }); };
  const recentes = entradas.filter(e => e.lavanderia === lav && !e.isReentrada).slice(-5).reverse();
  return (
    <Card>
      <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.text }}>Registrar Entrada</h2>
      <LavanderiaToggle value={lav} onChange={l => { setLav(l); setQtds({}); setRej({}); setRolo(""); }} />
      {pendentes.length > 0 && <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}30`, borderRadius: 10, padding: 10, marginBottom: 14 }}><p style={{ fontSize: 10, fontWeight: 700, color: C.amber, margin: "0 0 6px", textTransform: "uppercase" }}>Rolos pendentes</p><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{pendentes.map(s => <button key={s.id} onClick={() => setRolo(s.rolo)} style={{ background: rolo === s.rolo ? C.amber : C.card, color: rolo === s.rolo ? "#000" : C.amber, border: `1px solid ${C.amber}40`, borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>#{s.rolo} · {fmtData(s.data)}</button>)}</div></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}><div><Label>Data</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div><div><Label>Responsável</Label><Input value={resp} onChange={e => setResp(e.target.value)} placeholder="Nome" /></div><div><Label>Nº Rolo</Label><Input value={rolo} onChange={e => setRolo(e.target.value)} placeholder="001" /></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}><span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", padding: "0 4px" }}>Item</span><span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", textAlign: "center" }}>Env</span><span style={{ fontSize: 9, fontWeight: 700, color: C.green, textTransform: "uppercase", textAlign: "center" }}>Aceito</span><span style={{ fontSize: 9, fontWeight: 700, color: C.red, textTransform: "uppercase", textAlign: "center" }}>Rej</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>{itens.map(item => { const qe = saidaRef?.itens.find(i => i.id === item.id)?.qtd || 0; return <div key={item.id} style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1fr 1fr", gap: 4, alignItems: "center", background: C.bg, borderRadius: 8, padding: "5px 8px" }}><span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{item.nome}</span><span style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: C.accent, fontFamily: "'IBM Plex Mono', monospace" }}>{qe}</span><input type="number" min="0" inputMode="numeric" value={qtds[item.id] || ""} onChange={e => setQtds({ ...qtds, [item.id]: e.target.value })} style={{ width: "100%", background: C.greenSoft, border: `1px solid ${C.green}30`, borderRadius: 6, padding: "5px", fontSize: 13, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, outline: "none", color: C.green }} placeholder="0" /><input type="number" min="0" inputMode="numeric" value={rej[item.id] || ""} onChange={e => setRej({ ...rej, [item.id]: e.target.value })} style={{ width: "100%", background: C.redSoft, border: `1px solid ${C.red}30`, borderRadius: 6, padding: "5px", fontSize: 13, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, outline: "none", color: C.red }} placeholder="0" /></div>; })}</div>
      <Btn onClick={registrar} color={C.green}>Registrar Entrada</Btn>
      {recentes.length > 0 && <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}><p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 8 }}>Últimas · {lav}</p><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{recentes.map(e => { const fat = e.itens.reduce((s, i) => s + i.qtd * (precos[i.id] || 0), 0); return <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>#{e.rolo}</span><span style={{ fontSize: 10, color: C.textMuted }}>{fmtData(e.data)}</span><span style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal(fat)}</span></div></div><IconBtn icon={Trash2} color={C.red} onClick={() => excluirE(e)} title="Excluir" /></div>; })}</div></div>}
    </Card>
  );
}

// ── PAINEL REJEITOS ─────────────────────────────────────────────────────
function PainelRejeitos({ rejeitos, entradas, precos, persistRejeitos, persistEntradas, getItemNome }) {
  const { showToast, showError, askConfirm } = useDialog();
  const [data, setData] = useState(hoje()); const [resp, setResp] = useState(""); const [sel, setSel] = useState(new Set());
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const aceitar = () => {
    if (!resp.trim()) return showError("Informe o responsável."); if (sel.size === 0) return showError("Selecione ao menos um.");
    const selecionados = rejeitos.filter(r => sel.has(r.id)); const porLav = {}; selecionados.forEach(r => { if (!porLav[r.lavanderia]) porLav[r.lavanderia] = []; porLav[r.lavanderia].push(r); });
    const novas = Object.entries(porLav).map(([lav, items]) => { const ag = {}; items.forEach(r => { ag[r.itemId] = (ag[r.itemId] || 0) + r.qtd; }); return { id: Date.now() + Math.random(), lavanderia: lav, data, responsavel: resp.trim(), rolo: "REENTRADA-" + [...new Set(items.map(i => i.roloOrigem))].join(","), itens: Object.entries(ag).map(([id, qtd]) => ({ id, qtd })), rejeitadosQtd: [], isReentrada: true }; });
    persistEntradas([...entradas, ...novas]); persistRejeitos(rejeitos.filter(r => !sel.has(r.id))); setSel(new Set()); setResp(""); showToast("Reentrada registrada!");
  };
  const descartar = () => { if (sel.size === 0) return showError("Selecione ao menos um."); askConfirm("Descartar selecionados?", () => { persistRejeitos(rejeitos.filter(r => !sel.has(r.id))); setSel(new Set()); showToast("Descartados."); }); };
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Rejeitos Pendentes</h2><Badge color={C.amber}>{rejeitos.length}</Badge></div>
      {rejeitos.length === 0 ? <div style={{ textAlign: "center", padding: 40 }}><CheckCircle size={32} color={C.green} style={{ opacity: .5, marginBottom: 8 }} /><p style={{ color: C.textMuted, fontSize: 13 }}>Nenhum pendente</p></div> : <>
        <button onClick={() => sel.size === rejeitos.length ? setSel(new Set()) : setSel(new Set(rejeitos.map(r => r.id)))} style={{ background: "none", border: "none", color: C.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, padding: 0 }}>{sel.size === rejeitos.length ? "Desmarcar" : "Selecionar todos"}</button>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14, maxHeight: 280, overflowY: "auto" }}>{rejeitos.map(r => <div key={r.id} onClick={() => toggle(r.id)} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8, alignItems: "center", background: sel.has(r.id) ? C.amberSoft : C.bg, borderRadius: 8, padding: "8px 10px", border: `1.5px solid ${sel.has(r.id) ? C.amber + "50" : "transparent"}`, cursor: "pointer" }}><div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel.has(r.id) ? C.amber : C.border}`, background: sel.has(r.id) ? C.amber : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{sel.has(r.id) && <span style={{ color: "#000", fontSize: 11, fontWeight: 700 }}>✓</span>}</div><div><span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{getItemNome(r.itemId)} ×{r.qtd}</span><p style={{ fontSize: 10, color: C.textMuted, margin: 0 }}>{r.lavanderia === "externa" ? "🏭" : "🏠"} #{r.roloOrigem} · {fmtData(r.dataRejeicao)}</p></div><span style={{ fontSize: 11, fontWeight: 600, color: C.textDim, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal((precos[r.itemId] || 0) * r.qtd)}</span></div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}><div><Label>Data</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div><div><Label>Responsável</Label><Input value={resp} onChange={e => setResp(e.target.value)} placeholder="Nome" /></div></div>
        <div style={{ display: "flex", gap: 6 }}><Btn onClick={aceitar} color={C.green} style={{ flex: 2 }}>✓ Aceitar</Btn><Btn onClick={descartar} color={C.red} style={{ flex: 1 }}>Descartar</Btn></div>
      </>}
    </Card>
  );
}

// ── DASHBOARD ───────────────────────────────────────────────────────────
function Dashboard({ saidas, entradas, precos, getItemNome }) {
  const [filtroLav, setFiltroLav] = useState("todas"); const [dataIni, setDataIni] = useState(hoje().slice(0, 8) + "01"); const [dataFim, setDataFim] = useState(hoje());
  const getPreco = (id) => precos[id] || 0; const calcFat = (e) => e.itens.reduce((s, i) => s + i.qtd * getPreco(i.id), 0);
  const filtrar = useCallback((arr) => { let r = arr; if (filtroLav !== "todas") r = r.filter(x => x.lavanderia === filtroLav); r = r.filter(x => x.data >= dataIni && x.data <= dataFim); return r; }, [filtroLav, dataIni, dataFim]);
  const ef = useMemo(() => filtrar(entradas), [entradas, filtrar]); const sf = useMemo(() => filtrar(saidas), [saidas, filtrar]);
  const totalFat = ef.reduce((s, e) => s + calcFat(e), 0); const totalEnv = sf.reduce((s, x) => s + x.itens.reduce((a, b) => a + b.qtd, 0), 0); const totalAce = ef.reduce((s, x) => s + x.itens.reduce((a, b) => a + b.qtd, 0), 0); const totalRej = ef.reduce((s, x) => s + (x.rejeitadosQtd || []).reduce((a, b) => a + b.qtd, 0), 0);
  const fatExt = filtrar(entradas.filter(e => e.lavanderia === "externa")).reduce((s, e) => s + calcFat(e), 0); const fatInt = filtrar(entradas.filter(e => e.lavanderia === "interna")).reduce((s, e) => s + calcFat(e), 0);
  const resumoDia = useMemo(() => { const dias = {}; ef.forEach(e => { if (!dias[e.data]) dias[e.data] = { fat: 0, aceitas: 0, rejeitadas: 0, reentradas: 0, fatExt: 0, fatInt: 0 }; const f = calcFat(e); dias[e.data].fat += f; dias[e.data].aceitas += e.itens.reduce((a, b) => a + b.qtd, 0); dias[e.data].rejeitadas += (e.rejeitadosQtd || []).reduce((a, b) => a + b.qtd, 0); if (e.isReentrada) dias[e.data].reentradas += e.itens.reduce((a, b) => a + b.qtd, 0); if (e.lavanderia === "externa") dias[e.data].fatExt += f; else dias[e.data].fatInt += f; }); return Object.entries(dias).sort((a, b) => b[0].localeCompare(a[0])); }, [ef]);
  const resumoItem = useMemo(() => { const items = {}; ef.forEach(e => e.itens.forEach(i => { if (!items[i.id]) items[i.id] = { qtd: 0, fat: 0 }; items[i.id].qtd += i.qtd; items[i.id].fat += i.qtd * getPreco(i.id); })); return Object.entries(items).sort((a, b) => b[1].fat - a[1].fat); }, [ef, precos]);
  const exportar = () => {
    const lavLabel = filtroLav === "todas" ? "Todas" : filtroLav;
    let csv = `\uFEFF;RELATÓRIO FINANCEIRO DE ENXOVAL\n;Período: ${fmtData(dataIni)} a ${fmtData(dataFim)}\n;Lavanderia: ${lavLabel}\n;Gerado em: ${new Date().toLocaleString('pt-BR')}\n\nData;Lavanderia;Rolo;Tipo;Responsável;Item;Qtd;Preço Unit;Subtotal;Reentrada\n`;
    filtrar(saidas).forEach(s => s.itens.forEach(({ id, qtd }) => { csv += `${fmtData(s.data)};${s.lavanderia};${s.rolo};SAÍDA;${s.responsavel};${getItemNome(id)};${qtd};${getPreco(id).toFixed(2).replace('.', ',')};${(qtd * getPreco(id)).toFixed(2).replace('.', ',')};Não\n`; }));
    ef.forEach(e => { e.itens.forEach(({ id, qtd }) => { csv += `${fmtData(e.data)};${e.lavanderia};${e.rolo};ENTRADA;${e.responsavel};${getItemNome(id)};${qtd};${getPreco(id).toFixed(2).replace('.', ',')};${(qtd * getPreco(id)).toFixed(2).replace('.', ',')};${e.isReentrada ? "Sim" : "Não"}\n`; }); (e.rejeitadosQtd || []).forEach(({ id, qtd }) => { csv += `${fmtData(e.data)};${e.lavanderia};${e.rolo};REJEITADO;${e.responsavel};${getItemNome(id)};${qtd};${getPreco(id).toFixed(2).replace('.', ',')};0,00;Não\n`; }); });
    csv += `\n;RESUMO\n;Total Faturamento;${totalFat.toFixed(2).replace('.', ',')}\n;Fat. Externa;${fatExt.toFixed(2).replace('.', ',')}\n;Fat. Interna;${fatInt.toFixed(2).replace('.', ',')}\n;Peças Enviadas;${totalEnv}\n;Peças Aceitas;${totalAce}\n;Peças Rejeitadas;${totalRej}\n\n;POR ITEM\n;Item;Qtd;Faturamento\n`;
    resumoItem.forEach(([id, d]) => { csv += `;${getItemNome(id)};${d.qtd};${d.fat.toFixed(2).replace('.', ',')}\n`; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `financeiro_enxoval_${dataIni}_${dataFim}.csv`; link.click();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}><Filter size={13} color={C.textDim} />{["todas", "externa", "interna"].map(l => <button key={l} onClick={() => setFiltroLav(l)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: filtroLav === l ? C.accent : C.bg, color: filtroLav === l ? "#fff" : C.textDim }}>{l === "todas" ? "Todas" : l === "externa" ? "🏭 Ext" : "🏠 Int"}</button>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}><div><Label>Início</Label><Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} /></div><div><Label>Fim</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div><button onClick={exportar} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", background: C.green, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}><FileDown size={14} /> Excel</button></div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{[{ l: "Faturamento", v: fmtReal(totalFat), c: C.green }, { l: "🏭 Externa", v: fmtReal(fatExt), c: C.accent }, { l: "🏠 Interna", v: fmtReal(fatInt), c: C.green }].map(k => <div key={k.l} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.c}` }}><p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: .8 }}>{k.l}</p><p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: k.c, fontFamily: "'IBM Plex Mono', monospace" }}>{k.v}</p></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{[{ l: "Enviadas", v: totalEnv, c: C.accent }, { l: "Aceitas", v: totalAce, c: C.green }, { l: "Rejeitadas", v: totalRej, c: C.red }].map(k => <div key={k.l} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}><p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: .8 }}>{k.l}</p><p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: k.c, fontFamily: "'IBM Plex Mono', monospace" }}>{k.v}</p></div>)}</div>
      <Card><h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: C.text }}>Resumo Diário</h3><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{["Data", "Aceitas", "Rej.", "Reent.", "Fat.Ext", "Fat.Int", "Total"].map(h => <th key={h} style={{ padding: "7px 8px", textAlign: h === "Data" ? "left" : "right", fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead><tbody>{resumoDia.map(([data, d]) => <tr key={data}><td style={{ padding: "7px 8px", fontWeight: 600, color: C.text }}>{fmtData(data)}</td><td style={{ padding: "7px 8px", textAlign: "right", color: C.green, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{d.aceitas}</td><td style={{ padding: "7px 8px", textAlign: "right", color: d.rejeitadas ? C.red : C.textDim, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{d.rejeitadas || "-"}</td><td style={{ padding: "7px 8px", textAlign: "right", color: d.reentradas ? C.amber : C.textDim, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{d.reentradas || "-"}</td><td style={{ padding: "7px 8px", textAlign: "right", color: C.text, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal(d.fatExt)}</td><td style={{ padding: "7px 8px", textAlign: "right", color: C.text, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal(d.fatInt)}</td><td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: C.green, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal(d.fat)}</td></tr>)}{resumoDia.length === 0 && <tr><td colSpan="7" style={{ textAlign: "center", padding: 28, color: C.textMuted }}>Sem dados</td></tr>}</tbody></table></div></Card>
      <Card><h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: C.text }}>Faturamento por Item</h3><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{resumoItem.map(([id, d]) => { const mx = Math.max(...resumoItem.map(([_, x]) => x.fat), 1); return <div key={id} style={{ display: "grid", gridTemplateColumns: "150px 50px 1fr 80px", gap: 6, alignItems: "center", padding: "4px 0" }}><span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{getItemNome(id)}</span><span style={{ fontSize: 11, color: C.textMuted, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{d.qtd}</span><div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${(d.fat / mx) * 100}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`, borderRadius: 3 }} /></div><span style={{ fontSize: 12, fontWeight: 700, color: C.text, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal(d.fat)}</span></div>; })}{resumoItem.length === 0 && <p style={{ color: C.textMuted, textAlign: "center", padding: 16 }}>Sem dados</p>}</div></Card>
    </div>
  );
}

// ── HISTÓRICO ───────────────────────────────────────────────────────────
function Historico({ saidas, entradas, persistSaidas, persistEntradas, precos, getItemNome }) {
  const { showToast, askConfirm } = useDialog(); const [tipo, setTipo] = useState("saidas");
  const excluir = (t, id) => { askConfirm("Confirmar exclusão?", () => { if (t === "saidas") persistSaidas(saidas.filter(s => s.id !== id)); else persistEntradas(entradas.filter(e => e.id !== id)); showToast("Excluído!"); }); };
  const lista = tipo === "saidas" ? [...saidas].reverse() : [...entradas].reverse();
  return (
    <Card>
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>{[["saidas", "Saídas", ArrowUpRight, C.accent], ["entradas", "Entradas", ArrowDownLeft, C.green]].map(([id, label, Icon, color]) => <button key={id} onClick={() => setTipo(id)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px", borderRadius: 8, border: `1.5px solid ${tipo === id ? color : C.border}`, background: tipo === id ? color + "15" : "transparent", color: tipo === id ? color : C.textDim, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}><Icon size={14} /> {label} ({id === "saidas" ? saidas.length : entradas.length})</button>)}</div>
      <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {lista.map(r => { const fat = tipo === "entradas" ? r.itens.reduce((s, i) => s + i.qtd * (precos[i.id] || 0), 0) : null; const tRej = (r.rejeitadosQtd || []).reduce((a, b) => a + b.qtd, 0); return (
          <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div><div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 3 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>#{r.rolo}</span><Badge color={r.lavanderia === "externa" ? C.accent : C.green}>{r.lavanderia === "externa" ? "🏭 Ext" : "🏠 Int"}</Badge>{r.isReentrada && <Badge color={C.amber}>Reentrada</Badge>}</div><p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>{fmtData(r.data)} · {r.responsavel}</p></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{fat !== null && <span style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtReal(fat)}</span>}<IconBtn icon={Trash2} color={C.red} onClick={() => excluir(tipo, r.id)} title="Excluir" /></div>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>{r.itens.map(i => `${getItemNome(i.id)}: ${i.qtd}`).join(" · ")}</p>
            {tRej > 0 && <p style={{ margin: "3px 0 0", fontSize: 10, color: C.red, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={11} /> Rej: {(r.rejeitadosQtd || []).map(i => `${getItemNome(i.id)}: ${i.qtd}`).join(" · ")}</p>}
          </div>); })}
        {lista.length === 0 && <p style={{ color: C.textMuted, textAlign: "center", padding: 32, fontSize: 13 }}>Sem registros</p>}
      </div>
    </Card>
  );
}

// ── CONFIGURAÇÃO ────────────────────────────────────────────────────────
function Configuracao({ itensExt, itensInt, precos, persistItensExt, persistItensInt, persistPrecos }) {
  const { showToast, showError, askConfirm } = useDialog();
  const [novoNomeExt, setNovoNomeExt] = useState(""); const [novoNomeInt, setNovoNomeInt] = useState("");
  const addItem = (lav) => { const nome = lav === "externa" ? novoNomeExt.trim() : novoNomeInt.trim(); if (!nome) return showError("Digite o nome."); const lista = lav === "externa" ? itensExt : itensInt; const id = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now(); if (lista.some(i => i.nome.toLowerCase() === nome.toLowerCase())) return showError("Já existe."); const nova = [...lista, { id, nome }]; if (lav === "externa") { persistItensExt(nova); setNovoNomeExt(""); } else { persistItensInt(nova); setNovoNomeInt(""); } showToast(`${nome} adicionado!`); };
  const removeItem = (lav, id) => { const item = (lav === "externa" ? itensExt : itensInt).find(i => i.id === id); askConfirm(`Remover "${item?.nome}"?`, () => { if (lav === "externa") persistItensExt(itensExt.filter(i => i.id !== id)); else persistItensInt(itensInt.filter(i => i.id !== id)); showToast("Removido!"); }); };
  const updatePreco = (id, val) => persistPrecos({ ...precos, [id]: Number(val) });
  const renderGrupo = (label, color, itens, lav, novoNome, setNovoNome) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span><div style={{ flex: 1, height: 1, background: C.border }} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
        {itens.map(item => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 36px", gap: 8, alignItems: "center", background: C.bg, borderRadius: 8, padding: "7px 12px" }}><span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{item.nome}</span><div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 10, color: C.textMuted }}>R$</span><input type="number" step="0.01" min="0" value={precos[item.id] || ""} onChange={e => updatePreco(item.id, e.target.value)} style={{ flex: 1, background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "5px 6px", fontSize: 13, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, outline: "none", color: C.text }} placeholder="0,00" /></div><IconBtn icon={Trash2} color={C.red} onClick={() => removeItem(lav, item.id)} title="Remover" /></div>)}
        {itens.length === 0 && <p style={{ color: C.textMuted, fontSize: 12, textAlign: "center", padding: 12 }}>Nenhum item</p>}
      </div>
      <div style={{ display: "flex", gap: 6 }}><Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do novo item" style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && addItem(lav)} /><button onClick={() => addItem(lav)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", background: color, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}><Plus size={14} /> Adicionar</button></div>
    </div>
  );
  return (
    <Card>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: C.text }}>Configuração</h2>
      <p style={{ margin: "0 0 16px", fontSize: 11, color: C.textMuted }}>Gerencie itens e preços. Sincronizado em tempo real.</p>
      {renderGrupo("🏭 Lavanderia Externa", C.accent, itensExt, "externa", novoNomeExt, setNovoNomeExt)}
      {renderGrupo("🏠 Lavanderia Interna", C.green, itensInt, "interna", novoNomeInt, setNovoNomeInt)}
    </Card>
  );
}

