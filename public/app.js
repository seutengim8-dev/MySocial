const $=id=>document.getElementById(id);let me=null,users=[],active=null,groups=[],activeGroup=null,poll,rtc=null,callId=null,callRole=null,remoteIceSeen=0,muted=false,seenIncoming=null;
async function api(url,opt={}){let r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"요청 실패");return d}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(t){$("toasts").textContent=t;$("toasts").className="toast";setTimeout(()=>$("toasts").className="",2500)}
function enter(){ $("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("topName").textContent=me.display_name;$("meName").textContent=me.display_name;refresh();clearInterval(poll);poll=setInterval(()=>{refresh(false);if(active)loadDM();else if(activeGroup)chooseGroup(activeGroup);else if($("chatTitle").textContent==="나와의 채팅")loadSelfNotes();heartbeat();checkCallInbox();syncCall();refreshPresence()},2500)}
async function refresh(){try{let [u,g]=await Promise.all([api("/api/users"),api("/api/groups")]);users=u.users;groups=g.groups;renderUsers();renderGroups();renderRecent()}catch{}}
async function login(){try{me=(await api("/api/login",{method:"POST",body:JSON.stringify({email:$("email").value,password:$("password").value})})).user;enter()}catch(e){$("authMsg").textContent=e.message}}
$("signIn").onclick=login;$("signUp").onclick=async()=>{try{me=(await api("/api/register",{method:"POST",body:JSON.stringify({email:$("email").value,password:$("password").value,displayName:$("displayName").value})})).user;enter()}catch(e){$("authMsg").textContent=e.message}};
$("logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
function renderUsers(){let term=$("userSearch").value.toLowerCase();$("userList").innerHTML=users.filter(u=>u.display_name.toLowerCase().includes(term)).map(u=>`<div class="userrow" data-u="${u.id}"><div class="avatar">${esc(u.profile?.avatar_emoji||u.display_name[0])}</div><div class="meta"><strong>${esc(u.display_name)}</strong><small class="preview">${onlineIds?.has(u.id)?"🟢 온라인":"⚪ 오프라인"} · ${esc(u.profile?.bio||"대화 시작하기")}</small></div></div>`).join("")||'<p class="sub">검색 결과가 없어.</p>';document.querySelectorAll("[data-u]").forEach(x=>x.onclick=()=>choose(users.find(u=>u.id===x.dataset.u)))}
$("userSearch").oninput=renderUsers;
function renderGroups(){$("groupList").innerHTML=groups.map(g=>`<div class="userrow" data-g="${g.id}">👥 ${esc(g.name)}</div>`).join("")||'<p class="sub">그룹이 없어.</p>';document.querySelectorAll("[data-g]").forEach(x=>x.onclick=()=>chooseGroup(groups.find(g=>g.id===x.dataset.g)))}
async function renderRecent(){let out=[];for(const u of users){try{let ms=(await api("/api/messages/"+u.id)).messages,m=ms.at(-1);if(m)out.push({u,m})}catch{}}$("conversationList").innerHTML=out.sort((a,b)=>b.m.created_at.localeCompare(a.m.created_at)).map(x=>`<div class="userrow" data-r="${x.u.id}"><div class="avatar">${esc(x.u.display_name[0])}</div><div class="meta"><strong>${esc(x.u.display_name)}</strong><small class="preview">${esc(x.m.content)}</small></div></div>`).join("")||"대화가 아직 없어.";document.querySelectorAll("[data-r]").forEach(x=>x.onclick=()=>choose(users.find(u=>u.id===x.dataset.r)))}
async function choose(u){active=u;activeGroup=null;$("chatTitle").textContent=u.display_name;$("chatSub").textContent=u.role==="admin"?"운영자":"메시지";["friendBtn","blockBtn","reportBtn","callBtn"].forEach(x=>$(x).classList.remove("hidden"));$("messageInput").disabled=$("sendBtn").disabled=$("attachBtn").disabled=false;await loadDM()}
async function chooseGroup(g){activeGroup=g;active=null;$("chatTitle").textContent="👥 "+g.name;$("chatSub").textContent=g.members.length+"명";["friendBtn","blockBtn","reportBtn","callBtn"].forEach(x=>$(x).classList.add("hidden"));$("attachBtn").disabled=true;$("messageInput").disabled=$("sendBtn").disabled=false;let d=await api(`/api/groups/${g.id}/messages`);paint(d.messages,true)}
async function loadDM(){if(!active)return;paint((await api("/api/messages/"+active.id)).messages)}
function paint(rows,group=false){$("messages").innerHTML=rows.map(m=>`<div class="bubble ${(group?m.sender:m.from)===me.id?"mine":""}" data-mid="${m.id}">${m.deleted_at?"삭제된 메시지입니다":esc(m.content)}${m.file?`<br><a href="${esc(m.file.url)}" target="_blank">📎 ${esc(m.file.name)}</a>`:""}<time>${new Date(m.created_at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</time><div>${(m.reactions||[]).map(r=>`<button class="ghost mini" data-react="${m.id}" data-e="${r.emoji}">${r.emoji}</button>`).join("")}<button class="ghost mini" data-add="${m.id}">＋</button>${m.from===me.id?`<button class="ghost mini" data-edit="${m.id}">수정</button><button class="ghost mini" data-del="${m.id}">🗑️</button>`:""}</div></div>`).join("")||'<div class="empty">아직 메시지가 없어. 첫 메시지를 보내 봐!</div>';$("messages").scrollTop=$("messages").scrollHeight;document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{let e=prompt("반응 이모지","❤️");if(e)api(`/api/messages/${b.dataset.add}/react`,{method:"POST",body:JSON.stringify({emoji:e})}).then(loadDM)});document.querySelectorAll("[data-react]").forEach(b=>b.onclick=()=>api(`/api/messages/${b.dataset.react}/react`,{method:"POST",body:JSON.stringify({emoji:b.dataset.e})}).then(loadDM));document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>confirm("삭제할까?")&&api("/api/messages/"+b.dataset.del,{method:"DELETE"}).then(loadDM));document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=async()=>{let current=rows.find(m=>m.id===b.dataset.edit),content=prompt("메시지 수정",current?.content||"");if(content===null||!content.trim())return;try{await api("/api/messages/"+b.dataset.edit,{method:"PATCH",body:JSON.stringify({content})});loadDM()}catch(e){toast(e.message)}})}
$("composer").onsubmit=async e=>{e.preventDefault();let content=$("messageInput").value.trim();if(!content)return;if(activeGroup)await api(`/api/groups/${activeGroup.id}/messages`,{method:"POST",body:JSON.stringify({content})});else if(active)await api("/api/messages",{method:"POST",body:JSON.stringify({to:active.id,content})});else return;$("messageInput").value="";activeGroup?chooseGroup(activeGroup):loadDM()};
$("friendBtn").onclick=async()=>{try{await api("/api/friends/"+active.id,{method:"POST"});toast("친구 요청을 보냈어.")}catch(e){toast(e.message)}};
$("blockBtn").onclick=async()=>{if(active&&confirm("차단할까?")){await api("/api/blocks/"+active.id,{method:"POST"});active=null;refresh();$("messages").innerHTML=""}};
$("reportBtn").onclick=async()=>{let reason=prompt("신고 사유");if(reason)await api("/api/reports",{method:"POST",body:JSON.stringify({userId:active.id,reason})}).then(()=>toast("신고 접수 완료"))};
$("newGroupBtn").onclick=()=>{$("gmList").innerHTML=users.map(u=>`<label class="userrow"><input type="checkbox" value="${u.id}" style="width:auto">${esc(u.display_name)}</label>`).join("");$("groupModal").classList.remove("hidden")};$("gmCancel").onclick=()=>$("groupModal").classList.add("hidden");$("gmOk").onclick=async()=>{try{let members=[...$("gmList").querySelectorAll("input:checked")].map(x=>x.value),g=(await api("/api/groups",{method:"POST",body:JSON.stringify({name:$("gmName").value,members})})).group;$("groupModal").classList.add("hidden");refresh();chooseGroup(g)}catch(e){$("gmMsg").textContent=e.message}};
$("editProfile").onclick=$("railProfile").onclick=()=>{$("pfName").value=me.display_name;$("pfBio").value=me.profile?.bio||"";$("pfEmoji").value=me.profile?.avatar_emoji||"";$("profileModal").classList.remove("hidden")};$("pfCancel").onclick=()=>$("profileModal").classList.add("hidden");$("pfSave").onclick=async()=>{try{me=(await api("/api/profile",{method:"PATCH",body:JSON.stringify({display_name:$("pfName").value,profile:{bio:$("pfBio").value,avatar_emoji:$("pfEmoji").value}})})).user;$("profileModal").classList.add("hidden");$("meName").textContent=me.display_name;$("topName").textContent=me.display_name;toast("프로필 저장 완료")}catch(e){$("pfMsg").textContent=e.message}};
$("selfChatEntry").onclick=()=>{$("chatTitle").textContent="나와의 채팅";$("chatSub").textContent="개인 메모";$("messages").innerHTML='<div class="empty">나와의 채팅은 다음 단계에서 서버 저장 기능으로 연결할게.</div>';active=null;activeGroup=null;$("messageInput").disabled=$("sendBtn").disabled=true};
$("railChat").onclick=()=>{$("sidePanel").classList.remove("hidden");$("chatPanel").classList.remove("hidden");$("reelsView").classList.add("hidden")};
$("railReels").onclick=async()=>{$("sidePanel").classList.add("hidden");$("chatPanel").classList.add("hidden");$("reelsView").classList.remove("hidden");let d=await api("/api/reels");$("reelFeed").innerHTML=d.reels.map(r=>`<article class="reel"><video src="${r.url}" controls></video><p>${esc(r.caption)}</p><button class="ghost mini" data-like="${r.id}">❤️ ${r.likes.length}</button></article>`).join("")||'<div class="empty">아직 릴스가 없어.</div>';document.querySelectorAll("[data-like]").forEach(b=>b.onclick=()=>api("/api/reels/"+b.dataset.like+"/like",{method:"POST"}).then(()=> $("railReels").click()))};
$("railFriends").onclick=async()=>{let f=(await api("/api/friends")).friendships;toast(f.length?`친구 요청/친구 ${f.length}건`:"아직 친구가 없어.")};
$("notifyBtn").onclick=$("railNotify").onclick=()=>toast("알림은 메시지 확인 주기(2.5초)로 갱신돼.");
$("attachBtn").onclick=()=>$("fileInput").click();$("fileInput").onchange=async()=>{let f=$("fileInput").files[0];if(!f||!active)return;let fd=new FormData();fd.append("file",f);let r=await fetch("/api/upload",{method:"POST",body:fd}),d=await r.json();if(!r.ok)return toast(d.error);await api("/api/messages",{method:"POST",body:JSON.stringify({to:active.id,content:"📎 "+f.name,file:{url:d.url,name:f.name}})});loadDM()};
$("reelUpload").onclick=()=>$("reelModal").classList.remove("hidden");$("reelCancel").onclick=()=>$("reelModal").classList.add("hidden");$("reelOk").onclick=async()=>{let f=$("reelFile").files[0];if(!f)return toast("영상을 선택해 줘.");let fd=new FormData();fd.append("video",f);fd.append("caption",$("reelCaption").value);let r=await fetch("/api/reels",{method:"POST",body:fd}),d=await r.json();if(!r.ok)return toast(d.error);$("reelModal").classList.add("hidden");$("railReels").click()};
(async()=>{try{me=(await api("/api/me")).user;enter()}catch{$("authView").classList.remove("hidden")}})();

