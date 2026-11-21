self.addEventListener("push",event=>{
  let data={title:"MySocial",body:"새 알림이 도착했어.",url:"/",tag:"mysocial"};
  try{data={...data,...event.data.json()}}catch{}
  const isCall=data.kind==="incoming-call";
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,icon:"/icon-192.png",badge:"/icon-192.png",
    tag:data.tag||"mysocial",renotify:true,
    requireInteraction:isCall||!!data.requireInteraction,
    vibrate:isCall?[300,150,300,150,600]:[180,90,180],
    actions:isCall?[{action:"open",title:"전화 확인하기"}]:[],
    data:{url:data.url||"/",kind:data.kind||"message",callId:data.callId||null}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const data=event.notification.data||{};
  const url=data.url||"/";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(async list=>{
    for(const client of list){
      if("focus" in client){
        try{await client.navigate(url)}catch{}
        return client.focus();
      }
    }
    return clients.openWindow(url);
  }));
});
self.addEventListener("notificationclose",()=>{});
