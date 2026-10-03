import { useState, useEffect } from "react";

const PIN = "3434";
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function monthKey(y, m) { return `${y}-${String(m+1).padStart(2,"0")}`; }
function getToday() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; }
function loadLS(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function saveLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

const DEFAULT_CLIENTS = [
  { id: 1, name: "Клиент 1", rent: 5000, util: 1200 },
  { id: 2, name: "Клиент 2", rent: 7000, util: 800 },
  { id: 3, name: "Клиент 3", rent: 4500, util: 950 },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [shake, setShake] = useState(false);
  const [clients, setClients] = useState(() => loadLS("f2:clients") || DEFAULT_CLIENTS);
  const [records, setRecords] = useState(() => loadLS("f2:records") || {});
  const { y, m } = getToday();
  const [viewY, setViewY] = useState(y);
  const [viewM, setViewM] = useState(m);
  const mk = monthKey(viewY, viewM);
  const [adminOpen, setAdminOpen] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [newClient, setNewClient] = useState({ name: "", rent: "", util: "" });

  useEffect(() => { saveLS("f2:clients", clients); }, [clients]);
  useEffect(() => { saveLS("f2:records", records); }, [records]);

  function handlePin(d) {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (next === PIN) { setAuthed(true); }
      else {
        setPinError(true); setShake(true);
        setTimeout(() => { setPin(""); setPinError(false); setShake(false); }, 700);
      }
    }
  }
  function handlePinBack() { setPin(p => p.slice(0, -1)); }

  function getRec(clientId) {
    return records?.[mk]?.[clientId] || { rentDone: false, utilDone: false };
  }

  function prevDebt(clientId) {
    let debt = 0;
    const cl = clients.find(c => c.id === clientId);
    if (!cl) return 0;
    Object.entries(records).forEach(([key, monthData]) => {
      if (key >= mk) return;
      const r = monthData[clientId];
      if (!r) { debt += cl.rent + cl.util; return; }
      if (!r.rentDone) debt += cl.rent;
      if (!r.utilDone) debt += cl.util;
    });
    return debt;
  }

  function toggle(clientId, field) {
    const dateField = field === "rentDone" ? "rentDate" : "utilDate";
    setRecords(prev => {
      const month = prev[mk] || {};
      const cur = month[clientId] || { rentDone: false, utilDone: false };
      const nowDone = !cur[field];
      const now = new Date();
      const dateStr = now.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      return { ...prev, [mk]: { ...month, [clientId]: { ...cur, [field]: nowDone, [dateField]: nowDone ? dateStr : null } } };
    });
  }

  function prevMonth() { if (viewM === 0) { setViewY(y => y - 1); setViewM(11); } else setViewM(m => m - 1); }
  function nextMonth() { if (viewM === 11) { setViewY(y => y + 1); setViewM(0); } else setViewM(m => m + 1); }

  function addClient() {
    if (!newClient.name || !newClient.rent) return;
    const id = Date.now();
    setClients(prev => [...prev, { id, name: newClient.name, rent: +newClient.rent, util: +(newClient.util || 0) }]);
    setNewClient({ name: "", rent: "", util: "" });
  }
  function saveEdit() { setClients(prev => prev.map(c => c.id === editClient.id ? editClient : c)); setEditClient(null); }
  function deleteClient(id) { if (window.confirm("Удалить форму?")) setClients(prev => prev.filter(c => c.id !== id)); }

  function stats() {
    let done = 0, collectedSum = 0, totalSum = 0;
    clients.forEach(c => {
      const r = getRec(c.id);
      totalSum += c.rent + c.util;
      if (r.rentDone) collectedSum += c.rent;
      if (r.utilDone) collectedSum += c.util;
      if (r.rentDone && r.utilDone) done++;
    });
    return { done, pending: clients.length - done, collectedSum, totalSum };
  }

  const isCurrentMonth = viewY === y && viewM === m;
  const sortedClients = [...clients].sort((a, b) => {
    const ra = getRec(a.id); const rb = getRec(b.id);
    return (ra.rentDone && ra.utilDone ? 1 : 0) - (rb.rentDone && rb.utilDone ? 1 : 0);
  });

  if (!authed) return (
    <div style={S.pinBg}>
      <div style={S.pinCard}>
        <div style={S.logo}>Форма 2</div>
        <div style={S.pinLabel}>Введите пин-код</div>
        <div style={{ ...S.dots, ...(shake ? S.shake : {}) }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ ...S.dot, ...(i < pin.length ? S.dotFilled : {}) }} />)}
        </div>
        {pinError && <div style={S.pinErr}>Неверный код</div>}
        <div style={S.numpad}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
            <button key={i} style={d === "" ? S.numEmpty : S.numBtn}
              onClick={() => d === "⌫" ? handlePinBack() : d !== "" && handlePin(d)}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  );

  const st = stats();

  return (
    <div style={S.bg}>
      <div style={S.header}>
        <div style={S.headerTop}>
          <span style={S.appName}>Форма 2</span>
          <button style={S.adminBtn} onClick={() => setAdminOpen(true)}>⚙️</button>
        </div>
        <div style={S.monthNav}>
          <button style={S.navBtn} onClick={prevMonth}>‹</button>
          <span style={S.monthLabel}>{MONTHS_RU[viewM]} {viewY}{isCurrentMonth ? " (текущий)" : ""}</span>
          <button style={S.navBtn} onClick={nextMonth}>›</button>
        </div>
        <div style={S.summary}>
          <div style={S.sumCard}><div style={S.sumNum}>{st.pending}</div><div style={S.sumLbl}>Ожидают</div></div>
          <div style={S.sumCard}><div style={{ ...S.sumNum, color: "#4ade80" }}>{st.done}</div><div style={S.sumLbl}>Собрано</div></div>
          <div style={S.sumCard}><div style={{ ...S.sumNum, fontSize: 14 }}>{st.collectedSum.toLocaleString()}</div><div style={S.sumLbl}>грн получено</div></div>
          <div style={S.sumCard}><div style={{ ...S.sumNum, fontSize: 14, color: "#f87171" }}>{(st.totalSum - st.collectedSum).toLocaleString()}</div><div style={S.sumLbl}>грн осталось</div></div>
        </div>
      </div>

      <div style={S.list}>
        {clients.length === 0 && <div style={S.empty}>Нет форм. Добавьте через ⚙️</div>}
        {sortedClients.map(c => {
          const r = getRec(c.id);
          const debt = prevDebt(c.id);
          const allDone = r.rentDone && r.utilDone;
          return (
            <div key={c.id} style={{ ...S.card, ...(allDone ? S.cardDone : {}) }}>
              <div style={S.cardHeader}>
                <span style={S.clientName}>{c.name}</span>
                {debt > 0 && <span style={S.debtBadge}>Долг: {debt.toLocaleString()} грн</span>}
                {allDone && <span style={S.doneBadge}>✓ Готово</span>}
              </div>
              <div style={S.row}>
                <div style={S.rowInfo}>
                  <span style={S.rowLabel}>Аренда</span>
                  <span style={S.rowAmt}>{c.rent.toLocaleString()} грн</span>
                  {r.rentDone && r.rentDate && <span style={S.dateTag}>📅 {r.rentDate}</span>}
                </div>
                <button style={{ ...S.checkBtn, ...(r.rentDone ? S.checkDone : S.checkPending) }} onClick={() => toggle(c.id, "rentDone")}>
                  {r.rentDone ? "✓ Получено" : "Забрать"}
                </button>
              </div>
              <div style={S.row}>
                <div style={S.rowInfo}>
                  <span style={S.rowLabel}>Коммунал</span>
                  <span style={S.rowAmt}>{c.util.toLocaleString()} грн</span>
                  {r.utilDone && r.utilDate && <span style={S.dateTag}>📅 {r.utilDate}</span>}
                </div>
                <button style={{ ...S.checkBtn, ...(r.utilDone ? S.checkDone : S.checkPending) }} onClick={() => toggle(c.id, "utilDone")}>
                  {r.utilDone ? "✓ Получено" : "Забрать"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {adminOpen && (
        <div style={S.overlay} onClick={() => { setAdminOpen(false); setEditClient(null); }}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>Управление формами</span>
              <button style={S.closeBtn} onClick={() => { setAdminOpen(false); setEditClient(null); }}>✕</button>
            </div>
            <div style={S.addBlock}>
              <div style={S.addTitle}>Добавить форму</div>
              <input style={S.inp} placeholder="Название" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} />
              <div style={S.inpRow}>
                <input style={{ ...S.inp, ...S.inpHalf }} placeholder="Аренда грн" type="number" value={newClient.rent} onChange={e => setNewClient(p => ({ ...p, rent: e.target.value }))} />
                <input style={{ ...S.inp, ...S.inpHalf }} placeholder="Коммунал грн" type="number" value={newClient.util} onChange={e => setNewClient(p => ({ ...p, util: e.target.value }))} />
              </div>
              <button style={S.addBtn} onClick={addClient}>+ Добавить</button>
            </div>
            <div style={S.adminList}>
              {clients.map(c => (
                <div key={c.id} style={S.adminRow}>
                  {editClient?.id === c.id ? (
                    <div style={{ flex: 1 }}>
                      <input style={S.inp} value={editClient.name} onChange={e => setEditClient(p => ({ ...p, name: e.target.value }))} />
                      <div style={S.inpRow}>
                        <input style={{ ...S.inp, ...S.inpHalf }} type="number" value={editClient.rent} onChange={e => setEditClient(p => ({ ...p, rent: +e.target.value }))} />
                        <input style={{ ...S.inp, ...S.inpHalf }} type="number" value={editClient.util} onChange={e => setEditClient(p => ({ ...p, util: +e.target.value }))} />
                      </div>
                      <div style={S.inpRow}>
                        <button style={S.saveBtn} onClick={saveEdit}>Сохранить</button>
                        <button style={S.cancelBtn} onClick={() => setEditClient(null)}>Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={S.adminName}>{c.name}</div>
                        <div style={S.adminSums}>Аренда {c.rent.toLocaleString()} · Коммунал {c.util.toLocaleString()}</div>
                      </div>
                      <button style={S.editBtn} onClick={() => setEditClient({ ...c })}>✏️</button>
                      <button style={S.delBtn} onClick={() => deleteClient(c.id)}>🗑</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  bg: { minHeight: "100vh", background: "#0f172a", fontFamily: "system-ui,sans-serif", paddingBottom: 32 },
  pinBg: { minHeight: "100vh", background: "#0f172a", display: "flex", justifyContent: "center", alignItems: "center" },
  pinCard: { background: "#1e293b", borderRadius: 24, padding: "40px 32px", display: "flex", flexDirection: "column", alignItems: "center", width: 300 },
  logo: { fontSize: 28, fontWeight: 800, color: "#38bdf8", marginBottom: 24, letterSpacing: 1 },
  pinLabel: { color: "#94a3b8", fontSize: 14, marginBottom: 20 },
  dots: { display: "flex", gap: 16, marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: "50%", border: "2px solid #475569", background: "transparent", transition: "all 0.15s" },
  dotFilled: { background: "#38bdf8", borderColor: "#38bdf8" },
  pinErr: { color: "#f87171", fontSize: 13, marginBottom: 8 },
  shake: { animation: "shake 0.5s" },
  numpad: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16, width: "100%" },
  numBtn: { background: "#334155", border: "none", borderRadius: 12, color: "#f1f5f9", fontSize: 22, fontWeight: 600, height: 56, cursor: "pointer" },
  numEmpty: { background: "transparent", border: "none" },
  header: { background: "#1e293b", padding: "20px 16px 16px", borderBottom: "1px solid #334155" },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  appName: { fontSize: 22, fontWeight: 800, color: "#38bdf8" },
  adminBtn: { background: "#334155", border: "none", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontSize: 18 },
  monthNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 },
  navBtn: { background: "#334155", border: "none", borderRadius: 8, color: "#f1f5f9", fontSize: 22, width: 36, height: 36, cursor: "pointer" },
  monthLabel: { color: "#f1f5f9", fontWeight: 600, fontSize: 15, minWidth: 180, textAlign: "center" },
  summary: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 },
  sumCard: { background: "#0f172a", borderRadius: 12, padding: "10px 6px", textAlign: "center" },
  sumNum: { fontSize: 22, fontWeight: 800, color: "#f1f5f9" },
  sumLbl: { fontSize: 10, color: "#64748b", marginTop: 2 },
  list: { padding: "16px 12px", display: "flex", flexDirection: "column", gap: 12 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 40, fontSize: 15 },
  card: { background: "#1e293b", borderRadius: 16, padding: 16, border: "1px solid #334155" },
  cardDone: { opacity: 0.6, borderColor: "#166834" },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  clientName: { fontSize: 17, fontWeight: 700, color: "#f1f5f9", flex: 1 },
  debtBadge: { background: "#7f1d1d", color: "#fca5a5", fontSize: 11, borderRadius: 6, padding: "3px 8px", fontWeight: 600 },
  doneBadge: { background: "#14532d", color: "#4ade80", fontSize: 11, borderRadius: 6, padding: "3px 8px", fontWeight: 600 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  rowInfo: { display: "flex", flexDirection: "column" },
  rowLabel: { fontSize: 12, color: "#64748b" },
  rowAmt: { fontSize: 16, fontWeight: 700, color: "#e2e8f0" },
  dateTag: { fontSize: 11, color: "#38bdf8", marginTop: 3 },
  checkBtn: { border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", minWidth: 100 },
  checkPending: { background: "#0369a1", color: "#fff" },
  checkDone: { background: "#166534", color: "#4ade80" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" },
  modal: { background: "#1e293b", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 20 },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  closeBtn: { background: "#334155", border: "none", borderRadius: 8, color: "#94a3b8", fontSize: 18, width: 32, height: 32, cursor: "pointer" },
  addBlock: { background: "#0f172a", borderRadius: 14, padding: 14, marginBottom: 16 },
  addTitle: { color: "#94a3b8", fontSize: 13, marginBottom: 10, fontWeight: 600 },
  inp: { width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, color: "#f1f5f9", padding: "10px 12px", fontSize: 14, marginBottom: 8, boxSizing: "border-box" },
  inpRow: { display: "flex", gap: 8 },
  inpHalf: { flex: 1 },
  addBtn: { width: "100%", background: "#0369a1", border: "none", borderRadius: 10, color: "#fff", padding: "11px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  adminList: { display: "flex", flexDirection: "column", gap: 8 },
  adminRow: { background: "#0f172a", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 8 },
  adminName: { color: "#f1f5f9", fontWeight: 600, fontSize: 14 },
  adminSums: { color: "#64748b", fontSize: 12, marginTop: 2 },
  editBtn: { background: "#334155", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontSize: 16 },
  delBtn: { background: "#7f1d1d", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontSize: 16 },
  saveBtn: { flex: 1, background: "#166534", border: "none", borderRadius: 8, color: "#4ade80", padding: "8px", fontWeight: 700, cursor: "pointer" },
  cancelBtn: { flex: 1, background: "#334155", border: "none", borderRadius: 8, color: "#94a3b8", padding: "8px", cursor: "pointer" },
};
