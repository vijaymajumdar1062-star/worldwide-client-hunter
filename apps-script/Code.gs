/* Gmail OAuth and private lead data stay in Google. Public demos expose presentation only. */
const HEADERS = ['id','title','url','market','email','email_source','verified','contact_name','status','draft_id','approval_hash','approved_at','thread_id','sent_at','followup_sent_at','reply_status','last_reply_at','error','business_name','category','city','place_id','website','audit_reason','demo_url','created_at','email_found_at','source_kind'];
const SOURCE = 'https://raw.githubusercontent.com/vijaymajumdar1062-star/worldwide-client-hunter/main/data/state.json';
function props_() { return PropertiesService.getScriptProperties(); }
function book_() { return SpreadsheetApp.openById(props_().getProperty('SHEET_ID')); }
function locked_(fn) { const l=LockService.getScriptLock(); l.waitLock(30000); try{return fn();}finally{l.releaseLock();} }
function owner_() {
  const expected=props_().getProperty('OWNER_EMAIL');
  if (!expected || Session.getActiveUser().getEmail().toLowerCase()!==expected.toLowerCase()) throw Error('Owner only');
}
function setup() {
  const p=props_(), ss=SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw Error('Use a script bound to your private Google Sheet');
  const email=Session.getEffectiveUser().getEmail();
  if(!email||Session.getActiveUser().getEmail()!==email)throw Error('Run setup interactively as the owner');
  if (p.getProperty('OWNER_EMAIL') && p.getProperty('OWNER_EMAIL')!==email) throw Error('Owner mismatch');
  p.setProperties({SHEET_ID:ss.getId(),OWNER_EMAIL:email});
  [['Leads',HEADERS],['Suppression',['email','reason','created_at']],['Ledger',['email','stage','draft_id','state','message_id','time']]].forEach(([name,headers])=>{
    let s=ss.getSheetByName(name); if(!s) s=ss.insertSheet(name);
    if(!s.getLastRow()) {s.appendRow(headers);s.setFrozenRows(1);}
    else {const old=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
      if(old.length>headers.length||old.some((v,i)=>v!==headers[i]))throw Error('Unexpected sheet headers: '+name);
      if(old.length<headers.length)s.getRange(1,1,1,headers.length).setValues([headers]);
    }
  });
  if(!p.getProperty('SEND_ENABLED'))p.setProperty('SEND_ENABLED','true');
  if(!p.getProperty('AUTO_SEND'))p.setProperty('AUTO_SEND','true');
  initializeDiscovery_();
  ScriptApp.getProjectTriggers().filter(t=>['tick','tick_'].includes(t.getHandlerFunction())).forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick_').timeBased().everyMinutes(30).create();
  onOpen();
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Client Hunter')
    .addItem('Sync and prepare drafts','tick')
    .addItem('Approve selected draft','approveSelected')
    .addItem('Suppress selected email','suppressSelected')
    .addItem('Enable Maps discovery','enableMaps')
    .addItem('Enable automatic outreach','enableAutomatic')
    .addItem('Use manual approval mode','manualMode')
    .addItem('Enable approved sending','enableSending')
    .addItem('Pause sending','pauseSending').addToUi();
}
function enableAutomatic(){owner_();props_().setProperties({AUTO_SEND:'true',SEND_ENABLED:'true'});}
function manualMode(){owner_();props_().setProperty('AUTO_SEND','false');}
function enableSending(){owner_();props_().setProperty('SEND_ENABLED','true');}
function pauseSending(){owner_();props_().setProperty('SEND_ENABLED','false');}
function rows_(){const s=book_().getSheetByName('Leads');return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,HEADERS.length).getValues().map((v,i)=>Object.assign({row:i+2},Object.fromEntries(HEADERS.map((k,j)=>[k,v[j]]))));}
function safe_(v){return typeof v==='string' && /^[=+@-]/.test(v)?"'"+v:v;}
function save_(r){book_().getSheetByName('Leads').getRange(r.row,1,1,HEADERS.length).setValues([HEADERS.map(k=>safe_(r[k]||''))]);SpreadsheetApp.flush();}
function normalizeEmail_(v){const e=String(v||'').trim().toLowerCase();return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(e)?e:'';}
function emailKey_(v){const e=normalizeEmail_(v),p=e.split('@');return p.length===2&&['gmail.com','googlemail.com'].includes(p[1])?p[0].split('+')[0].replace(/\./g,'')+'@gmail.com':e;}
function verified_(r){return String(r.verified).toUpperCase()==='YES' && !!normalizeEmail_(r.email) && /^https:\/\//i.test(r.email_source) && ['India','International'].includes(r.market);}
function blocked_(email){const s=book_().getSheetByName('Suppression');return s.getLastRow()>1 && s.getRange(2,1,s.getLastRow()-1,1).getValues().some(x=>emailKey_(x[0])===emailKey_(email));}
function suppress_(email,reason){email=normalizeEmail_(email);if(email&&!blocked_(email))book_().getSheetByName('Suppression').appendRow([safe_(email),safe_(reason),new Date().toISOString()]);}
function selected_(){const s=SpreadsheetApp.getActiveSheet(), n=s.getActiveRange().getRow();if(s.getName()!=='Leads'||n<2)throw Error('Select one Leads row');return rows_().find(r=>r.row===n);}
function suppressSelected(){owner_();locked_(()=>{const r=selected_();suppress_(r.email,'Owner opt-out');r.status='opted_out';r.approval_hash='';save_(r);});}
function ledger_(){const s=book_().getSheetByName('Ledger');return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,6).getValues();}
function reserved_(email,stage){return ledger_().some(x=>emailKey_(x[0])===emailKey_(email)&&x[1]===stage);}
function journal_(r,stage,state,message){book_().getSheetByName('Ledger').appendRow([safe_(normalizeEmail_(r.email)),stage,r.draft_id,state,message||'',new Date().toISOString()]);SpreadsheetApp.flush();}
function price_(r){return r.market==='India'?'₹999':'$19';}
function compose_(r,followup){
  if(r.source_kind==='maps')return businessMessage_(r);
  const greeting=r.contact_name?'Hi '+String(r.contact_name).replace(/[\r\n]/g,' ')+',':'Hi,';
  return greeting+'\n\n'+(followup?'One follow-up on my earlier website proposal.':'I saw your website request: '+r.title+'.\nSource: '+r.url)+
    '\n\nI can build a mobile-friendly one-page business website starting at '+price_(r)+', with services, contact details and a contact button. Domain, paid hosting, ecommerce and custom integrations are quoted separately.'+
    '\n\n'+(followup?'If this is still relevant, would you like to discuss the scope? This is my only follow-up.':'Here is a simple website layout concept for your request: Hero introduction | Services | About | Contact. The styled concept is shown in the HTML version of this email. This is a design preview, not a live website. Could you share your business name and required pages/features?')+
    '\n\nIf you prefer no further contact, reply STOP or unsubscribe and I will stop.\n\n'+(props_().getProperty('SENDER_NAME')||'Vijay');
}
function escapeHtml_(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function demoEmail_(r){
  if(r.source_kind==='maps')return '<div style="font-family:Arial,sans-serif;max-width:620px">'+escapeHtml_(businessMessage_(r)).replace(/\n/g,'<br>')+'<p><a href="'+escapeHtml_(r.demo_url)+'">View your website design demo</a></p></div>';
  const title=escapeHtml_(String(r.title||'Your website request').slice(0,180));
  return '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17243a">'+
    '<p>'+escapeHtml_(compose_(r,false)).replace(/\n/g,'<br>')+'</p>'+
    '<p style="color:#52617a;font-size:12px">PERSONALIZED LAYOUT CONCEPT · NOT A LIVE WEBSITE</p>'+
    '<table role="presentation" width="100%" cellpadding="24" cellspacing="0" style="border:1px solid #ddd;border-radius:12px">'+
    '<tr><td style="background:#152744;color:white"><p style="font-size:12px">WEBSITE DESIGN PREVIEW</p><h2>'+title+'</h2>'+
    '<p>A clear introduction to your business, with your own photos and content.</p><span style="background:#89e0c3;color:#152744;padding:10px">Contact your business</span></td></tr>'+
    '<tr><td><h3>Your services</h3><p>Space for the services you provide and the customers you help.</p><hr><h3>About your business</h3><p>Your story and business details go here.</p><hr><h3>Get in touch</h3><p>Your approved contact details and contact button go here.</p></td></tr></table>'+
    '<p>Starting at <strong>'+escapeHtml_(price_(r))+'</strong> for one page. This concept uses placeholders; no business facts or working contact buttons are claimed.</p></div>';
}
function digest_(d){const m=d.getMessage();return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([m.getTo(),m.getCc(),m.getBcc(),m.getSubject(),m.getPlainBody(),m.getBody(),m.getAttachments().map(a=>Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,a.getBytes())))])));}
function approveSelected(){owner_();locked_(()=>{
  const r=selected_();if(!['draft_ready','followup_ready'].includes(r.status)||!verified_(r)||blocked_(r.email))throw Error('Verified, unsuppressed draft required');
  const d=GmailApp.getDraft(r.draft_id),m=d.getMessage();
  if(normalizeEmail_(m.getTo())!==normalizeEmail_(r.email)||m.getCc()||m.getBcc())throw Error('Recipient mismatch or extra recipients');
  // Menu click is explicit approval of the current Gmail draft, including edits.
  r.approval_hash=digest_(d);r.approved_at=new Date().toISOString();r.status=r.status==='draft_ready'?'approved':'followup_approved';save_(r);
});}
function importCandidates_(){
  const response=UrlFetchApp.fetch(SOURCE,{muteHttpExceptions:true});if(response.getResponseCode()!==200)throw Error('Candidate import HTTP '+response.getResponseCode());
  const incoming=JSON.parse(response.getContentText()).leads;if(!Array.isArray(incoming))throw Error('Invalid candidate format');
  const ids=new Set(rows_().map(r=>String(r.id)));const s=book_().getSheetByName('Leads');
  incoming.forEach(x=>{if(x.id&&!ids.has(String(x.id))){const r={id:String(x.id),title:String(x.title||'').slice(0,300),url:String(x.url||''),market:x.market,status:'needs_verification'};s.appendRow(HEADERS.map(k=>safe_(r[k]||'')));ids.add(r.id);}});
}
function authorEmail_(from){const m=String(from).match(/<([^>]+)>/);return normalizeEmail_(m?m[1]:from);}
function freshText_(text){return String(text).split(/\n(?:On .+wrote:|Am .+schrieb|>+|[-_]{3,}|From:)/i)[0].slice(0,10000);}
function classify_(text){
  text=freshText_(text);
  if(/\b(stop|unsubscribe|opt[ -]?out|remove me|do not (?:contact|email)|don't (?:contact|email)|not interested)\b/i.test(text))return 'opt_out';
  if(/\b(out of (?:the )?office|automatic reply|auto.?reply|delivery (?:status|failure)|undeliverable)\b/i.test(text))return 'automated_or_bounce';
  if(/\b(no thanks|not now|no need|already (?:hired|found)|not looking)\b/i.test(text))return 'not_interested';
  if(/\b(interested|let.s (?:talk|discuss)|send (?:me )?(?:details|a quote)|what is (?:the )?price|how (?:much|soon)|yes please)\b/i.test(text))return 'interested_candidate';
  return 'replied_review';
}
function scanReplies_(r){
  if(!normalizeEmail_(r.email))return;
  // Also checks separate threads, so STOP need not be sent in our original thread.
  const threads=GmailApp.search('in:anywhere from:('+emailKey_(r.email)+')',0,100);
  if(threads.length===100)throw Error('Reply scan limit reached; review mailbox before sending');
  let replied=false,last='',kind='';
  threads.forEach(t=>t.getMessages().forEach(m=>{
    if(emailKey_(authorEmail_(m.getFrom()))!==emailKey_(r.email))return;
    const c=classify_(m.getPlainBody());
    if(c==='opt_out')suppress_(r.email,'Email opt-out');
    if(r.sent_at&&m.getDate().getTime()>=new Date(r.sent_at).getTime()){
      replied=true;if(!last||m.getDate().getTime()>new Date(last).getTime()){last=m.getDate().toISOString();kind=c;}
    }
  }));
  // Gmail may mark bounces separately; prevent follow-ups to failed deliveries.
  if(r.thread_id){const t=GmailApp.getThreadById(r.thread_id);if(t)t.getMessages().forEach(m=>{
    if(/mailer-daemon|postmaster/i.test(m.getFrom())){replied=true;kind='automated_or_bounce';last=m.getDate().toISOString();}
  });}
  if(blocked_(r.email)){r.status='opted_out';r.approval_hash='';}
  else if(replied){r.reply_status=kind;r.last_reply_at=last;r.status=kind;r.approval_hash='';}
}
function prepare_(r,followup){
  if(followup)throw Error('Follow-ups are handled manually by the owner');
  if(r.source_kind==='maps'){if(!isProspect_(r)){r.status='not_target';return;}r.demo_url=demoLink_(r);if(!r.demo_url)throw Error('Deploy demo web app and set DEMO_BASE_URL before outreach');}
  const email=normalizeEmail_(r.email), stage=followup?'followup':'initial';
  if(reserved_(email,stage))return;
  const others=rows_().filter(x=>x.row!==r.row&&emailKey_(x.email)===emailKey_(email));
  if(!followup&&others.some(x=>x.draft_id||x.sent_at)){r.status='duplicate_email';return;}
  const d=GmailApp.createDraft(email,(followup?'Following up: ':'Website proposal: ')+String(r.title).replace(/[\r\n]/g,' ').slice(0,150),compose_(r,false),{htmlBody:demoEmail_(r)});
  r.draft_id=d.getId();r.status=followup?'followup_ready':'draft_ready';r.approval_hash='';r.approved_at='';
  // Automatic authorization applies only to a freshly generated template, never an existing edited draft.
  if(props_().getProperty('AUTO_SEND')==='true'){
    r.approval_hash=digest_(d);r.approved_at=new Date().toISOString();r.status=followup?'followup_approved':'approved';
  }
}
const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const EMAIL_RECIPIENTS_PER_WINDOW = 100;
function recentSendReservations_(now){
  return ledger_().filter(row=>row[3]==='reserved' && Date.parse(row[5])>now-EMAIL_WINDOW_MS).length;
}
function sendApproved_(r){
  const followup=r.status==='followup_approved',stage=followup?'followup':'initial';
  if(followup){r.status='manual_followup';r.approval_hash='';return;}
  if(!['approved','followup_approved'].includes(r.status)||props_().getProperty('SEND_ENABLED')!=='true')return;
  if(!verified_(r)||blocked_(r.email)||reserved_(r.email,stage))return;
  if(followup&&(!r.sent_at||r.followup_sent_at||r.last_reply_at||Date.now()-new Date(r.sent_at).getTime()<3*86400000))return;
  const now=Date.now(), approvedAt=Date.parse(r.approved_at);
  const expired=Number.isFinite(approvedAt)&&now-approvedAt>EMAIL_WINDOW_MS;
  if(!Number.isFinite(approvedAt)||(expired&&props_().getProperty('AUTO_SEND')!=='true')){
    r.status='draft_ready';r.approval_hash='';return;
  }
  if(recentSendReservations_(now)>=EMAIL_RECIPIENTS_PER_WINDOW)return;
  const d=GmailApp.getDraft(r.draft_id),m=d.getMessage();
  if(!r.approval_hash||digest_(d)!==r.approval_hash||normalizeEmail_(m.getTo())!==normalizeEmail_(r.email)||m.getCc()||m.getBcc()){
    r.status=followup?'followup_ready':'draft_ready';r.approval_hash='';return;
  }
  // Automatic mode can resume a queued draft after its original approval expires.
  // The digest and recipient above must still match the original approval.
  if(expired)r.approved_at=new Date(now).toISOString();
  // Persist intent BEFORE Gmail send. Any uncertain outcome requires manual reconciliation.
  journal_(r,stage,'reserved');r.status='sending_uncertain';save_(r);
  const sent=d.send();journal_(r,stage,'sent',sent.getId());
  r.thread_id=sent.getThread().getId();r.status=followup?'followup_sent':'sent';
  r[followup?'followup_sent_at':'sent_at']=new Date().toISOString();r.approval_hash='';
}
function tick(){owner_();return tick_();}
function tick_(){return locked_(()=>{
  if(Session.getEffectiveUser().getEmail()!==props_().getProperty('OWNER_EMAIL'))throw Error('Run setup as the mailbox owner');
  const start=Date.now();
  if(props_().getProperty('RSS_IMPORT_ENABLED')==='true'){try{importCandidates_();}catch(e){props_().setProperty('RSS_ERROR','Candidate import failed');}}
  try{discoverMaps_();props_().deleteProperty('MAPS_ERROR');}catch(e){props_().setProperty('MAPS_ERROR',String(e.message||e).slice(0,120));}
  let processed=0;const all=rows_();
  const offset=Number(props_().getProperty('CURSOR')||0)%Math.max(1,all.length);
  const batch=all.slice(offset).concat(all.slice(0,offset));
  for(const r of batch){
    props_().setProperty('CURSOR',String(all.length?(all.indexOf(r)+1)%all.length:0));
    if(!normalizeEmail_(r.email)&&r.website&&!r.sent_at){try{enrichContact_(r);save_(r);}catch(e){r.error='Contact discovery failed';save_(r);}}
    if(!normalizeEmail_(r.email)){if(Date.now()-start>240000)break;continue;}
    try{
      scanReplies_(r);
      if(verified_(r)&&!blocked_(r.email)&&!r.last_reply_at){
        if(['needs_verification',''].includes(r.status)&&!r.sent_at)prepare_(r,false);
        // Follow-ups belong to the owner; never queue or send them automatically.
        sendApproved_(r);
      }
      r.error='';
    }catch(e){r.error=String(e.message||e).slice(0,200); /* Private sheet only. No email body logs. */}
    save_(r);if(++processed>=50||Date.now()-start>240000)break;
  }
});}
