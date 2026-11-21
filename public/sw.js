self.addEventListener("push",event=>{
  let data={title:"MySocial",body:"새 알림이 도착했어.",url:"/",tag:"mysocial",kind:"message"};
  try{if(event.data){const raw=event.data.json();data={...data,...raw}}}catch{try{data.body=event.data.text()}catch{}}
  const isCall=data.kind==="incoming-call";
  const options={
    body:data.body|| (isCall?"수신 전화":"새 메시지가 도착했어."),
    icon:"/icon-192.png",badge:"/icon-192.png",
    tag:data.tag||(isCall?"incoming-call":"mysocial-message"),renotify:true,
    silent:false,requireInteraction:isCall,
    vibrate:isCall?[500,250,500,250,900]:[250,120,250],
    timestamp:Date.now(),
    data:{url:data.url||"/",kind:data.kind||"message",callId:data.callId||null}
  };
  if(isCall)options.actions=[{action:"open",title:"전화 화면 열기"}];
  event.waitUntil(self.registration.showNotification(data.title||"MySocial",options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const data=event.notification.data||{};
  const url=data.url||"/";
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of list){
      if("focus" in client){
        try{await client.navigate(url)}catch{}
        return client.focus();
      }
    }
    return clients.openWindow(url);
  })());
});
self.addEventListener("notificationclose",()=>{});