// Peer-to-peer browser voice calls (microphone permission required)
async function heartbeat(){try{await api("/api/presence",{method:"POST"})}catch{}}
async function makePeer(){
 rtc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
 const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
 stream.getTracks().forEach(t=>rtc.addTrack(t,stream));
 rtc.ontrack=e=>$("remoteAudio").srcObject=e.streams[0];
 rtc.onicecandidate=e=>{if(e.candidate&&callId)api(`/api/calls/${callId}/ice`,{method:"POST",body:JSON.stringify({candidate:e.candidate})}).catch(()=>{})};
}
$("callBtn").onclick=async()=>{
 if(!active)return;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error("마이크는 localhost 또는 HTTPS에서 사용할 수 있어.");
  await makePeer();let offer=await rtc.createOffer();await rtc.setLocalDescription(offer);
  let d=await api("/api/calls",{method:"POST",body:JSON.stringify({to:active.id,offer:rtc.localDescription})});
  callId=d.call.id;callRole="caller";remoteIceSeen=0;
  $("callTitle").textContent=active.display_name+"에게 전화 중";$("callStatus").textContent="상대방 응답을 기다리는 중...";$("callModal").classList.remove("hidden");
 }catch(e){toast(e.message);if(rtc){rtc.close();rtc=null}}
};
async function checkCallInbox(){
 if(callId)return;
 try{
  let c=(await api("/api/calls/inbox")).call;if(!c||c.id===seenIncoming)return;seenIncoming=c.id;
  let caller=users.find(u=>u.id===c.from);
  if(!confirm((caller?.display_name||"사용자")+" 님의 음성 통화야. 받을까?")){await api(`/api/calls/${c.id}`,{method:"PATCH",body:JSON.stringify({status:"rejected"})});return}
  if(!navigator.mediaDevices?.getUserMedia)throw Error("마이크는 localhost 또는 HTTPS에서 사용할 수 있어.");
  callId=c.id;callRole="callee";remoteIceSeen=0;await makePeer();
  await rtc.setRemoteDescription(new RTCSessionDescription(c.offer));
  let answer=await rtc.createAnswer();await rtc.setLocalDescription(answer);
  await api(`/api/calls/${callId}`,{method:"PATCH",body:JSON.stringify({status:"accepted",answer:rtc.localDescription})});
  $("callTitle").textContent=(caller?.display_name||"사용자")+" 님과 통화 중";$("callStatus").textContent="연결 중...";$("callModal").classList.remove("hidden");
 }catch(e){toast(e.message);if(callId)hangup()}
}
async function syncCall(){
 if(!callId||!rtc)return;
 try{
  let c=(await api(`/api/calls/${callId}`)).call;
  if(["rejected","ended"].includes(c.status)){toast(c.status==="rejected"?"상대방이 전화를 거절했어.":"통화가 종료됐어.");hangup(false);return}
  if(callRole==="caller"&&c.answer&&!rtc.currentRemoteDescription)await rtc.setRemoteDescription(new RTCSessionDescription(c.answer));
  let ice=callRole==="caller"?c.toIce:c.fromIce;
  while(remoteIceSeen<ice.length){try{await rtc.addIceCandidate(new RTCIceCandidate(ice[remoteIceSeen]))}catch{}remoteIceSeen++}
  $("callStatus").textContent=rtc.connectionState==="connected"?"통화 연결됨 🎙️":"상대방과 연결 중...";
 }catch{}
}
async function hangup(notify=true){
 let old=callId;if(notify&&old)try{await api(`/api/calls/${old}`,{method:"PATCH",body:JSON.stringify({status:"ended"})})}catch{}
 if(rtc){rtc.getSenders().forEach(x=>x.track?.stop());rtc.close();rtc=null}
 callId=null;callRole=null;$("remoteAudio").srcObject=null;$("callModal").classList.add("hidden");muted=false;
}
$("hangupBtn").onclick=()=>hangup();
$("muteBtn").onclick=()=>{if(!rtc)return;muted=!muted;rtc.getSenders().forEach(x=>{if(x.track?.kind==="audio")x.track.enabled=!muted});$("muteBtn").textContent=muted?"마이크 켜기":"마이크 음소거"};

