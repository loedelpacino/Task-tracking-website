// notifications.js – panel açıldığında okundu işaretleme destekli
import { auth, db } from "./firebase-config.js";
import { ref, onValue, get, child, push, set, update, remove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const $ = (s, r=document)=> r.querySelector(s);
const notifBell  = $("#notifBell");
const notifPanel = $("#notifPanel");
const notifCount = $("#notifCount");
const notifList  = $("#notifList");
const inviteList = $("#inviteList");

function emailKey(s){ return (s||"").toLowerCase().trim().replace(/[.#$\[\]]/g,"_"); }
function uid(){ return auth.currentUser?.uid; }

let _unreadCount = 0;
let _pendingInviteCount = 0;
let _hasMarkedOnce = false; // aynı oturumda gereksiz tekrarları önlemek için

function updateBadge(){
  const total = _pendingInviteCount + _unreadCount;
  if(!notifCount) return;
  if(total>0){ notifCount.textContent = String(total); notifCount.classList.remove("hidden"); }
  else notifCount.classList.add("hidden");
}

async function markAllAsRead() {
  // Panel ilk kez açıldığında okundu işaretle
  if (!auth.currentUser || _unreadCount === 0) return;
  try {
    const base = `user_notifications/${uid()}`;
    const snap = await get(ref(db, base));
    if (!snap.exists()) return;

    const updates = {};
    Object.entries(snap.val()).forEach(([id, n])=>{
      if(n && n.read === false) updates[`${base}/${id}/read`] = true;
    });
    if (Object.keys(updates).length) {
      await update(ref(db), updates);
    }
    _unreadCount = 0;  // rozet güncelle
    updateBadge();
  } catch (e) {
    console.warn("markAllAsRead error:", e);
  }
}

function togglePanel(){
  if(!notifPanel) return;
  const willOpen = notifPanel.classList.contains("hidden");
  notifPanel.classList.toggle("hidden");
  // Açılış anında bir kez okundu işaretle
  if (willOpen && !_hasMarkedOnce) {
    _hasMarkedOnce = true;
    markAllAsRead();
  }
}

notifBell?.addEventListener("click", togglePanel);
document.addEventListener("click", (e)=>{
  if(!notifPanel || !notifBell) return;
  if (notifPanel.contains(e.target) || notifBell.contains(e.target)) return;
  notifPanel.classList.add("hidden");
});

async function acceptInvite(invId, inv){
  try{
    await update(ref(db, `teamspaces/${inv.teamspaceId}/members`), { [uid()]: true });
    await update(ref(db, `invites/${invId}`), { status: "accepted", acceptedBy: uid(), acceptedAt: Date.now() });
    const key = emailKey(inv.invitedEmail);
    await remove(ref(db, `user_invites_by_email/${key}/${invId}`));
    const nref = push(ref(db, `user_notifications/${inv.inviterUid}`));
    await set(nref, {
      type: "invite_accepted",
      text: `${auth.currentUser?.email || "Bir kullanıcı"} davetini kabul etti`,
      createdAt: Date.now(), read: false
    });
  }catch(err){ console.error(err); alert("Kabul ederken hata oluştu."); }
}

async function declineInvite(invId, inv){
  try{
    await update(ref(db, `invites/${invId}`), { status: "declined", declinedBy: uid(), declinedAt: Date.now() });
    const key = emailKey(inv.invitedEmail);
    await remove(ref(db, `user_invites_by_email/${key}/${invId}`));
  }catch(err){ console.error(err); alert("Reddederken hata oluştu."); }
}

function renderInvites(invites){
  if(!inviteList) return;
  inviteList.innerHTML = "";
  const entries = Object.entries(invites || {});
  if(entries.length===0){ inviteList.textContent = "Bekleyen davet yok."; return; }
  entries.forEach(([id, inv])=>{
    const item = document.createElement("div");
    item.className = "notif-item";
    item.innerHTML = `
      <div class="text">
        <strong>Davet</strong> · ${new Date(inv.createdAt).toLocaleString("tr-TR")}<br/>
        <span data-ts-name>Yükleniyor…</span><br/>
        <small>${inv.invitedEmail}</small>
      </div>
      <div class="actions">
        <button class="btn primary" data-acc aria-label="Daveti kabul et">Katıl</button>
        <button class="ghost" data-dec aria-label="Daveti reddet">Reddet</button>
      </div>`;
    get(child(ref(db), `teamspaces/${inv.teamspaceId}`))
      .then(s=>{ if(s.exists()) item.querySelector("[data-ts-name]").textContent = `Teamspace: ${s.val().name||inv.teamspaceId}`; })
      .catch(()=>{ item.querySelector("[data-ts-name]").textContent = `Teamspace: ${inv.teamspaceId}`; });

    item.querySelector("[data-acc]").addEventListener("click", ()=> acceptInvite(id, inv));
    item.querySelector("[data-dec]").addEventListener("click", ()=> declineInvite(id, inv));
    inviteList.appendChild(item);
  });
}

function renderNotifs(notifs){
  if(!notifList) return;
  notifList.innerHTML = "";
  const entries = Object.entries(notifs || {}).sort((a,b)=> (b[1].createdAt||0)-(a[1].createdAt||0)).slice(0,20);
  if(entries.length===0){ notifList.textContent = "Bildirim yok."; return; }
  entries.forEach(([id, n])=>{
    const row = document.createElement("div");
    row.className = "notif-item";
    row.innerHTML = `
      <div class="text">${n.text || "-"}</div>
      <div class="time">${new Date(n.createdAt||Date.now()).toLocaleString("tr-TR")}</div>`;
    notifList.appendChild(row);
  });
}

function watch(user){
  if(!user || !notifPanel) return;

  const ekey = emailKey(user.email||"");

  // Davetler
  onValue(ref(db, `user_invites_by_email/${ekey}`), async (snap)=>{
    try{
      const ids = snap.exists() ? Object.keys(snap.val()) : [];
      _pendingInviteCount = ids.length;
      const invites = {};
      await Promise.all(ids.map(async(id)=>{
        const s = await get(child(ref(db), `invites/${id}`));
        if(s.exists()){ invites[id] = s.val(); }
      }));
      renderInvites(invites);
    }catch(err){
      console.warn("Invite read error:", err);
      renderInvites({});
      _pendingInviteCount = 0;
    }
    updateBadge();
  }, (err)=>{
    console.warn("Invite permission error:", err);
    renderInvites({});
    _pendingInviteCount = 0; updateBadge();
  });

  // Bildirimler
  onValue(ref(db, `user_notifications/${user.uid}`), (snap)=>{
    try{
      const data = snap.exists() ? snap.val() : {};
      renderNotifs(data);
      _unreadCount = Object.values(data).filter(x=>x && x.read===false).length;
    }catch{
      renderNotifs({});
      _unreadCount = 0;
    }
    updateBadge();
  }, (err)=>{
    console.warn("Notif permission error:", err);
    renderNotifs({});
    _unreadCount = 0; updateBadge();
  });
}

onAuthStateChanged(auth, (user)=>{ if(!user) return; watch(user); });
