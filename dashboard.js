// dashboard.js – Personal Board + Feed (fotoğrafsız, yeni composer + LIKE & YORUM + DELETE + authorName)
import { auth, db } from "./firebase-config.js";
import {
  ref, onValue, push, set, remove, update, child, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { dragAndDropForTasksGeneric, bindDraggables } from "./dragdrop-utils.js";

const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));

let USER=null;
let BASE_PATH=null;

/* ---------- ortak sekme ---------- */
function setActiveView(view){
  $$(".switch-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  $("#boardView")?.classList.toggle("active", view==="board");
  $("#feedView")?.classList.toggle("active", view==="feed");
}
function attachViewEvents(){ $$(".switch-btn").forEach(b=> b.addEventListener("click", ()=> setActiveView(b.dataset.view))); }

/* ---------- topbar ---------- */
function initTopbar(){
  $("#logoutBtn")?.addEventListener("click", async ()=>{ await signOut(auth); location.href="index.html"; });
  $("#scope-badge")?.textContent && ($("#scope-badge").textContent="Personal");
}

/* ===================== BOARD ===================== */
function clearLists(){ ["todo","in_progress","done"].forEach(s=>{ const el=$(`#list-${s}`); if(el) el.innerHTML=""; }); }
function emptyStates(){ ["todo","in_progress","done"].forEach(s=>{ const el=$(`#list-${s}`); if(el && !el.children.length){ const p=document.createElement("p"); p.className="empty"; p.textContent="Kart yok."; el.appendChild(p);} }); }
function cardTemplate(id,t){
  const d=document.createElement("div"); d.className="task-card"; d.dataset.taskId=id; d.setAttribute("draggable","true");
  d.innerHTML=`
    <div class="title">${t.title||"Untitled"}</div>
    <div class="meta">${new Date(t.createdAt||Date.now()).toLocaleString("tr-TR")}</div>
    <button class="icon-btn delete">×</button>`;
  d.querySelector(".delete").onclick=async()=>{ if(confirm("Bu kart silinsin mi?")) await remove(ref(db,`${BASE_PATH}/${id}`)); };
  return d;
}
function renderBoard(snap){
  clearLists();
  if(snap?.exists()){
    const tasks=snap.val();
    Object.entries(tasks).forEach(([id,t])=>{
      ($(`#list-${t.status||"todo"}`) || $("#list-todo"))?.appendChild(cardTemplate(id,t));
    });
  }
  bindDraggables(); emptyStates();
}
function listenBoard(){ onValue(ref(db,BASE_PATH), renderBoard); }
async function addQuickTask(){
  const title=$("#quickTaskTitle")?.value.trim(); if(!title) return;
  const status=$("#quickTaskStatus")?.value || "todo";
  await set(push(ref(db,BASE_PATH)), { title, status, createdAt: Date.now() });
  $("#quickTaskTitle").value="";
}

/* ===================== FEED ===================== */
const spaces={};           // { tsId: {name, members:{uid:{name,email}} } }
let feedItems={};
let unsubPosts=[];

const feedTeamSelect = $("#feedTeamSelect");
const reportInput    = $("#report-input");
const shareBtn       = $("#report-submit");
const tagBtn         = $("#tagBtn");
const tagPanel       = $("#tagPanel");
const tagList        = $("#tagList");
const tagChips       = $("#tagChips");
const composerName   = $("#composerName");
const composerAvatar = $("#composerAvatar");

let selectedTags = new Set();

function nameOf(user){ return user?.displayName || (user?.email ? user.email.split("@")[0] : "Kullanıcı"); }
function setComposerIdentity(){
  if (composerName) composerName.textContent = nameOf(USER);
  const initial = (composerName?.textContent||"?").trim().charAt(0).toUpperCase();
  if (composerAvatar) composerAvatar.textContent = initial || "?";
}

function escapeHtml(s){ 
  return (s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); 
}
function stopPostWatchers(){ unsubPosts.forEach(u=>{try{u();}catch{}}); unsubPosts=[]; }

/* ---- author name kaynağı ---- */
function authorNameOf(item){
  // 1) Post içinde sabit saklanan ad varsa onu kullan (bugfix)
  if (item.authorName) return item.authorName;

  const tsId = item.teamspaceId;
  const uid  = item.authorUid;

  // 2) Teamspace üyelerinden çek
  const nm = spaces[tsId]?.members?.[uid]?.name;
  if (nm) return nm;

  // 3) E-postadan türet
  if (item.authorEmail) return item.authorEmail.split("@")[0];

  // 4) Son çare: gönderinin sahibi ben isem kendi adım
  if (uid === USER?.uid) return nameOf(USER);

  return "Üye";
}

/* ---- Teamspace & üyeler ---- */
function populateTeamSelect(){
  if (!feedTeamSelect) return;
  feedTeamSelect.innerHTML = `<option value="" disabled ${!feedTeamSelect.value?'selected':''}>Teamspace</option>`;
  Object.entries(spaces).forEach(([id,info])=>{
    const o=document.createElement("option"); o.value=id; o.textContent=info.name||id;
    feedTeamSelect.appendChild(o);
  });
}
async function loadMembersFor(tsId){
  const s = await get(child(ref(db),`teamspaces/${tsId}/members`));
  const members = s.exists()? s.val() : {};
  spaces[tsId].members = {};
  await Promise.all(Object.keys(members).map(async uid=>{
    let nm=null, em=null;
    try{ const us = await get(child(ref(db),`users/${uid}`)); if(us.exists()){ nm=us.val().name||null; em=us.val().email||null; } }catch{}
    spaces[tsId].members[uid] = { name: nm || em || uid, email: em };
  }));
}
function buildTagPanel(tsId){
  if(!tagList) return;
  tagList.innerHTML=""; selectedTags.forEach(uid=>{ if(!(uid in (spaces[tsId]?.members||{}))) selectedTags.delete(uid); });
  const members = spaces[tsId]?.members || {};
  Object.entries(members).forEach(([uid,info])=>{
    const row=document.createElement("label");
    row.style.display="flex"; row.style.alignItems="center"; row.style.gap="8px";
    row.innerHTML=`<input type="checkbox" value="${uid}"> <span>${escapeHtml(info.name||uid)}</span>`;
    const cb=row.querySelector("input"); cb.checked = selectedTags.has(uid);
    cb.onchange=()=>{ cb.checked ? selectedTags.add(uid) : selectedTags.delete(uid); renderChips(); updateShareState(); };
    tagList.appendChild(row);
  });
}
function renderChips(){
  if(!tagChips) return;
  tagChips.innerHTML="";
  const tsId = feedTeamSelect?.value;
  selectedTags.forEach(uid=>{
    const span=document.createElement("span"); span.className="chip";
    const nm = spaces[tsId]?.members?.[uid]?.name || "üye";
    span.textContent = `@${nm}`;
    tagChips.appendChild(span);
  });
}

/* ---- LIKE / COMMENT yardımcıları ---- */
function likeCount(item){ return item.likes ? Object.keys(item.likes).length : 0; }
function commentCount(item){ return item.comments ? Object.keys(item.comments).length : 0; }
function isLikedByMe(item){ return !!(item.likes && item.likes[USER.uid]); }

async function toggleLike(tsId, postId, liked){
  const p = ref(db, `teamspaces/${tsId}/posts/${postId}/likes/${USER.uid}`);
  if(liked) await remove(p); else await set(p, true);
}
async function addComment(tsId, postId, text){
  const t = text.trim(); if(!t) return;
  const cRef = push(ref(db, `teamspaces/${tsId}/posts/${postId}/comments`));
  await set(cRef, {
    text: t,
    authorUid: USER.uid,
    createdAt: Date.now()
  });
}
/* ---- POST DELETE ---- */
async function deletePost(tsId, postId){
  const ok = confirm("Bu gönderiyi silmek istediğine emin misin?");
  if(!ok) return;
  await remove(ref(db, `teamspaces/${tsId}/posts/${postId}`));
}

/* ---- FEED render ---- */
function renderFeed(){
  const list = $("#feed-list");
  if(!list){ return; }
  list.innerHTML = "";

  const arr = Object.values(feedItems).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if (arr.length === 0){
    const p = document.createElement("div");
    p.className = "empty-hint";
    p.textContent = "Gönderi yok.";
    list.appendChild(p);
    return;
  }

  arr.forEach(item=>{
    const tsId = item.teamspaceId;
    const pid  = item._id;

    const liked   = isLikedByMe(item);
    const likeCnt = likeCount(item);
    const cmtCnt  = commentCount(item);

    const comments = item.comments
      ? Object.entries(item.comments).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0))
      : [];

    const author = authorNameOf(item); // yalnızca gönderenin adı

    const el = document.createElement("div");
    el.className = "post";
    el.innerHTML = `
      <div class="post-header">
        <strong>${escapeHtml(item.teamspaceName || tsId)}</strong>
        · <span class="author" style="color:#4E342E">${escapeHtml(author)}</span>
        · ${new Date(item.createdAt || Date.now()).toLocaleString("tr-TR")}
        ${item.authorUid===USER?.uid ? `<button class="action-btn" style="margin-left:auto" data-del="1">Sil</button>` : ""}
      </div>

      <div class="post-body">${escapeHtml(item.text || "")}</div>

      ${item.tags
        ? `<div class="post-tags" style="margin-top:6px;">
             ${Object.keys(item.tags).map(uid =>
                `<span class="chip">@${escapeHtml(spaces[tsId]?.members?.[uid]?.name || "üye")}</span>`
              ).join(" ")}
           </div>`
        : ""}

      <div class="post-actions" style="gap:8px">
        <button class="action-btn like-btn ${liked ? "active" : ""}" data-ts="${tsId}" data-id="${pid}">
          👍 <span class="like-count">${likeCnt}</span>
        </button>
        <button class="action-btn cmt-toggle" data-ts="${tsId}" data-id="${pid}">
          Yorumlar (<span class="cmt-count">${cmtCnt}</span>)
        </button>
      </div>

      <div class="comment-section hidden" id="c-${tsId}-${pid}">
        <div class="comment-list">
          ${comments.map(([cid,c])=>{
            const nm = spaces[tsId]?.members?.[c.authorUid]?.name || "üye";
            const dt = new Date(c.createdAt||Date.now()).toLocaleString("tr-TR");
            return `<div class="comment-item" style="background:#faf7f4;border:1px solid #e8e3df;border-radius:12px;padding:8px 10px;margin:6px 0">
                      <div class="meta"><strong>${escapeHtml(nm)}</strong> · ${dt}</div>
                      <div>${escapeHtml(c.text || "")}</div>
                    </div>`;
          }).join("")}
        </div>
        <div class="comment-form" style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <input type="text" class="comment-input" placeholder="Yorum yaz…" style="flex:1;border:1px solid #e8e3df;border-radius:999px;padding:10px 14px" />
          <button class="btn primary add-comment" data-ts="${tsId}" data-id="${pid}">Gönder</button>
        </div>
      </div>
    `;

    // like
    el.querySelector(".like-btn")?.addEventListener("click", async (e)=>{
      const btn = e.currentTarget;
      const isLiked = btn.classList.contains("active");
      await toggleLike(tsId, pid, isLiked);
      btn.classList.toggle("active", !isLiked);
      const badge = btn.querySelector(".like-count");
      const cur = parseInt(badge.textContent||"0",10);
      badge.textContent = String(isLiked ? Math.max(0,cur-1) : cur+1);
    });

    // yorum aç/kapa
    el.querySelector(".cmt-toggle")?.addEventListener("click", ()=>{
      el.querySelector(`#c-${tsId}-${pid}`)?.classList.toggle("hidden");
    });

    // yorum gönder
    const sendBtn = el.querySelector(".add-comment");
    const input   = el.querySelector(".comment-input");
    sendBtn?.addEventListener("click", async ()=>{
      const txt = input.value.trim(); if(!txt) return;
      await addComment(tsId, pid, txt);
      input.value = "";
      const badge = el.querySelector(".cmt-toggle .cmt-count");
      if (badge) badge.textContent = String(parseInt(badge.textContent||"0",10)+1);
    });
    input?.addEventListener("keydown",(ev)=>{
      if(ev.key==="Enter" && !ev.shiftKey){ ev.preventDefault(); sendBtn.click(); }
    });

    // silme
    el.querySelector("[data-del]")?.addEventListener("click", ()=> deletePost(tsId, pid));

    list.appendChild(el);
  });
}


