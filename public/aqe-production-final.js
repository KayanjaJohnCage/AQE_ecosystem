(function(){
  "use strict";
  var DOMAIN="https://afriqueerescortsecosystem.com";
  function el(id){return document.getElementById(id)}
  function session(){try{return JSON.parse(localStorage.getItem("aqe_next_session")||"null")}catch(_){return null}}
  function headers(json){var h=json?{"Content-Type":"application/json"}:{};var s=session();if(s&&s.access_token)h.Authorization="Bearer "+s.access_token;return h}
  function user(){return window.state&&state.currentUser?state.currentUser:null}
  function toast(msg,type){if(typeof window.showToast==="function")window.showToast(msg,type||"success");else if(typeof window.toast==="function")window.toast(msg)}
  async function api(path,opt){var o=opt||{};o.headers=Object.assign({},headers(true),o.headers||{});o.cache="no-store";var r=await fetch(path,o);var b=await r.json().catch(function(){return {}});if(!r.ok||b.ok===false)throw new Error(b.reason||b.message||("Request failed ("+r.status+")"));return b}

  /* FINAL NAVIGATION: all customer drawer buttons stay inside the SPA. */
  window.showScreen=function(id){
    var target=el(id);
    if(!target){toast("That page is not available in this deployment.","error");return}
    document.querySelectorAll(".screen").forEach(function(x){x.classList.add("hidden")});
    target.classList.remove("hidden");target.classList.add("fi");
    window.scrollTo(0,0);
    try{if(window.parent&&window.parent!==window)window.parent.history.replaceState({aqeScreen:id},"","/customer")}catch(_){}
    if(id==="screen-messages"){syncMessages().then(renderRealInbox).catch(function(){})}
    if(id==="screen-notifications"){loadNotifications()}
    if(id==="screen-bill"||id==="screen-receipts"){if(typeof window.aqeRefreshFinancialState==="function")window.aqeRefreshFinancialState().catch(function(){});}
    if(id==="screen-me"){if(typeof window.aqeRefreshServerMedia==="function")window.aqeRefreshServerMedia().catch(function(){});}
    if(id==="screen-aqe-withdraw"){installWithdrawFields()}
    if(id==="screen-aqe-vip-salary"){loadVipSalary()}
    if(id==="screen-tasks"){loadVipTasks()}
    if(id==="screen-manager"){loadSupportProof()}
    if(id==="screen-home"){loadAnnouncement()}
    document.dispatchEvent(new CustomEvent("aqe-screen-change",{detail:{id:id}}));
  };

  /* Do not expose the Manager control panel from the customer drawer. */
  function hideCustomerManagerControl(){
    var buttons=document.querySelectorAll("#drawer button,.px-nav");
    buttons.forEach(function(b){
      var text=(b.textContent||"").trim().toLowerCase();
      if(text==="manager control"||text==="aqe ecosystem manager"||text==="manager console"||b.getAttribute("href")==="/aqe-control")b.style.display="none";
    });
  }

  /* Referral links point to the real production domain and open registration with the code. */
  function referralCodeFromUrl(){
    try{
      var qs=new URLSearchParams(window.parent!==window?window.parent.location.search:location.search);
      return (qs.get("ref")||qs.get("referral")||"").trim().toUpperCase();
    }catch(_){return ""}
  }
  function openReferralRegistration(){
    var ref=referralCodeFromUrl();if(!ref)return;
    var input=el("regRef");if(input)input.value=ref;
    if(typeof window.switchAuthTab==="function")window.switchAuthTab("register");
    var modal=el("authModal");if(modal)modal.classList.remove("hidden");
    var msg=el("aqeReferralNotice");if(!msg&&input){msg=document.createElement("div");msg.id="aqeReferralNotice";msg.className="aqe-reg-intro";input.parentElement&&input.parentElement.insertBefore(msg,input);msg.textContent="Referral code applied: "+ref}
  }
  window.copyInvite=async function(){
    var u=user();if(!u){if(typeof openAuth==="function")openAuth();return}
    var code=String(u.referralCode||"").trim().toUpperCase();
    if(!code){try{var r=await api("/api/referrals");code=String(r.referralCode||"").toUpperCase();u.referralCode=code}catch(e){toast(e.message,"error");return}}
    var url=DOMAIN+"/customer?ref="+encodeURIComponent(code);
    var text="Join AfriQueer Escorts Ecosystem with my referral code: "+code+" "+url;
    try{await navigator.clipboard.writeText(text)}catch(_){var t=document.createElement("textarea");t.value=text;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove()}
    toast("Referral link copied. New users will be taken to registration with your referral code.","success");
  };
  window.copyRef=window.copyInvite;
  window.shareTo=function(platform){
    var u=user();if(!u)return;
    var code=String(u.referralCode||"").toUpperCase(),url=DOMAIN+"/customer?ref="+encodeURIComponent(code);
    var text="Join AfriQueer Escorts Ecosystem with my referral code: "+code+" "+url;
    if(platform==="whatsapp")window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener");
    else if(platform==="telegram")window.open("https://t.me/share/url?url="+encodeURIComponent(url)+"&text="+encodeURIComponent(text),"_blank","noopener");
    else window.copyInvite();
  };

  /* Notifications are server-authoritative; localStorage can no longer resurrect read items. */
  async function loadNotifications(){
    try{
      var b=await api("/api/notifications?limit=100");
      state.notifications=(b.notifications||[]).map(function(n){return{id:n.id,text:(n.title?n.title+": ":"")+n.body,time:n.created_at?new Date(n.created_at).toLocaleString():"",read:!!n.read_at}});
      if(typeof window.renderNotifications==="function")window.renderNotifications();
      if(typeof window.renderAqeNotificationPage==="function")window.renderAqeNotificationPage();
    }catch(e){toast(e.message||"Notifications could not be loaded.","error")}
  }
  window.markNotifRead=async function(id){
    try{await api("/api/notifications",{method:"PATCH",body:JSON.stringify({notificationId:String(id)})});await loadNotifications();toast("Notification marked as read.","success")}
    catch(e){toast(e.message||"Could not mark notification as read.","error")}
  };
  window.markAllRead=async function(){
    try{await api("/api/notifications",{method:"PATCH",body:JSON.stringify({markAll:true})});await loadNotifications();toast("All notifications marked as read.","success")}
    catch(e){toast(e.message||"Could not mark notifications as read.","error")}
  };

  /* Manager support: visible proof plus a persisted support ticket. */
  function supportProof(message,type){
    var box=el("aqeManagerSupportProof");if(!box){box=document.createElement("div");box.id="aqeManagerSupportProof";box.style.cssText="margin-top:12px;padding:12px;border-radius:12px;border:1px solid var(--a7);font-size:12px;line-height:1.5";var form=el("aqeManagerSupportForm");if(form)form.parentNode.insertBefore(box,form.nextSibling)}
    box.textContent=message;box.style.color=type==="error"?"#f87171":"#86efac";
  }
  window.aqeSendManagerSupport=async function(event){
    if(event)event.preventDefault();
    var subject=String((el("aqeManagerSupportSubject")||{}).value||"").trim(),message=String((el("aqeManagerSupportMessage")||{}).value||"").trim(),category=String((el("aqeManagerSupportCategory")||{}).value||"OTHER");
    if(!subject||!message){supportProof("Enter a subject and message before sending.","error");return}
    try{
      var b=await api("/api/support/tickets",{method:"POST",body:JSON.stringify({category,subject,message,priority:"MEDIUM"})});
      if(el("aqeManagerSupportForm"))el("aqeManagerSupportForm").reset();
      supportProof("✓ Sent to Manager Support. Ticket "+String(b.ticket&&b.ticket.ticketId||b.ticketId||"created")+" is now recorded in the support queue.","success");
      toast("Manager support request sent successfully.","success");
    }catch(e){supportProof("✕ Not sent: "+(e.message||"Support request failed."),"error");toast(e.message||"Support request failed.","error")}
  };
  window.aqeOpenManagerTroubleshoot=async function(){
    var requested=window.prompt("What account change or correction do you need?");if(!requested)return;
    var details=window.prompt("Add any details the Manager needs to review.");if(details===null)return;
    try{
      var b=await api("/api/support/troubleshoot",{method:"POST",body:JSON.stringify({requestedChange:requested,details})});
      supportProof("✓ Troubleshooting request submitted. Request "+String(b.request?.id||b.id||"created")+" is now in the Manager queue.","success");
      toast("Troubleshooting request sent successfully.","success");
    }catch(e){supportProof("✕ Not sent: "+(e.message||"Troubleshoot request failed."),"error");toast(e.message||"Troubleshoot request failed.","error")}
  };
  function loadSupportProof(){
    var form=el("aqeManagerSupportForm");if(form&&!form.dataset.finalBound){form.dataset.finalBound="1";form.addEventListener("submit",window.aqeSendManagerSupport)}
  }

  /* Mukuru receiver is shown before the payment request is submitted. */
  async function showReceiver(){
    var host=el("aqeMukuruReceiverInfo")||el("aqePaymentReceiverInfo");
    if(!host){
      var amount=el("aqeExactAmount");
      if(amount&&amount.parentElement){host=document.createElement("div");host.id="aqeMukuruReceiverInfo";host.style.cssText="margin:10px 0;padding:12px;border-radius:14px;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);font-size:12px";amount.parentElement.insertBefore(host,amount)}
    }
    if(!host)return;
    host.textContent="Loading available Mukuru receiver…";
    try{
      var b=await api("/api/payments/receiver?status=available");
      var r=b.receiver||b.receivers?.[0];
      if(!r){host.textContent="No Mukuru receiver is currently marked Available. Manager configuration will appear here automatically.";return}
      host.innerHTML="<strong>Send to this Mukuru receiver</strong><br>"+String(r.receiverName||r.receiver_name||r.name||"AQE Receiver")+"<br><b>"+String(r.receiverPhone||r.receiver_phone||r.phone||"—")+"</b>"+((r.receiverCard||r.receiver_card)?"<br>Card: "+String(r.receiverCard||r.receiver_card):"")+(r.network?"<br>"+String(r.network):"")+(r.instructions?"<div style='margin-top:6px;opacity:.8'>"+String(r.instructions).replace(/</g,"&lt;")+"</div>":"");
    }catch(e){host.textContent="Mukuru receiver could not be loaded: "+(e.message||"try again")}
  }
  var originalPaymentOpen=window.aqeExactOpen;
  window.aqeExactOpen=function(){
    var r=originalPaymentOpen&&originalPaymentOpen.apply(this,arguments);
    setTimeout(showReceiver,50);return r;
  };

  /* Withdrawal fields: receiver name + phone/card are mandatory and persisted server-side. */
  function installWithdrawFields(){
    var box=el("aqeWithdrawAmount");if(!box)return;
    if(!el("aqeWithdrawName")){
      var name=document.createElement("input");name.id="aqeWithdrawName";name.className="inp";name.style.marginTop="10px";name.placeholder="Receiver registered name";box.parentElement.insertBefore(name,box.nextSibling);
    }
    if(!el("aqeWithdrawAccount")){
      var account=document.createElement("input");account.id="aqeWithdrawAccount";account.className="inp";account.style.marginTop="10px";account.placeholder="Receiver phone or card number";var anchor=el("aqeWithdrawName");anchor.parentElement.insertBefore(account,anchor.nextSibling);
    }
    var u=user();if(u){el("aqeWithdrawName").value=el("aqeWithdrawName").value||u.name||"";el("aqeWithdrawAccount").value=el("aqeWithdrawAccount").value||u.phone||""}
    var note=el("aqeWithdrawStatus");if(note&&!note.dataset.finalRule){note.dataset.finalRule="1";note.insertAdjacentHTML("beforeend","<div style='margin-top:8px;font-size:11px'>Minimum UGX 30,000 · Maximum UGX 5,000,000 · 8% service charge · Manager confirmation required.</div>")}
  }
  window.aqeConfirmWithdraw=async function(){
    var u=user();if(!u){toast("Please sign in first.","error");return}
    installWithdrawFields();
    var amount=Number((el("aqeWithdrawAmount")||{}).value||0),name=String((el("aqeWithdrawName")||{}).value||"").trim(),account=String((el("aqeWithdrawAccount")||{}).value||"").trim(),method=String((el("aqeWithdrawMethod")||{}).value||"MOBILE_MONEY");
    if(amount<30000||amount>5000000){toast("Withdrawal must be between UGX 30,000 and UGX 5,000,000.","error");return}
    if(!name||!account){toast("Receiver name and phone/card number are required.","error");return}
    try{await api("/api/vip/withdrawals",{method:"POST",body:JSON.stringify({amount,currency:"UGX",tier:String(u.tier||"basic").toLowerCase(),recipientName:name,recipientAccount:account,paymentMethod:method})});toast("✓ Withdrawal request submitted. Manager review is pending.","success");await loadVipSalary();if(typeof window.aqeRefreshFinancialState==="function")await window.aqeRefreshFinancialState()}catch(e){toast(e.message||"Withdrawal request failed.","error")}
  };
  window.aqeWithdraw=installWithdrawFields;

  /* VIP salary room, locked until the 20th. */
  async function loadVipSalary(){
    var root=el("screen-aqe-vip-salary");if(!root)return;
    var body=el("aqeVipSalaryBody");if(body)body.innerHTML="<div class='aqe-update-card'>Loading VIP salary…</div>";
    try{
      var b=await api("/api/vip/salary");
      if(body)body.innerHTML="<div class='aqe-update-card'><div class='px-label'>Current month VIP salary</div><div class='aqe-update-price'>UGX "+Number(b.salary||0).toLocaleString()+"</div><p class='aqe-update-muted'>Salary is released on the 20th. Withdrawals are "+(b.unlocked?"unlocked today.":"locked until the 20th.")+"</p><button class='aqe-update-action "+(b.unlocked?"":"alt")+"' "+(b.unlocked?"onclick='withdrawVipSalary()'":"disabled style='opacity:.55;cursor:not-allowed'")+">"+(b.unlocked?"Withdraw VIP salary":"Locked until 20th")+"</button></div><div class='aqe-update-card' style='margin-top:12px'><b>Manager-controlled salary records</b><p class='aqe-update-muted'>Your salary history is loaded from the real AQE database.</p></div>";
    }catch(e){if(body)body.innerHTML="<div class='aqe-update-card'>"+(e.message||"VIP salary unavailable.")+"</div>"}
  }
  window.withdrawVipSalary=async function(){
    try{
      var b=await api("/api/vip/salary");if(!b.unlocked||Number(b.salary||0)<=0){toast("VIP salary is not available for withdrawal yet.","error");return}
      var u=user(),name=window.prompt("Receiver registered name",u&&u.name||"");if(!name)return;
      var account=window.prompt("Receiver phone or card number",u&&u.phone||"");if(!account)return;
      await api("/api/vip/withdrawals",{method:"POST",body:JSON.stringify({amount:Number(b.salary),currency:"UGX",tier:"vip",recipientName:name,recipientAccount:account,paymentMethod:"MOBILE_MONEY",source:"VIP_SALARY"})});
      toast("✓ VIP salary withdrawal request submitted.","success");await loadVipSalary()
    }catch(e){toast(e.message||"VIP salary withdrawal failed.","error")}
  };

  /* VIP task screen now reads manager configuration from the database. */
  async function loadVipTasks(){
    var root=el("screen-tasks"),list=el("tasksList");if(!root||!list)return;
    try{
      var b=await api("/api/vip/tasks");var tasks=b.tasks||[];
      list.innerHTML=tasks.length?tasks.map(function(t){var done=t.completionStatus;return "<div class='bga8 rxl p4 b1 ba7'><div class='fw7'>"+String(t.title).replace(/</g,"&lt;")+"</div><div class='xs ca4 mt1'>"+String(t.description||"").replace(/</g,"&lt;")+"</div><div class='xs cg mt2'>Reward: "+Number(t.reward_qc||0).toLocaleString()+" QC"+(Number(t.reward_cash||0)?" · UGX "+Number(t.reward_cash).toLocaleString():"")+"</div><button class='btn "+(done?"bs2":"bp")+"' style='margin-top:10px' "+(done?"disabled":"onclick=\"completeVipTask('"+t.id+"')\"")+">"+(done?"Submitted":"Complete task")+"</button></div>"}).join(""):"<div class='tc ca5 py6'>No active VIP tasks have been published by the Manager.</div>";
    }catch(e){list.innerHTML="<div class='tc cr py6'>"+(e.message||"VIP tasks unavailable.")+"</div>"}
  }
  window.completeVipTask=async function(id){try{var b=await api("/api/vip/tasks",{method:"POST",body:JSON.stringify({taskId:id})});toast("✓ "+(b.message||"Task submitted."),"success");await loadVipTasks()}catch(e){toast(e.message||"Task could not be submitted.","error")}}

  /* Friend requests, profile messaging, booking and full-size media all use real DB users. */
  window.aqeSendFriendRequest=async function(){
    var p=profileFor(window.activeProfileId);var recipient=p&&p.userId;if(!recipient){toast("Registered user record not found.","error");return}
    try{var b=await api("/api/friends",{method:"POST",body:JSON.stringify({recipientId:recipient})});toast("✓ "+(b.message||"Friend request sent."),"success")}catch(e){toast(e.message||"Friend request failed.","error")}
  };
  window.bookFromProfile=function(){
    var p=profileFor(window.activeProfileId);if(!p){toast("Profile is no longer available.","error");return}
    window.showScreen("screen-book");var sel=el("pxBookTarget");if(sel)sel.value=String(p.userId||p.id);toast("Booking page opened for "+(p.name||"this member")+".","success");
  };
  window.commentFromProfile=function(){
    var p=profileFor(window.activeProfileId);if(!p){toast("Profile is no longer available.","error");return}
    window.showScreen("screen-comments");var sel=el("pxCommentTarget");if(sel)sel.value=String(p.id);toast("Comment box opened for "+(p.name||"this profile")+".","success");
  };
  function addMessageButton(){
    var detail=el("profileDetail"),grid=detail&&detail.querySelector(".g.g2c.g3.mb4");if(!grid||grid.querySelector(".aqe-message-profile"))return;
    var b=document.createElement("button");b.className="btn bs2 aqe-message-profile";b.innerHTML='<i class="fas fa-comment-dots"></i> Message';b.onclick=function(){var p=profileFor(window.activeProfileId);if(!p||!p.userId){toast("Registered user record not found.","error");return}openRealChat(p.userId,p.name)};
    grid.appendChild(b);
  }

  var originalOpenProfile=window.openProfile;
  window.openProfile=function(id){
    var r=originalOpenProfile&&originalOpenProfile.apply(this,arguments);setTimeout(function(){addMessageButton();patchProfileMedia()},20);return r
  };
  function patchProfileMedia(){
    var grid=el("profileMediaGallery");if(!grid)return;
    grid.querySelectorAll("img,video").forEach(function(node){
      if(node.dataset.aqeLightbox)return;node.dataset.aqeLightbox="1";node.style.cursor="zoom-in";
      node.addEventListener("click",function(e){e.stopPropagation();openLightbox(node.currentSrc||node.src||node.poster,node.tagName.toLowerCase()==="video")});
    });
  }
  function openLightbox(src,video){
    if(!src)return;var box=el("aqeMediaLightbox");if(!box){box=document.createElement("div");box.id="aqeMediaLightbox";box.style.cssText="position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:18px";box.innerHTML="<button id='aqeLbClose' style='position:absolute;right:18px;top:18px;width:42px;height:42px;border-radius:50%;border:1px solid #666;background:#111;color:#fff;font-size:22px'>×</button><div id='aqeLbBody' style='max-width:96vw;max-height:92vh'></div>";document.body.appendChild(box);el("aqeLbClose").onclick=function(){box.style.display="none"}}
    box.style.display="flex";var body=el("aqeLbBody");body.innerHTML=video?"<video src='"+String(src).replace(/'/g,"%27")+"' controls autoplay style='max-width:96vw;max-height:92vh'></video>":"<img src='"+String(src).replace(/'/g,"%27")+"' style='max-width:96vw;max-height:92vh;object-fit:contain;border-radius:12px'>";
  }

  /* Real messages: group server records by actual registered recipient and never fabricate replies. */
  var realRecipient=null;
  async function syncMessages(){
    var b=await api("/api/messages");var rows=b.messages||[],by={};
    rows.forEach(function(m){
      var uid=String(m.userId||"");if(!uid)return;
      by[uid]=by[uid]||{id:"real-"+uid,withUserId:uid,withName:uid,messages:[],lastMsg:"",time:m.time||"Now",unread:0};
      var p=(state.profiles||[]).find(function(x){return String(x.userId)===uid});if(p)by[uid].withName=p.name;
      by[uid].messages.unshift({id:m.id,from:String(m.senderId)===String(user()&&user().id)?"me":"them",text:m.body||m.preview||"",time:m.time||"",status:m.read?"READ":"DELIVERED"});
      by[uid].lastMsg=m.preview||m.body||"";by[uid].time=m.time||"Now";
    });
    state.conversations=Object.keys(by).map(function(k){return by[k]});
    return state.conversations;
  }
  function renderRealInbox(){
    var list=el("conversationsList");if(!list)return;
    var cs=state.conversations||[];
    list.innerHTML=cs.length?cs.map(function(c){return "<div onclick=\"openChat('"+c.id+"')\" class='bga8 rxl p3 b1 ba7 flex aic g3 cp'><div style='width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--r),var(--pu));display:flex;align-items:center;justify-content:center;color:white;font-weight:800'>"+String(c.withName||"AQE").slice(0,2).toUpperCase()+"</div><div class='f1 mw0'><div class='sm fw7'>"+String(c.withName||"AQE Member").replace(/</g,"&lt;")+"</div><p class='xs ca4 trun'>"+String(c.lastMsg||"No messages yet").replace(/</g,"&lt;")+"</p></div><span class='xs ca5'>"+String(c.time||"")+"</span></div>"}).join(""):"<div class='tc ca5 sm py8'>No messages yet. Use a profile's Message button or New Conversation.</div>";
  }
  window.openChat=function(id){
    var c=(state.conversations||[]).find(function(x){return String(x.id)===String(id)});if(!c)return;
    activeChatId=id;realRecipient=c.withUserId;
    var head=el("chatHeader");if(head)head.innerHTML="<div class='sm fw7'>"+String(c.withName||"Verified AQE member").replace(/</g,"&lt;")+"</div><div class='xs cgr'>Real AQE conversation</div>";
    var body=el("chatMessages");if(body)body.innerHTML=(c.messages||[]).map(function(m){return "<div style='display:flex;justify-content:"+(m.from==="me"?"flex-end":"flex-start")+";margin:8px 0'><div style='max-width:78%;padding:10px 14px;border-radius:16px;background:"+(m.from==="me"?"var(--r)":"var(--a8)")+";color:var(--a1);border:1px solid var(--a7)'>"+String(m.text).replace(/</g,"&lt;")+"<div style='font-size:9px;opacity:.65;margin-top:4px'>"+String(m.time||"")+"</div></div></div>"}).join("");
    var chat=el("chatScreen");if(chat)chat.classList.remove("hidden");document.body.style.overflow="hidden";
  };
  window.sendMessage=async function(){
    var input=el("chatInput"),text=String(input&&input.value||"").trim();if(!text||!realRecipient){toast("Choose a real registered user before sending.","error");return}
    try{var b=await api("/api/messages",{method:"POST",body:JSON.stringify({recipientId:realRecipient,body:text})});if(input)input.value="";toast("✓ Message sent to "+((state.profiles||[]).find(function(p){return String(p.userId)===String(realRecipient)})?.name||"AQE member")+".","success");await syncMessages();var c=state.conversations.find(function(x){return x.withUserId===realRecipient});if(c)window.openChat(c.id)}catch(e){toast(e.message||"Message was not sent.","error")}
  };

  /* Server booking requests no longer use the legacy QC/demo flow. */
  window.pxSendBooking=async function(){
    var target=el("pxBookTarget"),note=el("pxBookNote"),providerId=target&&target.value;if(!providerId){toast("Choose a registered profile first.","error");return}
    try{var b=await api("/api/bookings",{method:"POST",body:JSON.stringify({providerId:providerId,service:"Booking request",amount:0,currency:"UGX",notes:String(note&&note.value||"").trim(),qcCost:0})});if(note)note.value="";toast("✓ Booking request sent. "+String(b.booking?.id||"")+" is recorded for Manager/provider review.","success");if(typeof window.aqeRefreshFinancialState==="function")window.aqeRefreshFinancialState().catch(function(){})}catch(e){toast(e.message||"Booking request failed.","error")}
  };

  /* Full customer-visible announcements. */
  async function loadAnnouncement(){
    var old=el("aqeAnnouncementCard");if(old)old.remove();
    try{
      var b=await api("/api/announcements"),a=(b.announcements||[]).find(function(x){return !x.dismissed});
      if(!a)return;
      var home=el("screen-home"),host=home&&home.querySelector(".px4");if(!host)return;
      var card=document.createElement("section");card.id="aqeAnnouncementCard";card.style.cssText="position:relative;margin-bottom:18px;padding:22px;border-radius:22px;border:1px solid rgba(251,191,36,.55);background:radial-gradient(circle at 90% 0%,rgba(251,191,36,.2),transparent 36%),linear-gradient(135deg,rgba(225,29,72,.16),rgba(139,92,246,.18));box-shadow:0 20px 70px rgba(0,0,0,.3)";
      card.innerHTML="<button id='aqeAnnouncementClose' style='position:absolute;right:12px;top:12px;width:34px;height:34px;border-radius:50%;border:1px solid var(--a7);background:rgba(0,0,0,.2);color:var(--a1);font-size:18px'>×</button><div class='xs cg fw8' style='letter-spacing:.14em;text-transform:uppercase'>AQE "+String(a.kind||"Announcement")+"</div><h2 style='font-size:22px;font-weight:900;margin:8px 44px 8px 0'>"+String(a.title).replace(/</g,"&lt;")+"</h2><p style='font-size:13px;line-height:1.65;color:var(--a3);white-space:pre-wrap'>"+String(a.message).replace(/</g,"&lt;")+"</p><div class='xs ca5' style='margin-top:12px'>Published "+new Date(a.created_at).toLocaleString()+"</div>";
      host.insertBefore(card,host.firstChild);
      el("aqeAnnouncementClose").onclick=async function(){try{await api("/api/announcements",{method:"POST",body:JSON.stringify({action:"dismiss",id:a.id})})}catch(_){};try{localStorage.setItem("aqe_announcement_"+a.id,"1")}catch(_){};card.remove()};
    }catch(_){}
  }

  /* Support announcement dismiss endpoint is handled here without weakening manager CRUD. */
  var oldAnnPost=window.fetch;
  /* no global fetch interception: the customer API remains explicit and auditable. */

  /* Resumable uploads: use Supabase TUS for large files and keep failed work queued locally. */
  var uploadQueue=[];
  function queueKey(){return "aqe_upload_queue_v1"}
  function saveQueue(){try{localStorage.setItem(queueKey(),JSON.stringify(uploadQueue.map(function(x){return {name:x.file.name,size:x.file.size,type:x.file.type,kind:x.kind,profilePhoto:x.profilePhoto}})))}catch(_){}}
  async function uploadOne(file,kind,profilePhoto){
    var s=session();if(!s||!s.access_token)throw new Error("Please sign in before uploading.");
    if(window.tus&&file.size>6*1024*1024){
      var start=await api("/api/media/upload-resumable",{method:"POST",body:JSON.stringify({fileName:file.name,mimeType:file.type,sizeBytes:file.size,kind:kind})});
      return new Promise(function(resolve,reject){
        var upload=new tus.Upload(file,{endpoint:start.endpoint,chunkSize:6*1024*1024,retryDelays:[0,3000,5000,10000,20000],headers:{authorization:"Bearer "+s.access_token,"x-signature":start.token},uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,metadata:{bucketName:start.bucket,objectName:start.objectPath,contentType:file.type,cacheControl:"3600"},onError:function(err){reject(err)},onProgress:function(a,b){toast("Uploading "+file.name+" — "+Math.round(a/b*100)+"%","info")},onSuccess:function(){resolve(start)}});upload.findPreviousUploads().then(function(prev){if(prev.length)upload.resumeFromPreviousUpload(prev[0]);upload.start()}).catch(reject)
      })
    }
    var form=new FormData();form.append("file",file);var h={};if(s.access_token)h.Authorization="Bearer "+s.access_token;
    var r=await fetch("/api/media/upload-file",{method:"POST",headers:h,body:form});var b=await r.json().catch(function(){return {}});if(!r.ok||b.ok===false)throw new Error(b.reason||"Upload failed.");return b
  }
  async function processUploadQueue(){
    if(!navigator.onLine||!uploadQueue.length)return;
    var pending=uploadQueue.slice();uploadQueue=[];
    for(var i=0;i<pending.length;i++){try{await uploadOne(pending[i].file,pending[i].kind,pending[i].profilePhoto);toast("✓ "+pending[i].file.name+" uploaded.","success")}catch(e){uploadQueue.push(pending[i])}}
    saveQueue();
    if(typeof window.aqeRefreshServerMedia==="function")window.aqeRefreshServerMedia().catch(function(){})
  }
  window.aqeUploadMedia=async function(){
    var input=el("aqeMediaInput"),files=input&&input.files?Array.prototype.slice.call(input.files):[];if(!files.length){toast("Choose media first.","error");return}
    for(var i=0;i<files.length;i++){var f=files[i];try{if(navigator.onLine)await uploadOne(f,f.type.indexOf("video")===0?"video":"image",false);else throw new Error("offline")}catch(e){uploadQueue.push({file:f,kind:f.type.indexOf("video")===0?"video":"image",profilePhoto:false});toast("Upload paused and queued. It will retry automatically when the network returns.","info")}}
    saveQueue();input.value="";if(typeof window.aqeRefreshServerMedia==="function")await window.aqeRefreshServerMedia().catch(function(){})
  };
  window.addEventListener("online",processUploadQueue);

  /* Install missing VIP salary screen and route link. */
  function installVipSalaryScreen(){
    if(!el("screen-aqe-vip-salary")){
      var s=document.createElement("div");s.id="screen-aqe-vip-salary";s.className="screen hidden";s.innerHTML="<div class='px4 py4'><div class='flex aic g3 mb4'><button class='btn bs2' onclick=\"showScreen('screen-me')\"><i class='fas fa-arrow-left'></i></button><h2 class='xl fw8'>VIP Salary Room</h2></div><div id='aqeVipSalaryBody'></div></div>";var main=document.querySelector("main");if(main)main.appendChild(s)
    }
    var nav=document.querySelector("#drawer nav");if(nav&&!nav.querySelector("[data-aqe-vip-salary]")){var b=document.createElement("button");b.className="dl";b.dataset.aqeVipSalary="1";b.innerHTML='<i class="fas fa-coins"></i> VIP Salary';b.onclick=function(){showScreen("screen-aqe-vip-salary");toggleDrawer()};nav.appendChild(b)}
  }

  function install(){
    hideCustomerManagerControl();loadSupportProof();installWithdrawFields();installVipSalaryScreen();
    setTimeout(openReferralRegistration,400);
    setTimeout(loadAnnouncement,600);
    setTimeout(processUploadQueue,1200);
    document.querySelectorAll("#drawer button").forEach(function(b){if(!b.dataset.finalNav){b.dataset.finalNav="1";var onclick=b.getAttribute("onclick")||"";var m=onclick.match(/showScreen\(['"]([^'"]+)['"]/);if(m)b.onclick=function(e){e&&e.preventDefault();showScreen(m[1]);var d=el("drawer");if(d)d.classList.add("hidden")}}});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
})();