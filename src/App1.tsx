import { useState, useEffect } from "react";

const SUPABASE_URL = "https://legzjsadsxxbrwysrtgv.supabase.co";
const SUPABASE_KEY = "sb_publishable_CbUGTj42P5tbD457w5REbQ_O3-yeHgT";

const USERS = [
  { name: "Алина",  pin: "2136" },
  { name: "Андрей", pin: "1212" },
  { name: "Юра",    pin: "2308" },
  { name: "Богдан", pin: "1818" },
];

const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
function monthKey(y, m) { return `${y}-${String(m+1).padStart(2,"0")}`; }
function getToday() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; }
function nowStr() {
  return new Date().toLocaleDateString("ru-RU", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────
const headers = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` };

async function sbGet(table, filter = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&order=created_at`, { headers });
  return r.ok ? r.json() : [];
}
async function sbUpsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(data)
  });
}
async function sbDelete(table, filter) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers });
}
async function sbInsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...headers, "Prefer": "return=minimal" },
    body: JSON.stringify(data)
  });
}

export default function App() {
  const [user, setUser]         = useState(null);
  const [pin, setPin]           = useState("");
  const [pinError, setPinError] = useState(false);
  const [shake, setShake]       = useState(false);

  const [clients, setClients]   = useState([]);
  const [records, setRecords]   = useState([]);
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);

  const { y, m }                = getToday();
  const [viewY, setViewY]       = useState(y);
  const [viewM, setViewM]       = useState(m);
  const mk                      = monthKey(viewY, viewM);

  const [adminOpen, setAdminOpen]       = useState(false);
  const [editClient, setEditClient]     = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [logOpen, setLogOpen]           = useState(false);
  const [newClient, setNewClient]       = useState({ name:"", rent:"", util:"", has_util:true, deposit:"", prev_debt:"" });

  // ── Load data ───────────────────────────────────────────────────────────────
  async function loadAll() {
    const [cl, rc, lg] = await Promise.all([
      sbGet("clients"),
      sbGet("records", `month=eq.${mk}`),
      sbGet("logs", "order=created_at.desc&limit=50"),
    ]);
    setClients(cl || []);
    setRecords(rc || []);
    setLogs(lg || []);
    setLoading(false);
  }

  useEffect(() => { if (user) loadAll(); }, [user, mk]);

  // Poll every 15 seconds for real-time updates
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, [user, mk]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getRec(clientId) {
    return records.find(r => r.client_id === clientId) || { rent_done: false, util_done: false };
  }

  function calcPrevDebt(clientId) {
    const cl = clients.find(c => c.id === clientId);
    if (!cl) return 0;
    return cl.prev_debt || 0;
  }

  async function writeLog(action) {
    await sbInsert("logs", { user_name: user.name, action, created_at: new Date().toISOString() });
  }

  async function toggle(clientId, field) {
    const r = getRec(clientId);
    const nowDone = !r[field];
    const dateField = field === "rent_done" ? "rent_date" : "util_date";
    const cl = clients.find(c => c.id === clientId);
    const data = {
      client_id: clientId, month: mk,
      rent_done: field === "rent_done" ? nowDone : (r.rent_done || false),
      util_done: field === "util_done" ? nowDone : (r.util_done || false),
      rent_date: field === "rent_done" ? (nowDone ? nowStr() : null) : (r.rent_date || null),
      util_date: field === "util_done" ? (nowDone ? nowStr() : null) : (r.util_date || null),
    };
    await sbUpsert("records", data);
    const label = field === "rent_done" ? "Аренда" : "Коммунал";
    await writeLog(`${nowDone ? "✓" : "✗"} ${cl?.name} — ${label} (${mk})`);
    loadAll();
  }

  function prevMonth() { if (viewM===0){setViewY(y=>y-1);setViewM(11);}else setViewM(m=>m-1); }
  function nextMonth() { if (viewM===11){setViewY(y=>y+1);setViewM(0);}else setViewM(m=>m+1); }

  async function addClient() {
    if (!newClient.name || !newClient.rent) return;
    const data = { name: newClient.name, rent: +newClient.rent, util: +(newClient.util||0), has_util: newClient.has_util, deposit: +(newClient.deposit||0), prev_debt: +(newClient.prev_debt||0) };
    await sbUpsert("clients", data);
    await writeLog(`+ Добавлен: ${newClient.name}`);
    setNewClient({ name:"", rent:"", util:"", has_util:true, deposit:"", prev_debt:"" });
    loadAll();
  }

  async function saveEdit() {
    await sbUpsert("clients", editClient);
    await writeLog(`✏️ Изменён: ${editClient.name}`);
    setEditClient(null);
    loadAll();
  }

  async function deleteClient(id) {
    const cl = clients.find(c => c.id === id);
    if (window.confirm(`Удалить ${cl?.name}?`)) {
      await sbDelete("clients", `id=eq.${id}`);
      await writeLog(`🗑 Удалён: ${cl?.name}`);
      loadAll();
    }
  }

  function stats() {
    let done=0, collectedSum=0, totalSum=0;
    clients.forEach(c => {
      const r = getRec(c.id);
      totalSum += c.rent + (c.has_util ? c.util : 0);
      if (r.rent_done) collectedSum += c.rent;
      if (c.has_util && r.util_done) collectedSum += c.util;
      if (r.rent_done && (!c.has_util || r.util_done)) done++;
    });
    return { done, pending: clients.length - done, collectedSum, totalSum };
  }

  const sortedClients = [...clients].sort((a,b) => {
    const ra=getRec(a.id); const rb=getRec(b.id);
    return (ra.rent_done&&(!a.has_util||ra.util_done)?1:0)-(rb.rent_done&&(!b.has_util||rb.util_done)?1:0);
  });

  // ── PIN screen ──────────────────────────────────────────────────────────────
  if (!user) return (
    <div style={S.pinBg}>
      <div style={S.pinCard}>
        <div style={S.logo}>Форма 2</div>
        <div style={S.pinLabel}>Введите пин-код</div>
        <div style={{...S.dots,...(shake?S.shake:{})}}>
          {[0,1,2,3].map(i=><div key={i} style={{...S.dot,...(i<pin.length?S.dotFilled:{})}}/>)}
        </div>
        {pinError && <div style={S.pinErr}>Неверный код</div>}
        <div style={S.numpad}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d,i)=>(
            <button key={i} style={d===""?S.numEmpty:S.numBtn} onClick={()=>{
              if (d==="⌫"){setPin(p=>p.slice(0,-1));return;}
              if (d==="") return;
              const next=(pin+d).slice(0,4);
              setPin(next);
              if (next.length===4){
                const found=USERS.find(u=>u.pin===next);
                if (found){setUser(found);setPin("");}
                else{setPinError(true);setShake(true);setTimeout(()=>{setPin("");setPinError(false);setShake(false);},700);}
              }
            }}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) return <div style={S.center}><div style={S.spinner}/></div>;

  const st = stats();

  return (
    <div style={S.bg}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerTop}>
          <span style={S.appName}>Форма 2</span>
          <div style={{display:"flex",gap:6}}>
            <button style={S.iconBtn} onClick={()=>{setLogOpen(true);sbGet("logs","order=created_at.desc&limit=100").then(l=>setLogs(l||[]));}} title="Журнал">📋</button>
            <button style={S.iconBtn} onClick={()=>setAdminOpen(true)} title="Настройки">⚙️</button>
            <button style={S.userBtn} onClick={()=>{setUser(null);setClients([]);setRecords([]);}}>{user.name} ↩</button>
          </div>
        </div>
        <div style={S.monthNav}>
          <button style={S.navBtn} onClick={prevMonth}>‹</button>
          <span style={S.monthLabel}>{MONTHS_RU[viewM]} {viewY}{viewY===y&&viewM===m?" (текущий)":""}</span>
          <button style={S.navBtn} onClick={nextMonth}>›</button>
        </div>
        <div style={S.summary}>
          <div style={S.sumCard}><div style={S.sumNum}>{st.pending}</div><div style={S.sumLbl}>Ожидают</div></div>
          <div style={S.sumCard}><div style={{...S.sumNum,color:"#4ade80"}}>{st.done}</div><div style={S.sumLbl}>Готово</div></div>
          <div style={S.sumCard}><div style={{...S.sumNum,fontSize:13}}>{st.collectedSum.toLocaleString()}</div><div style={S.sumLbl}>грн получено</div></div>
          <div style={S.sumCard}><div style={{...S.sumNum,fontSize:13,color:"#f87171"}}>{(st.totalSum-st.collectedSum).toLocaleString()}</div><div style={S.sumLbl}>грн осталось</div></div>
        </div>
      </div>

      {/* List */}
      <div style={S.list}>
        {clients.length===0 && <div style={S.empty}>Нет клиентов. Добавьте через ⚙️</div>}
        {sortedClients.map(c=>{
          const r=getRec(c.id);
          const debt=calcPrevDebt(c.id);
          const allDone=r.rent_done&&(!c.has_util||r.util_done);
          const expanded=expandedClient===c.id;
          return (
            <div key={c.id} style={{...S.card,...(allDone?S.cardDone:{})}}>
              <div style={S.cardHeader} onClick={()=>setExpandedClient(expanded?null:c.id)}>
                <span style={S.clientName}>{c.name}</span>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  {debt>0&&<span style={S.debtBadge}>Долг: {debt.toLocaleString()}</span>}
                  {allDone&&<span style={S.doneBadge}>✓</span>}
                  <span style={{color:"#64748b",fontSize:16}}>{expanded?"▲":"▼"}</span>
                </div>
              </div>

              <div style={S.row}>
                <div style={S.rowInfo}>
                  <span style={S.rowLabel}>Аренда</span>
                  <span style={S.rowAmt}>{c.rent.toLocaleString()} грн</span>
                  {r.rent_done&&r.rent_date&&<span style={S.dateTag}>📅 {r.rent_date}</span>}
                </div>
                <button style={{...S.checkBtn,...(r.rent_done?S.checkDone:S.checkPending)}} onClick={()=>toggle(c.id,"rent_done")}>
                  {r.rent_done?"✓ Получено":"Забрать"}
                </button>
              </div>

              {c.has_util&&(
                <div style={S.row}>
                  <div style={S.rowInfo}>
                    <span style={S.rowLabel}>Коммунал</span>
                    <span style={S.rowAmt}>{c.util.toLocaleString()} грн</span>
                    {r.util_done&&r.util_date&&<span style={S.dateTag}>📅 {r.util_date}</span>}
                  </div>
                  <button style={{...S.checkBtn,...(r.util_done?S.checkDone:S.checkPending)}} onClick={()=>toggle(c.id,"util_done")}>
                    {r.util_done?"✓ Получено":"Забрать"}
                  </button>
                </div>
              )}

              {expanded&&(
                <div style={S.expandBlock}>
                  <div style={S.expandTitle}>Детали клиента</div>
                  {c.deposit>0&&<div style={S.expandRow}><span style={S.expandLabel}>🔒 Гарантийный платёж</span><span style={S.expandVal}>{c.deposit.toLocaleString()} грн</span></div>}
                  {c.prev_debt>0&&<div style={S.expandRow}><span style={S.expandLabel}>⚠️ Долг за прошлый период</span><span style={{...S.expandVal,color:"#f87171"}}>{c.prev_debt.toLocaleString()} грн</span></div>}
                  <div style={S.expandRow}><span style={S.expandLabel}>Коммунальные</span><span style={S.expandVal}>{c.has_util?"Да":"Нет"}</span></div>
                  {!c.deposit&&!c.prev_debt&&<div style={{color:"#64748b",fontSize:12,textAlign:"center",paddingTop:4}}>Нет доп. данных</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Log modal */}
      {logOpen&&(
        <div style={S.overlay} onClick={()=>setLogOpen(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>📋 Журнал действий</span>
              <button style={S.closeBtn} onClick={()=>setLogOpen(false)}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {logs.length===0&&<div style={{color:"#64748b",textAlign:"center",padding:20}}>Действий пока нет</div>}
              {logs.map((l,i)=>(
                <div key={i} style={S.logRow}>
                  <div style={S.logAction}>{l.action}</div>
                  <div style={S.logMeta}>{l.user_name} · {l.created_at ? new Date(l.created_at).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admin modal */}
      {adminOpen&&(
        <div style={S.overlay} onClick={()=>{setAdminOpen(false);setEditClient(null);}}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>⚙️ Управление</span>
              <button style={S.closeBtn} onClick={()=>{setAdminOpen(false);setEditClient(null);}}>✕</button>
            </div>
            <div style={S.addBlock}>
              <div style={S.addTitle}>Добавить клиента</div>
              <input style={S.inp} placeholder="Название" value={newClient.name} onChange={e=>setNewClient(p=>({...p,name:e.target.value}))}/>
              <div style={S.inpRow}>
                <input style={{...S.inp,...S.inpHalf}} placeholder="Аренда грн" type="number" value={newClient.rent} onChange={e=>setNewClient(p=>({...p,rent:e.target.value}))}/>
                <input style={{...S.inp,...S.inpHalf}} placeholder="Коммунал грн" type="number" value={newClient.util} onChange={e=>setNewClient(p=>({...p,util:e.target.value}))}/>
              </div>
              <div style={S.inpRow}>
                <input style={{...S.inp,...S.inpHalf}} placeholder="Гарантийный платёж" type="number" value={newClient.deposit} onChange={e=>setNewClient(p=>({...p,deposit:e.target.value}))}/>
                <input style={{...S.inp,...S.inpHalf}} placeholder="Долг за прош. период" type="number" value={newClient.prev_debt} onChange={e=>setNewClient(p=>({...p,prev_debt:e.target.value}))}/>
              </div>
              <div style={{...S.inpRow,alignItems:"center",marginBottom:8}}>
                <label style={{color:"#94a3b8",fontSize:13,flex:1}}>Коммунальные платежи</label>
                <button style={{...S.toggleBtn,...(newClient.has_util?S.toggleOn:S.toggleOff)}} onClick={()=>setNewClient(p=>({...p,has_util:!p.has_util}))}>
                  {newClient.has_util?"Вкл":"Выкл"}
                </button>
              </div>
              <button style={S.addBtn} onClick={addClient}>+ Добавить</button>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {clients.map(c=>(
                <div key={c.id} style={S.adminRow}>
                  {editClient?.id===c.id?(
                    <div style={{flex:1}}>
                      <input style={S.inp} value={editClient.name} onChange={e=>setEditClient(p=>({...p,name:e.target.value}))}/>
                      <div style={S.inpRow}>
                        <input style={{...S.inp,...S.inpHalf}} type="number" value={editClient.rent} onChange={e=>setEditClient(p=>({...p,rent:+e.target.value}))}/>
                        <input style={{...S.inp,...S.inpHalf}} type="number" value={editClient.util} onChange={e=>setEditClient(p=>({...p,util:+e.target.value}))}/>
                      </div>
                      <div style={S.inpRow}>
                        <input style={{...S.inp,...S.inpHalf}} type="number" placeholder="Гарантийный" value={editClient.deposit||""} onChange={e=>setEditClient(p=>({...p,deposit:+e.target.value}))}/>
                        <input style={{...S.inp,...S.inpHalf}} type="number" placeholder="Долг" value={editClient.prev_debt||""} onChange={e=>setEditClient(p=>({...p,prev_debt:+e.target.value}))}/>
                      </div>
                      <div style={{...S.inpRow,alignItems:"center",marginBottom:8}}>
                        <label style={{color:"#94a3b8",fontSize:13,flex:1}}>Коммунальные</label>
                        <button style={{...S.toggleBtn,...(editClient.has_util?S.toggleOn:S.toggleOff)}} onClick={()=>setEditClient(p=>({...p,has_util:!p.has_util}))}>
                          {editClient.has_util?"Вкл":"Выкл"}
                        </button>
                      </div>
                      <div style={S.inpRow}>
                        <button style={S.saveBtn} onClick={saveEdit}>Сохранить</button>
                        <button style={S.cancelBtn} onClick={()=>setEditClient(null)}>Отмена</button>
                      </div>
                    </div>
                  ):(
                    <>
                      <div style={{flex:1}}>
                        <div style={S.adminName}>{c.name}</div>
                        <div style={S.adminSums}>Аренда {c.rent.toLocaleString()} · {c.has_util?`Коммунал ${c.util.toLocaleString()}`:"Без коммунала"}{c.deposit>0?` · Залог ${c.deposit.toLocaleString()}`:""}</div>
                      </div>
                      <button style={S.editBtn} onClick={()=>setEditClient({...c})}>✏️</button>
                      <button style={S.delBtn} onClick={()=>deleteClient(c.id)}>🗑</button>
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
  bg:{minHeight:"100vh",background:"#0f172a",fontFamily:"system-ui,sans-serif",paddingBottom:32},
  center:{display:"flex",justifyContent:"center",alignItems:"center",height:"100vh",background:"#0f172a"},
  spinner:{width:36,height:36,border:"3px solid #334155",borderTop:"3px solid #38bdf8",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  pinBg:{minHeight:"100vh",background:"#0f172a",display:"flex",justifyContent:"center",alignItems:"center"},
  pinCard:{background:"#1e293b",borderRadius:24,padding:"40px 32px",display:"flex",flexDirection:"column",alignItems:"center",width:300},
  logo:{fontSize:28,fontWeight:800,color:"#38bdf8",marginBottom:24},
  pinLabel:{color:"#94a3b8",fontSize:14,marginBottom:20},
  dots:{display:"flex",gap:16,marginBottom:8},
  dot:{width:16,height:16,borderRadius:"50%",border:"2px solid #475569",background:"transparent"},
  dotFilled:{background:"#38bdf8",borderColor:"#38bdf8"},
  pinErr:{color:"#f87171",fontSize:13,marginBottom:8},
  shake:{animation:"shake 0.5s"},
  numpad:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:16,width:"100%"},
  numBtn:{background:"#334155",border:"none",borderRadius:12,color:"#f1f5f9",fontSize:22,fontWeight:600,height:56,cursor:"pointer"},
  numEmpty:{background:"transparent",border:"none"},
  header:{background:"#1e293b",padding:"16px 14px 12px",borderBottom:"1px solid #334155"},
  headerTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},
  appName:{fontSize:20,fontWeight:800,color:"#38bdf8"},
  iconBtn:{background:"#334155",border:"none",borderRadius:8,padding:"5px 8px",cursor:"pointer",fontSize:16},
  userBtn:{background:"#1e3a5f",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,color:"#93c5fd"},
  monthNav:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:12},
  navBtn:{background:"#334155",border:"none",borderRadius:8,color:"#f1f5f9",fontSize:22,width:34,height:34,cursor:"pointer"},
  monthLabel:{color:"#f1f5f9",fontWeight:600,fontSize:14,minWidth:170,textAlign:"center"},
  summary:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6},
  sumCard:{background:"#0f172a",borderRadius:10,padding:"8px 4px",textAlign:"center"},
  sumNum:{fontSize:20,fontWeight:800,color:"#f1f5f9"},
  sumLbl:{fontSize:9,color:"#64748b",marginTop:2},
  list:{padding:"12px",display:"flex",flexDirection:"column",gap:10},
  empty:{color:"#64748b",textAlign:"center",marginTop:40,fontSize:15},
  card:{background:"#1e293b",borderRadius:14,padding:14,border:"1px solid #334155"},
  cardDone:{opacity:0.55,borderColor:"#166834"},
  cardHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,cursor:"pointer"},
  clientName:{fontSize:16,fontWeight:700,color:"#f1f5f9"},
  debtBadge:{background:"#7f1d1d",color:"#fca5a5",fontSize:10,borderRadius:6,padding:"2px 7px",fontWeight:600},
  doneBadge:{background:"#14532d",color:"#4ade80",fontSize:10,borderRadius:6,padding:"2px 7px",fontWeight:600},
  row:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8},
  rowInfo:{display:"flex",flexDirection:"column"},
  rowLabel:{fontSize:11,color:"#64748b"},
  rowAmt:{fontSize:15,fontWeight:700,color:"#e2e8f0"},
  dateTag:{fontSize:10,color:"#38bdf8",marginTop:2},
  checkBtn:{border:"none",borderRadius:10,padding:"8px 12px",fontWeight:700,fontSize:12,cursor:"pointer",minWidth:95},
  checkPending:{background:"#0369a1",color:"#fff"},
  checkDone:{background:"#166534",color:"#4ade80"},
  expandBlock:{background:"#0f172a",borderRadius:10,padding:12,marginTop:6},
  expandTitle:{color:"#64748b",fontSize:10,fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:1},
  expandRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6},
  expandLabel:{color:"#94a3b8",fontSize:13},
  expandVal:{color:"#f1f5f9",fontWeight:700,fontSize:13},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"flex-end"},
  modal:{background:"#1e293b",borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:18},
  modalHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14},
  modalTitle:{fontSize:17,fontWeight:700,color:"#f1f5f9"},
  closeBtn:{background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",fontSize:17,width:30,height:30,cursor:"pointer"},
  addBlock:{background:"#0f172a",borderRadius:12,padding:12,marginBottom:14},
  addTitle:{color:"#94a3b8",fontSize:12,marginBottom:8,fontWeight:600},
  inp:{width:"100%",background:"#1e293b",border:"1px solid #334155",borderRadius:10,color:"#f1f5f9",padding:"9px 11px",fontSize:13,marginBottom:7,boxSizing:"border-box"},
  inpRow:{display:"flex",gap:7},
  inpHalf:{flex:1},
  addBtn:{width:"100%",background:"#0369a1",border:"none",borderRadius:10,color:"#fff",padding:"10px",fontWeight:700,fontSize:13,cursor:"pointer"},
  toggleBtn:{border:"none",borderRadius:8,padding:"6px 14px",fontWeight:700,fontSize:12,cursor:"pointer"},
  toggleOn:{background:"#166534",color:"#4ade80"},
  toggleOff:{background:"#334155",color:"#94a3b8"},
  adminRow:{background:"#0f172a",borderRadius:10,padding:11,display:"flex",alignItems:"center",gap:7},
  adminName:{color:"#f1f5f9",fontWeight:600,fontSize:13},
  adminSums:{color:"#64748b",fontSize:11,marginTop:2},
  editBtn:{background:"#334155",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",fontSize:15},
  delBtn:{background:"#7f1d1d",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",fontSize:15},
  saveBtn:{flex:1,background:"#166534",border:"none",borderRadius:8,color:"#4ade80",padding:"8px",fontWeight:700,cursor:"pointer"},
  cancelBtn:{flex:1,background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",padding:"8px",cursor:"pointer"},
  logRow:{background:"#0f172a",borderRadius:10,padding:10},
  logAction:{color:"#f1f5f9",fontSize:13,marginBottom:3},
  logMeta:{color:"#64748b",fontSize:11},
};