/* ---- posts watcher ---- */
function attachPostWatchers(){
  stopPostWatchers(); feedItems={};
  Object.keys(spaces).forEach(tsId=>{
    const unsub = onValue(ref(db,`teamspaces/${tsId}/posts`),(snap)=>{
      for(const k of Object.keys(feedItems)){ if(feedItems[k].teamspaceId===tsId) delete feedItems[k]; }
      if(snap.exists()){
        const v=snap.val();
        for(const [pid,p] of Object.entries(v)){
          feedItems[`${tsId}__${pid}`]={...p,_id:pid,teamspaceId:tsId,teamspaceName:spaces[tsId]?.name||tsId};
        }
      }
      renderFeed();
    });
    unsubPosts.push(unsub);
  });
}

/* ---- memberships ---- */
function watchMemberships(){
  onValue(ref(db,"teamspaces"), async (snap)=>{
    const mine={};
    if(snap.exists()){
      const all=snap.val();
      for(const [id,ts] of Object.entries(all)){
        if((ts.members && ts.members[USER.uid]) || ts.createdBy===USER.uid){
          mine[id]={ name: ts.name || id };
        }
      }
    }
    // merge
    for(const k of Object.keys(spaces)){ if(!mine[k]) delete spaces[k]; }
    for(const k of Object.keys(mine)){ spaces[k]=mine[k]; }
    populateTeamSelect();
    await Promise.all(Object.keys(spaces).map(loadMembersFor));
    attachPostWatchers();
    if(feedTeamSelect?.value){ buildTagPanel(feedTeamSelect.value); renderChips(); }
  });
}

