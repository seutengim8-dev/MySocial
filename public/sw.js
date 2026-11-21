self.addEventListener("push",event=>{
  let data={title:"MySocial",body:"새 알림이 도착했어.",url:"/",tag:"mysocial"};
  try{data={...data,...event.data.json()}}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,icon:"/icon-192.png",badge:"/icon-192.png",
    tag:data.tag||"mysocial",renotify:true,data:{url:data.url||"/"},
    vibrate:[180,90,180]
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url||"/";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){if("focus"in c){c.navigate(url);return c.focus()}}
    return clients.openWindow(url);
  }));
});