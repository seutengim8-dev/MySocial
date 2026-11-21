const express=require("express"),session=require("express-session"),helmet=require("helmet"),bcrypt=require("bcryptjs"),fs=require("fs"),path=require("path"),crypto=require("crypto"),multer=require("multer"),{Pool}=require("pg"),connectPgSimple=require("connect-pg-simple"),rateLimit=require("express-rate-limit");
const app=express(),PORT=process.env.PORT||3000,DATA=path.join(__dirname,"data"),PUB=path.join(__dirname,"public");
let webpush=null,admin=null,apn=null;
try{webpush=require("web-push");}catch{}
try{admin=require("firebase-admin");}catch{}
try{apn=require("apn");}catch{}
const vapidReady=!!(webpush&&process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY);
if(vapidReady)webpush.setVapidDetails(process.env.VAPID_SUBJECT||"mailto:admin@example.com",process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
let firebaseApp=null,apnProvider=null;
try{
  if(admin&&process.env.FIREBASE_SERVICE_ACCOUNT_BASE64){
    const serviceAccount=JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,"base64").toString("utf8"));
    firebaseApp=admin.apps.length?admin.app():admin.initializeApp({credential:admin.credential.cert(serviceAccount)});
  }
}catch(e){console.error("Firebase Admin 초기화 실패:",e.message)}
try{
  if(apn&&process.env.APNS_KEY_BASE64&&process.env.APNS_KEY_ID&&process.env.APNS_TEAM_ID){
    apnProvider=new apn.Provider({token:{key:Buffer.from(process.env.APNS_KEY_BASE64,"base64").toString("utf8"),keyId:process.env.APNS_KEY_ID,teamId:process.env.APNS_TEAM_ID},production:process.env.APNS_PRODUCTION==="true"});
  }
}catch(e){console.error("APNs 초기화 실패:",e.message)}
function sendPush(userId,payload){
  if(vapidReady)for(const sub of db.pushSubscriptions.filter(x=>x.user===userId)){
    const options=payload.kind==="incoming-call"?{TTL:60,urgency:"high"}:{TTL:3600,urgency:"normal"};
    webpush.sendNotification(sub.subscription,JSON.stringify(payload),options).catch(async e=>{
      if(e.statusCode===404||e.statusCode===410){db.pushSubscriptions=db.pushSubscriptions.filter(x=>x.id!==sub.id);await save("pushSubscriptions");}
      else console.error("Web Push 전송 실패:",e.message);
    });
  }
  const devices=db.deviceTokens.filter(x=>x.user===userId);
  for(const device of devices){
    if(device.platform==="android"&&firebaseApp){
      const data={kind:String(payload.kind||"message"),title:String(payload.title||"MySocial"),body:String(payload.body||"새 알림이 도착했어."),url:String(payload.url||"/"),tag:String(payload.tag||"mysocial"),callId:String(payload.callId||"")};
      admin.messaging(firebaseApp).send({token:device.token,data,android:{priority:payload.kind==="incoming-call"?"high":"normal",ttl:payload.kind==="incoming-call"?60000:3600000}}).catch(async e=>{
        if(["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(e.code)){db.deviceTokens=db.deviceTokens.filter(x=>x.id!==device.id);await save("deviceTokens");}
        else console.error("FCM 전송 실패:",e.message);
      });
    }
    if(device.platform==="ios"&&apnProvider){
      const isVoip=payload.kind==="incoming-call"&&device.voipToken;
      const token=isVoip?device.voipToken:device.token;
      const note=new apn.Notification();
      note.topic=process.env.IOS_BUNDLE_ID||"com.seutengim8.mysocial";
      note.expiry=Math.floor(Date.now()/1000)+(isVoip?60:3600);
      note.priority=isVoip?10:(payload.kind==="incoming-call"?10:5);
      note.pushType=isVoip?"voip":"alert";
      note.payload={...payload,kind:payload.kind||"message"};
      if(isVoip){note.topic+=".voip";note.contentAvailable=1;note.sound="default";}
      else {note.alert={title:payload.title||"MySocial",body:payload.body||"새 알림이 도착했어."};note.sound="default";}
      apnProvider.send(note,token).then(result=>{
        for(const failure of result.failed||[])if(failure.response?.reason==="Unregistered"){
          db.deviceTokens=db.deviceTokens.filter(x=>x.id!==device.id);save("deviceTokens");
        }
      }).catch(e=>console.error("APNs 전송 실패:",e.message));
    }
  }
}
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(path.join(PUB,"uploads"),{recursive:true});
const keys=["users","messages","friends","groups","groupMessages","reports","blocks","reels","calls","presence","selfMessages","alarms","pushSubscriptions","deviceTokens"],db={};
for(const k of keys){const f=path.join(DATA,k+".json");if(!fs.existsSync(f))fs.writeFileSync(f,"[]");db[k]=JSON.parse(fs.readFileSync(f,"utf8"));}
const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),clean=(v,n=2000)=>typeof v==="string"?v.trim().slice(0,n):"";
const production=process.env.NODE_ENV==="production",databaseUrl=process.env.DATABASE_URL;
if(production&&!process.env.SESSION_SECRET)throw new Error("SESSION_SECRET 환경변수가 필요합니다.");
if(production&&!databaseUrl)throw new Error("공개 배포에는 DATABASE_URL(PostgreSQL)이 필요합니다.");
const pool=databaseUrl?new Pool({connectionString:databaseUrl,ssl:process.env.DATABASE_SSL==="disable"?false:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
const saveQueues={};
const save=k=>{
  const snapshot=JSON.stringify(db[k],null,2);
  if(!pool){fs.writeFileSync(path.join(DATA,k+".json"),snapshot);return Promise.resolve();}
  saveQueues[k]=(saveQueues[k]||Promise.resolve()).then(()=>pool.query("INSERT INTO mysocial_data (collection, payload, updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (collection) DO UPDATE SET payload=EXCLUDED.payload, updated_at=NOW()",[k,JSON.stringify(db[k])])).catch(err=>{console.error("DB 저장 실패:",k,err.message);});
  return saveQueues[k];
};
async function initStorage(){
  if(!pool)return;
  await pool.query("CREATE TABLE IF NOT EXISTS mysocial_data (collection TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  for(const k of keys){
    const found=await pool.query("SELECT payload FROM mysocial_data WHERE collection=$1",[k]);
    if(found.rowCount){db[k]=found.rows[0].payload;}
    else {await pool.query("INSERT INTO mysocial_data(collection,payload) VALUES($1,$2::jsonb)",[k,JSON.stringify(db[k])]);}
  }
}
const cloudinaryEnabled=!!(process.env.CLOUDINARY_CLOUD_NAME&&process.env.CLOUDINARY_API_KEY&&process.env.CLOUDINARY_API_SECRET);
let cloudinary=null;
if(cloudinaryEnabled){cloudinary=require("cloudinary").v2;cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});}
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"2mb"}));app.use(express.urlencoded({extended:false}));
app.set("trust proxy",1);
const PgSession=connectPgSimple(session);
app.use(session({name:"mysocial.sid",store:pool?new PgSession({pool,tableName:"mysocial_sessions",createTableIfMissing:true}):undefined,secret:process.env.SESSION_SECRET||"mysocial-local-only-change-this-secret-4-0",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:production,maxAge:86400000}}));
app.use(express.static(PUB));
const upload=multer({storage:cloudinaryEnabled?multer.memoryStorage():multer.diskStorage({destination:(q,f,cb)=>cb(null,path.join(PUB,"uploads")),filename:(q,f,cb)=>cb(null,crypto.randomUUID()+path.extname(f.originalname).slice(0,12))}),limits:{fileSize:30*1024*1024}});
function storeUpload(file,resourceType="image"){
  if(cloudinaryEnabled)return new Promise((resolve,reject)=>{const stream=cloudinary.uploader.upload_stream({resource_type:resourceType,folder:"mysocial"},(err,result)=>err?reject(err):resolve({url:result.secure_url,name:file.originalname}));stream.end(file.buffer);});
  return Promise.resolve({url:"/uploads/"+file.filename,name:file.originalname});
}
const authLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"요청이 너무 많아. 잠시 후 다시 시도해 줘."}});
const safe=u=>({id:u.id,email:u.email,display_name:u.display_name,role:u.role,profile:u.profile||{}});
function auth(q,s,n){q.user=db.users.find(u=>u.id===q.session.uid);if(!q.user)return s.status(401).json({error:"로그인이 필요해."});n()}
app.get("/api/health",(q,s)=>s.json({ok:true,storage:pool?"postgresql":"local-json",media:cloudinaryEnabled?"cloudinary":"local-disk"}));
app.post("/api/register",authLimiter,async(q,s)=>{let email=clean(q.body.email,120).toLowerCase(),pw=q.body.password||"";if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return s.status(400).json({error:"이메일을 확인해 줘."});if(pw.length<8||pw.length>72)return s.status(400).json({error:"비밀번호는 8~72자여야 해."});if(db.users.some(u=>u.email===email))return s.status(409).json({error:"이미 가입된 이메일이야."});let u={id:id(),email,passwordHash:await bcrypt.hash(pw,12),display_name:clean(q.body.displayName,30)||email.split("@")[0],role:"user",profile:{bio:"",avatar_emoji:"",theme:0},created_at:now()};db.users.push(u);save("users");q.session.uid=u.id;s.status(201).json({user:safe(u)});});
app.post("/api/login",authLimiter,async(q,s)=>{let u=db.users.find(x=>x.email===clean(q.body.email,120).toLowerCase());if(!u||!await bcrypt.compare(q.body.password||"",u.passwordHash))return s.status(401).json({error:"이메일 또는 비밀번호가 맞지 않아."});q.session.uid=u.id;s.json({user:safe(u)});});
app.post("/api/logout",(q,s)=>q.session.destroy(()=>s.json({ok:true})));
app.get("/api/me",(q,s)=>auth(q,s,()=>s.json({user:safe(q.user)})));
app.get("/api/push/public-key",(q,s)=>s.json({enabled:vapidReady,publicKey:vapidReady?process.env.VAPID_PUBLIC_KEY:null}));
app.get("/api/rtc/config",(q,s)=>s.json({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"},...(process.env.TURN_URLS&&process.env.TURN_USERNAME&&process.env.TURN_CREDENTIAL?[{urls:process.env.TURN_URLS.split(",").map(x=>x.trim()),username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL}]:[])]}));
app.post("/api/push/subscribe",(q,s)=>auth(q,s,()=>{if(!vapidReady)return s.status(503).json({error:"서버 푸시 설정이 아직 완료되지 않았어."});const sub=q.body.subscription;if(!sub||!sub.endpoint||!sub.keys)return s.status(400).json({error:"푸시 구독 정보가 올바르지 않아."});db.pushSubscriptions=db.pushSubscriptions.filter(x=>!(x.user===q.user.id&&x.subscription?.endpoint===sub.endpoint));db.pushSubscriptions.push({id:id(),user:q.user.id,subscription:sub,created_at:now()});save("pushSubscriptions");s.json({ok:true})}));
app.delete("/api/push/subscribe",(q,s)=>auth(q,s,()=>{const endpoint=q.body.endpoint;db.pushSubscriptions=db.pushSubscriptions.filter(x=>!(x.user===q.user.id&&x.subscription?.endpoint===endpoint));save("pushSubscriptions");s.json({ok:true})}));
// Native device registration: FCM token for Android/iOS alerts and APNs VoIP token for iOS calls.
app.get("/api/native/status",(q,s)=>s.json({firebase:!!firebaseApp,apns:!!apnProvider,voipConfigured:!!(apnProvider&&process.env.IOS_BUNDLE_ID)}));
app.post("/api/native/register",(q,s)=>auth(q,s,()=>{
  const platform=clean(q.body.platform,10),token=clean(q.body.token,4096),voipToken=clean(q.body.voipToken,4096);
  if(!["android","ios"].includes(platform)||!token)return s.status(400).json({error:"기기 플랫폼 또는 푸시 토큰이 올바르지 않아."});
  db.deviceTokens=db.deviceTokens.filter(x=>!(x.user===q.user.id&&x.platform===platform&&x.token===token));
  db.deviceTokens.push({id:id(),user:q.user.id,platform,token,voipToken:platform==="ios"?voipToken:null,created_at:now(),updated_at:now()});
  save("deviceTokens");s.json({ok:true,platform,voipRegistered:platform==="ios"&&!!voipToken});
}));
app.post("/api/native/unregister",(q,s)=>auth(q,s,()=>{const token=clean(q.body.token,4096);db.deviceTokens=db.deviceTokens.filter(x=>!(x.user===q.user.id&&x.token===token));save("deviceTokens");s.json({ok:true})}));
app.get("/api/alarms",(q,s)=>auth(q,s,()=>s.json({alarms:db.alarms.filter(a=>a.user===q.user.id).sort((a,b)=>a.fireAt.localeCompare(b.fireAt))})));
app.post("/api/alarms",(q,s)=>auth(q,s,()=>{const fireAt=new Date(q.body.fireAt);if(!Number.isFinite(fireAt.getTime())||fireAt.getTime()<Date.now()-60000)return s.status(400).json({error:"알람 시간을 다시 확인해 줘."});const a={id:id(),user:q.user.id,label:clean(q.body.label,80)||"알람",fireAt:fireAt.toISOString(),repeat:!!q.body.repeat,created_at:now()};db.alarms.push(a);save("alarms");s.status(201).json({alarm:a,pushEnabled:vapidReady})}));
app.delete("/api/alarms/:aid",(q,s)=>auth(q,s,()=>{const i=db.alarms.findIndex(a=>a.id===q.params.aid&&a.user===q.user.id);if(i<0)return s.status(404).json({error:"알람을 찾을 수 없어."});db.alarms.splice(i,1);save("alarms");s.json({ok:true})}));

app.patch("/api/profile",(q,s)=>auth(q,s,()=>{q.user.display_name=clean(q.body.display_name,30)||q.user.display_name;q.user.profile={...q.user.profile,...q.body.profile};save("users");s.json({user:safe(q.user)});}));
app.get("/api/users",(q,s)=>auth(q,s,()=>s.json({users:db.users.filter(u=>u.id!==q.user.id&&!db.blocks.some(b=>b.owner===q.user.id&&b.target===u.id)).map(safe)})));
app.get("/api/messages/:uid",(q,s)=>auth(q,s,()=>{let a=db.messages.filter(m=>(m.from===q.user.id&&m.to===q.params.uid)||(m.from===q.params.uid&&m.to===q.user.id));a.filter(m=>m.to===q.user.id&&!m.read_at).forEach(m=>m.read_at=now());save("messages");s.json({messages:a})}));
app.post("/api/messages",(q,s)=>auth(q,s,()=>{let to=clean(q.body.to,100),content=clean(q.body.content);if(!db.users.some(u=>u.id===to))return s.status(404).json({error:"사용자를 찾을 수 없어."});if(!content&&!q.body.file)return s.status(400).json({error:"메시지를 입력해 줘."});let file=q.body.file&&typeof q.body.file==="object"&&typeof q.body.file.url==="string"&&(q.body.file.url.startsWith("/uploads/")||q.body.file.url.startsWith("https://res.cloudinary.com/"))?{url:q.body.file.url.slice(0,300),name:clean(q.body.file.name,180)}:null;let m={id:id(),from:q.user.id,to,content,file,reactions:[],created_at:now(),read_at:null};db.messages.push(m);save("messages");sendPush(to,{kind:"message",title:(q.user.display_name||"새 메시지"),body:clean(content,180)||"사진 또는 파일이 도착했어.",url:"/",tag:"message-"+m.id,requireInteraction:false,sender:q.user.display_name||"MySocial 친구"});s.status(201).json({message:m})}));
app.patch("/api/messages/:mid",(q,s)=>auth(q,s,()=>{let m=db.messages.find(x=>x.id===q.params.mid&&x.from===q.user.id);if(!m)return s.status(404).json({error:"메시지를 찾을 수 없어."});let content=clean(q.body.content);if(!content)return s.status(400).json({error:"메시지를 입력해 줘."});if(Date.now()-new Date(m.created_at).getTime()>15*60*1000)return s.status(403).json({error:"메시지는 전송 후 15분까지만 수정할 수 있어."});m.content=content;m.edited_at=now();save("messages");s.json({message:m})}));
app.delete("/api/messages/:mid",(q,s)=>auth(q,s,()=>{let m=db.messages.find(x=>x.id===q.params.mid&&x.from===q.user.id);if(!m)return s.status(404).json({error:"메시지가 없어."});m.deleted_at=now();m.content="삭제된 메시지입니다";save("messages");s.json({ok:true})}));
app.post("/api/messages/:mid/react",(q,s)=>auth(q,s,()=>{let m=db.messages.find(x=>x.id===q.params.mid);if(!m)return s.status(404).json({error:"메시지가 없어."});m.reactions=m.reactions||[];let e=clean(q.body.emoji,8),i=m.reactions.findIndex(x=>x.user===q.user.id&&x.emoji===e);if(i>=0)m.reactions.splice(i,1);else m.reactions.push({user:q.user.id,emoji:e});save("messages");s.json({reactions:m.reactions})}));
app.get("/api/friends",(q,s)=>auth(q,s,()=>s.json({friendships:db.friends.filter(f=>f.from===q.user.id||f.to===q.user.id)})));
app.post("/api/friends/:uid",(q,s)=>auth(q,s,()=>{let f=db.friends.find(x=>(x.from===q.user.id&&x.to===q.params.uid)||(x.to===q.user.id&&x.from===q.params.uid));if(f){if(f.to===q.user.id)f.status="accepted";else return s.status(409).json({error:"이미 친구 요청을 보냈어."})}else{f={id:id(),from:q.user.id,to:q.params.uid,status:"pending"};db.friends.push(f)}save("friends");s.json({friendship:f})}));
app.get("/api/groups",(q,s)=>auth(q,s,()=>s.json({groups:db.groups.filter(g=>g.members.includes(q.user.id))})));
app.post("/api/groups",(q,s)=>auth(q,s,()=>{let name=clean(q.body.name,40);if(!name)return s.status(400).json({error:"그룹 이름을 입력해 줘."});let members=[q.user.id,...(q.body.members||[])].filter((v,i,a)=>a.indexOf(v)===i&&db.users.some(u=>u.id===v)).slice(0,50),g={id:id(),name,owner:q.user.id,members,created_at:now()};db.groups.push(g);save("groups");s.status(201).json({group:g})}));
app.get("/api/groups/:gid/messages",(q,s)=>auth(q,s,()=>{let g=db.groups.find(x=>x.id===q.params.gid&&x.members.includes(q.user.id));if(!g)return s.status(403).json({error:"그룹 멤버가 아니야."});s.json({messages:db.groupMessages.filter(m=>m.group===g.id)})}));
app.post("/api/groups/:gid/messages",(q,s)=>auth(q,s,()=>{let g=db.groups.find(x=>x.id===q.params.gid&&x.members.includes(q.user.id));if(!g)return s.status(403).json({error:"그룹 멤버가 아니야."});let m={id:id(),group:g.id,sender:q.user.id,content:clean(q.body.content),created_at:now()};if(!m.content)return s.status(400).json({error:"메시지를 입력해 줘."});db.groupMessages.push(m);save("groupMessages");for(const member of g.members){if(member!==q.user.id)sendPush(member,{title:"MySocial 그룹 메시지",body:m.content.slice(0,100)||"새 메시지가 도착했어.",url:"/",tag:"group-"+g.id});}s.status(201).json({message:m})}));
app.post("/api/blocks/:uid",(q,s)=>auth(q,s,()=>{if(!db.blocks.some(b=>b.owner===q.user.id&&b.target===q.params.uid))db.blocks.push({owner:q.user.id,target:q.params.uid});save("blocks");s.json({ok:true})}));
app.post("/api/reports",(q,s)=>auth(q,s,()=>{db.reports.push({id:id(),reporter:q.user.id,reported:clean(q.body.userId,100),reason:clean(q.body.reason,500),created_at:now()});save("reports");s.status(201).json({ok:true})}));
app.post("/api/upload",(q,s,n)=>auth(q,s,()=>upload.single("file")(q,s,async e=>{try{if(e)return s.status(400).json({error:"업로드 실패 또는 파일이 너무 커."});if(!q.file)return s.status(400).json({error:"파일을 선택해 줘."});if(production&&!cloudinaryEnabled)return s.status(503).json({error:"공개 배포용 파일 저장소 설정이 필요해."});const saved=await storeUpload(q.file,"auto");s.json(saved);}catch(err){console.error(err);s.status(500).json({error:"파일 저장에 실패했어."});}})));
app.get("/api/reels",(q,s)=>auth(q,s,()=>s.json({reels:db.reels.slice().reverse()})));
app.post("/api/reels",(q,s,n)=>auth(q,s,()=>upload.single("video")(q,s,async e=>{try{if(e||!q.file)return s.status(400).json({error:"영상 업로드 실패."});if(!q.file.mimetype.startsWith("video/"))return s.status(400).json({error:"영상만 올릴 수 있어."});if(production&&!cloudinaryEnabled)return s.status(503).json({error:"공개 배포용 영상 저장소 설정이 필요해."});const saved=await storeUpload(q.file,"video");let r={id:id(),user:q.user.id,url:saved.url,caption:clean(q.body.caption,200),likes:[],created_at:now()};db.reels.push(r);save("reels");s.status(201).json({reel:r});}catch(err){console.error(err);s.status(500).json({error:"영상 저장에 실패했어."});}})));
app.post("/api/reels/:rid/like",(q,s)=>auth(q,s,()=>{let r=db.reels.find(x=>x.id===q.params.rid);if(!r)return s.status(404).json({error:"릴스가 없어."});r.likes=r.likes||[];r.likes=r.likes.includes(q.user.id)?r.likes.filter(x=>x!==q.user.id):[...r.likes,q.user.id];save("reels");s.json({likes:r.likes.length})}));


// Friend request management and private self-notes
app.get("/api/friends",(q,s)=>auth(q,s,()=>s.json({friendships:db.friends.filter(f=>f.from===q.user.id||f.to===q.user.id)})));
app.patch("/api/friends/:fid",(q,s)=>auth(q,s,()=>{let f=db.friends.find(x=>x.id===q.params.fid&&x.to===q.user.id);if(!f)return s.status(404).json({error:"친구 요청을 찾을 수 없어."});if(!["accepted","rejected"].includes(q.body.status))return s.status(400).json({error:"잘못된 상태야."});f.status=q.body.status;save("friends");s.json({friendship:f})}));
app.get("/api/self-messages",(q,s)=>auth(q,s,()=>s.json({messages:db.selfMessages.filter(m=>m.user===q.user.id)})));
app.post("/api/self-messages",(q,s)=>auth(q,s,()=>{let content=clean(q.body.content);if(!content)return s.status(400).json({error:"메모를 입력해 줘."});let m={id:id(),user:q.user.id,content,created_at:now()};db.selfMessages.push(m);save("selfMessages");s.status(201).json({message:m})}));

// Presence and WebRTC signaling
app.post("/api/presence",(q,s)=>auth(q,s,()=>{let p=db.presence.find(x=>x.user===q.user.id);if(!p){p={user:q.user.id};db.presence.push(p)}p.last_seen=now();save("presence");s.json({ok:true})}));
app.get("/api/presence",(q,s)=>auth(q,s,()=>s.json({online:db.presence.filter(p=>Date.now()-new Date(p.last_seen).getTime()<45000).map(p=>p.user)})));
app.get("/api/calls/inbox",(q,s)=>auth(q,s,()=>{let c=db.calls.find(x=>x.to===q.user.id&&["ringing","accepted"].includes(x.status));s.json({call:c||null})}));
app.post("/api/calls",(q,s)=>auth(q,s,()=>{let to=clean(q.body.to,100);if(!db.users.some(u=>u.id===to))return s.status(404).json({error:"사용자를 찾을 수 없어."});if(db.calls.some(c=>["ringing","accepted"].includes(c.status)&&(c.from===q.user.id||c.to===q.user.id)))return s.status(409).json({error:"이미 통화 중이야."});if(!q.body.offer||typeof q.body.offer!=="object")return s.status(400).json({error:"통화 연결 정보가 없어."});let c={id:id(),from:q.user.id,to,status:"ringing",offer:q.body.offer,answer:null,fromIce:[],toIce:[],created_at:now()};db.calls.push(c);save("calls");const callerName=q.user.display_name||"MySocial 친구";sendPush(to,{kind:"incoming-call",callId:c.id,title:"📞 "+callerName,body:"수신 전화 · MySocial 음성 통화",url:"/?incomingCall="+encodeURIComponent(c.id),tag:"call-"+c.id,requireInteraction:true,sender:callerName});s.status(201).json({call:c})}));
app.get("/api/calls/:cid",(q,s)=>auth(q,s,()=>{let c=db.calls.find(x=>x.id===q.params.cid&&(x.from===q.user.id||x.to===q.user.id));if(!c)return s.status(404).json({error:"통화를 찾을 수 없어."});s.json({call:c})}));
app.patch("/api/calls/:cid",(q,s)=>auth(q,s,()=>{let c=db.calls.find(x=>x.id===q.params.cid&&(x.from===q.user.id||x.to===q.user.id));if(!c)return s.status(404).json({error:"통화를 찾을 수 없어."});if(q.body.status&&["accepted","rejected","ended"].includes(q.body.status))c.status=q.body.status;if(q.body.answer)c.answer=q.body.answer;save("calls");s.json({call:c})}));
app.post("/api/calls/:cid/ice",(q,s)=>auth(q,s,()=>{let c=db.calls.find(x=>x.id===q.params.cid&&(x.from===q.user.id||x.to===q.user.id));if(!c)return s.status(404).json({error:"통화를 찾을 수 없어."});if(!q.body.candidate||typeof q.body.candidate!=="object")return s.status(400).json({error:"ICE 정보가 없어."});let bucket=q.user.id===c.from?c.fromIce:c.toIce;if(bucket.length<300)bucket.push(q.body.candidate);save("calls");s.json({ok:true})}));

// Server-side alarm dispatcher. Push is delivered to subscribed devices even when the page is closed.
let alarmDispatchBusy=false;
setInterval(async()=>{if(alarmDispatchBusy)return;alarmDispatchBusy=true;try{const t=Date.now();if(!vapidReady&&!firebaseApp&&!apnProvider)return;for(const a of [...db.alarms]){if(new Date(a.fireAt).getTime()>t)continue;if(!db.pushSubscriptions.some(x=>x.user===a.user)&&!db.deviceTokens.some(x=>x.user===a.user))continue;sendPush(a.user,{title:"⏰ MySocial 알람",body:a.label||"설정한 알람 시간이야.",url:"/",tag:"alarm-"+a.id});if(a.repeat){const next=new Date(a.fireAt);do{next.setDate(next.getDate()+1)}while(next.getTime()<=t);a.fireAt=next.toISOString();}else db.alarms=db.alarms.filter(x=>x.id!==a.id);await save("alarms");}}catch(e){console.error("알람 처리 오류:",e.message)}finally{alarmDispatchBusy=false}},5000);
app.get("*",(q,s)=>s.sendFile(path.join(PUB,"index.html")));
initStorage().then(()=>app.listen(PORT,()=>console.log("MySocial 4.5 실행 중: http://localhost:"+PORT))).catch(err=>{console.error("스토리지 초기화 실패:",err);process.exit(1);});