/* ---- Composer etkileşimleri ---- */
function updateShareState(){
  if(!shareBtn || !reportInput) return;
  const text = reportInput.value.trim();
  const tsOk = !!feedTeamSelect?.value;
  shareBtn.disabled = !(tsOk && text.length>0);
}

tagBtn?.addEventListener("click", ()=>{
  if(!feedTeamSelect?.value){ alert("Önce bir teamspace seç."); return; }
  tagPanel?.classList.toggle("hidden");
});
document.addEventListener("click",(e)=>{
  if(tagPanel && !tagPanel.contains(e.target) && !tagBtn?.contains(e.target)){ tagPanel.classList.add("hidden"); }
});
feedTeamSelect?.addEventListener("change", ()=>{
  selectedTags.clear(); renderChips();
  buildTagPanel(feedTeamSelect.value);
  updateShareState();
});
reportInput?.addEventListener("input", updateShareState);

async function submitReport(){
  const tsId = feedTeamSelect?.value;
  const text = reportInput?.value.trim();
  if(!tsId || !text) return;

  const pRef = push(ref(db,`teamspaces/${tsId}/posts`));
  const tagsObj = {}; selectedTags.forEach(uid=> tagsObj[uid]=true);

  await set(pRef,{
    text,
    tags: Object.keys(tagsObj).length ? tagsObj : null,
    createdAt: Date.now(),
    authorUid: USER.uid,
    authorEmail: USER.email || null,
    authorName: nameOf(USER)           // BUGFIX: gönderildiği anda ismi sabitle
  });

  // mention bildirimi
  for(const uid of selectedTags){
    await set(push(ref(db,`user_notifications/${uid}`)),{
      type:"mention",
      text:`${USER.email||"Bir kullanıcı"} seni ${spaces[tsId]?.name||"teamspace"} gönderisinde etiketledi.`,
      createdAt: Date.now(), read:false
    });
  }

  // temizle
  if(reportInput){ reportInput.value=""; }
  selectedTags.clear(); renderChips(); updateShareState(); tagPanel?.classList.add("hidden");
}
shareBtn?.addEventListener("click", submitReport);
reportInput?.addEventListener("keydown",(e)=>{ if((e.ctrlKey||e.metaKey)&&e.key==="Enter") submitReport(); });

/* ===================== BOOT ===================== */
onAuthStateChanged(auth, async user=>{
  if(!user){ location.href="index.html"; return; }
  USER=user; BASE_PATH=`tasks/${user.uid}`;

  setComposerIdentity();
  initTopbar();
  attachViewEvents();
  setActiveView("feed");

  // Board
  listenBoard();
  dragAndDropForTasksGeneric(db, BASE_PATH);
  $("#quickTaskAdd")?.addEventListener("click", addQuickTask);

  // Feed
  watchMemberships();
});