// MySocial 4.0: online list, friend inbox, browser notifications, and saved self-chat
let onlineIds=new Set(),knownUnread=new Set();
async function refreshPresence(){try{let d=await api("/api/presence");onlineIds=new Set(d.online);renderUsers()}catch{}}
async function loadFriends(){
 try{
  let d=await api("/api/friends"),pending=d.friendships.filter(f=>f.to===me.id&&f.status==="pending");
  $("friendRequests").innerHTML=pending.map(f=>{let u=users.find(x=>x.id===f.from);return `<div class="userrow"><span>${esc(u?.display_name||"사용자")}</span><button class="mini" data-accept="${f.id}">수락</button><button class="ghost mini" data-reject="${f.id}">거절</button></div>`}).join("")||"새 친구 요청이 없어.";
  let accepted=d.friendships.filter(f=>f.status==="accepted").map(f=>users.find(u=>u.id===(f.from===me.id?f.to:f.from))).filter(Boolean);
  $("friendsList").innerHTML=accepted.map(u=>`<div class="userrow" data-friend="${u.id}">👤 ${esc(u.display_name)}</div>`).join("")||'<span class="sub">아직 친구가 없어.</span>';
  document.querySelectorAll("[data-accept]").forEach(b=>b.onclick=async()=>{await api("/api/friends/"+b.dataset.accept,{method:"PATCH",body:JSON.stringify({status:"accepted"})});loadFriends();toast("친구가 되었어!")});
  document.querySelectorAll("[data-reject]").forEach(b=>b.onclick=async()=>{await api("/api/friends/"+b.dataset.reject,{method:"PATCH",body:JSON.stringify({status:"rejected"})});loadFriends()});
  document.querySelectorAll("[data-friend]").forEach(b=>b.onclick=()=>choose(users.find(u=>u.id===b.dataset.friend)));
 }catch(e){console.warn(e)}
}
$("friendRequestsBtn").onclick=loadFriends;
$("selfChatEntry").onclick=async()=>{
 active=null;activeGroup=null;$("chatTitle").textContent="나와의 채팅";$("chatSub").textContent="나만 볼 수 있는 개인 메모";["friendBtn","blockBtn","reportBtn","callBtn"].forEach(x=>$(x).classList.add("hidden"));
 $("messageInput").disabled=$("sendBtn").disabled=false;$("attachBtn").disabled=true;
 await loadSelfNotes();
};
async function loadSelfNotes(){let d=await api("/api/self-messages");$("messages").innerHTML=d.messages.map(m=>`<div class="bubble mine">${esc(m.content)}<time>${new Date(m.created_at).toLocaleString("ko-KR")}</time></div>`).join("")||'<div class="empty">나만 볼 수 있는 메모장이야. 생각을 기록해 봐!</div>';$("messages").scrollTop=$("messages").scrollHeight}
const originalSubmit=$("composer").onsubmit;
$("composer").onsubmit=async e=>{
 if($("chatTitle").textContent==="나와의 채팅"){e.preventDefault();let content=$("messageInput").value.trim();if(!content)return;try{await api("/api/self-messages",{method:"POST",body:JSON.stringify({content})});$("messageInput").value="";await loadSelfNotes()}catch(err){toast(err.message)}return}
 return originalSubmit(e)
};
$("notifyBtn").onclick=async()=>{
 if(!("Notification" in window)){toast("이 브라우저는 알림을 지원하지 않아.");return}
 let p=await Notification.requestPermission();toast(p==="granted"?"새 메시지 알림을 켰어.":"알림 권한이 허용되지 않았어.")
};
async function checkMessageNotifications(){
 if(!me||!("Notification" in window)||Notification.permission!=="granted")return;
 for(const u of users){try{let rows=(await api("/api/messages/"+u.id)).messages;let latest=rows.filter(m=>m.to===me.id&&Date.now()-new Date(m.created_at).getTime()<20000).at(-1);if(latest&&!knownUnread.has(latest.id)){knownUnread.add(latest.id);if(!active||active.id!==u.id)new Notification(u.display_name+"님의 새 메시지",{body:latest.content||"첨부 파일"})}}catch{}}
}
const priorRefresh=refresh;
refresh=async(...args)=>{await priorRefresh(...args);await refreshPresence();await loadFriends();await checkMessageNotifications()};
