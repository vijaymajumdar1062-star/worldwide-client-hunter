/* Gmail OAuth stays inside Google's Apps Script runtime. No web endpoint. */
const HEADERS = ['id','title','url','market','email','email_source','verified','contact_name','status','draft_id','approval_hash','approved_at','thread_id','sent_at','followup_sent_at','reply_status','last_reply_at','error'];
const SOURCE = 'https://raw.githubusercontent.com/vijaymajumdar1062-star/worldwide-client-hunter/main/data/state.json';
function props() { return PropertiesService.getScriptProperties(); }
function book() { return SpreadsheetApp.openById(props().getProperty('SHEET_ID')); }
function locked(fn) { const l=LockService.getScriptLock(); l.waitLock(30000); try{return fn();}finally{l.releaseLock();} }
function owner() {
  const expected=props().getProperty('OWNER_EMAIL');
  if (!expected || Session.getActiveUser().getEmail().toLowerCase()!==expected.toLowerCase()) throw Error('Owner only');
}
function setup() {
  const p=props(), ss=SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw Error('Use a script bound to your private Google Sheet');
  const email=Session.getEffectiveUser().getEmail();
  if (p.getProperty('OWNER_EMAIL') && p.getProperty('OWNER_EMAIL')!==email) throw Error('Owner mismatch');
  p.setProperties({SHEET_ID:ss.getId(),OWNER_EMAIL:email});
  [['Leads',HEADERS],['Suppression',['email','reason','created_at']],['Ledger',['email','stage','draft_id','state','message_id','time']]].forEach(([name,headers])=>{
    let s=ss.getSheetByName(name); if(!s) s=ss.insertSheet(name);
    if(!s.getLastRow()) {s.appendRow(headers);s.setFrozenRows(1);}
    else if(JSON.stringify(s.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers)) throw Error('Unexpected sheet headers: '+name);
  });
  if(!p.getProperty('SEND_ENABLED'))p.setProperty('SEND_ENABLED','false');
  if(!p.getProperty('DAILY_CAP'))p.setProperty('DAILY_CAP','20');
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='tick').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(30).create();
  onOpen();
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Client Hunter')
    .addItem('Sync and prepare drafts','tick')
    .addItem('Approve selected draft','approveSelected')
    .addItem('Suppress selected email','suppressSelected')
    .addItem('Enable approved sending','enableSending')
    .addItem('Pause sending','pauseSending').addToUi();
}
function enableSending(){owner();props().setProperty('SEND_ENABLED','true');}
function pauseSending(){owner();props().setProperty('SEND_ENABLED','false');}
function rows(){const s=book().getSheetByName('Leads');return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,HEADERS.length).getValues().map((v,i)=>Object.assign({row:i+2},Object.fromEntries(HEADERS.map((k,j)=>[k,v[j]]))));}
function safe(v){return typeof v==='string' && /^[=+@-]/.test(v)?"'"+v:v;}
function save(r){book().getSheetByName('Leads').getRange(r.row,1,1,HEADERS.length).setValues([HEADERS.map(k=>safe(r[k]||''))]);SpreadsheetApp.flush();}
function normalizeEmail(v){const e=String(v||'').trim().toLowerCase();return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(e)?e:'';}
function emailKey(v){const e=normalizeEmail(v),p=e.split('@');return p.length===2&&['gmail.com','googlemail.com'].includes(p[1])?p[0].split('+')[0].replace(/\./g,'')+'@gmail.com':e;}
function verified(r){return String(r.verified).toUpperCase()==='YES' && !!normalizeEmail(r.email) && /^https:\/\//i.test(r.email_source) && ['India','International'].includes(r.market);}
function blocked(email){const s=book().getSheetByName('Suppression');return s.getLastRow()>1 && s.getRange(2,1,s.getLastRow()-1,1).getValues().some(x=>emailKey(x[0])===emailKey(email));}
function suppress(email,reason){email=normalizeEmail(email);if(email&&!blocked(email))book().getSheetByName('Suppression').appendRow([safe(email),safe(reason),new Date().toISOString()]);}
function selected(){const s=SpreadsheetApp.getActiveSheet(), n=s.getActiveRange().getRow();if(s.getName()!=='Leads'||n<2)throw Error('Select one Leads row');return rows().find(r=>r.row===n);}
function suppressSelected(){owner();locked(()=>{const r=selected();suppress(r.email,'Owner opt-out');r.status='opted_out';r.approval_hash='';save(r);});}
function ledger(){const s=book().getSheetByName('Ledger');return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,6).getValues();}
function reserved(email,stage){return ledger().some(x=>emailKey(x[0])===emailKey(email)&&x[1]===stage);}
function journal(r,stage,state,message){book().getSheetByName('Ledger').appendRow([safe(normalizeEmail(r.email)),stage,r.draft_id,state,message||'',new Date().toISOString()]);SpreadsheetApp.flush();}
function price(r){return r.market==='India'?'₹999':'$19';}
function compose(r,followup){
  const greeting=r.contact_name?'Hi '+String(r.contact_name).replace(/[\r\n]/g,' ')+',':'Hi,';
  return greeting+'\n\n'+(followup?'One follow-up on my earlier website proposal.':'I saw your website request: '+r.title+'.\nSource: '+r.url)+
    '\n\nI can build a mobile-friendly one-page business website starting at '+price(r)+', with services, contact details and a contact button. Domain, paid hosting, ecommerce and custom integrations are quoted separately.'+
    '\n\n'+(followup?'If this is still relevant, would you like to discuss the scope? This is my only follow-up.':'Could you share your required pages/features so I can confirm the scope and timeline?')+
    '\n\nIf you prefer no further contact, reply STOP or unsubscribe and I will stop.\n\n'+(props().getProperty('SENDER_NAME')||'Vijay');
}
function digest(d){const m=d.getMessage();return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([m.getTo(),m.getCc(),m.getBcc(),m.getSubject(),m.getPlainBody(),m.getBody(),m.getAttachments().map(a=>Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,a.getBytes())))])));}
function approveSelected(){owner();locked(()=>{
  const r=selected();if(!['draft_ready','followup_ready'].includes(r.status)||!verified(r)||blocked(r.email))throw Error('Verified, unsuppressed draft required');
  const d=GmailApp.getDraft(r.draft_id),m=d.getMessage();
  if(normalizeEmail(m.getTo())!==normalizeEmail(r.email)||m.getCc()||m.getBcc())throw Error('Recipient mismatch or extra recipients');
  // Menu click is explicit approval of the current Gmail draft, including edits.
  r.approval_hash=digest(d);r.approved_at=new Date().toISOString();r.status=r.status==='draft_ready'?'approved':'followup_approved';save(r);
});}
function importCandidates(){
  const response=UrlFetchApp.fetch(SOURCE,{muteHttpExceptions:true});if(response.getResponseCode()!==200)throw Error('Candidate import HTTP '+response.getResponseCode());
  const incoming=JSON.parse(response.getContentText()).leads;if(!Array.isArray(incoming))throw Error('Invalid candidate format');
  const ids=new Set(rows().map(r=>String(r.id)));const s=book().getSheetByName('Leads');
  incoming.forEach(x=>{if(x.id&&!ids.has(String(x.id))){const r={id:String(x.id),title:String(x.title||'').slice(0,300),url:String(x.url||''),market:x.market,status:'needs_verification'};s.appendRow(HEADERS.map(k=>safe(r[k]||'')));ids.add(r.id);}});
}
function authorEmail(from){const m=String(from).match(/<([^>]+)>/);return normalizeEmail(m?m[1]:from);}
function freshText(text){return String(text).split(/\n(?:On .+wrote:|Am .+schrieb|>+|[-_]{3,}|From:)/i)[0].slice(0,10000);}
function classify(text){
  text=freshText(text);
  if(/\b(stop|unsubscribe|opt[ -]?out|remove me|do not (?:contact|email)|don't (?:contact|email)|not interested)\b/i.test(text))return 'opt_out';
  if(/\b(out of (?:the )?office|automatic reply|auto.?reply|delivery (?:status|failure)|undeliverable)\b/i.test(text))return 'automated_or_bounce';
  if(/\b(no thanks|not now|no need|already (?:hired|found)|not looking)\b/i.test(text))return 'not_interested';
  if(/\b(interested|let.s (?:talk|discuss)|send (?:me )?(?:details|a quote)|what is (?:the )?price|how (?:much|soon)|yes please)\b/i.test(text))return 'interested_candidate';
  return 'replied_review';
}
function scanReplies(r){
  if(!normalizeEmail(r.email))return;
  // Also checks separate threads, so STOP need not be sent in our original thread.
  const threads=GmailApp.search('in:anywhere from:('+emailKey(r.email)+')',0,100);
  if(threads.length===100)throw Error('Reply scan limit reached; review mailbox before sending');
  let replied=false,last='',kind='';
  threads.forEach(t=>t.getMessages().forEach(m=>{
    if(emailKey(authorEmail(m.getFrom()))!==emailKey(r.email))return;
    const c=classify(m.getPlainBody());
    if(c==='opt_out')suppress(r.email,'Email opt-out');
    if(r.sent_at&&m.getDate().getTime()>=new Date(r.sent_at).getTime()){
      replied=true;if(!last||m.getDate().getTime()>new Date(last).getTime()){last=m.getDate().toISOString();kind=c;}
    }
  }));
  // Gmail may mark bounces separately; prevent follow-ups to failed deliveries.
  if(r.thread_id){const t=GmailApp.getThreadById(r.thread_id);if(t)t.getMessages().forEach(m=>{
    if(/mailer-daemon|postmaster/i.test(m.getFrom())){replied=true;kind='automated_or_bounce';last=m.getDate().toISOString();}
  });}
  if(blocked(r.email)){r.status='opted_out';r.approval_hash='';}
  else if(replied){r.reply_status=kind;r.last_reply_at=last;r.status=kind;r.approval_hash='';}
}
function prepare(r,followup){
  const email=normalizeEmail(r.email), stage=followup?'followup':'initial';
  if(reserved(email,stage))return;
  const others=rows().filter(x=>x.row!==r.row&&emailKey(x.email)===emailKey(email));
  if(!followup&&others.some(x=>x.draft_id||x.sent_at)){r.status='duplicate_email';return;}
  const d=GmailApp.createDraft(email,(followup?'Following up: ':'Website proposal: ')+String(r.title).replace(/[\r\n]/g,' ').slice(0,150),compose(r,followup));
  r.draft_id=d.getId();r.status=followup?'followup_ready':'draft_ready';r.approval_hash='';r.approved_at='';
}
function todayCount(){const day=new Date().toISOString().slice(0,10);return ledger().filter(x=>String(x[5]).startsWith(day)&&x[3]==='reserved').length;}
function sendApproved(r){
  const followup=r.status==='followup_approved',stage=followup?'followup':'initial';
  if(!['approved','followup_approved'].includes(r.status)||props().getProperty('SEND_ENABLED')!=='true')return;
  if(!verified(r)||blocked(r.email)||reserved(r.email,stage))return;
  if(followup&&(!r.sent_at||r.followup_sent_at||r.last_reply_at||Date.now()-new Date(r.sent_at).getTime()<3*86400000))return;
  if(!Number.isFinite(new Date(r.approved_at).getTime())||Date.now()-new Date(r.approved_at).getTime()>24*3600000){r.status=followup?'followup_ready':'draft_ready';r.approval_hash='';return;}
  const cap=Math.max(0,Math.min(20,Number(props().getProperty('DAILY_CAP')||20)));
  if(!Number.isFinite(cap)||todayCount()>=cap)return;
  const d=GmailApp.getDraft(r.draft_id),m=d.getMessage();
  if(!r.approval_hash||digest(d)!==r.approval_hash||normalizeEmail(m.getTo())!==normalizeEmail(r.email)||m.getCc()||m.getBcc()){
    r.status=followup?'followup_ready':'draft_ready';r.approval_hash='';return;
  }
  // Persist intent BEFORE Gmail send. Any uncertain outcome requires manual reconciliation.
  journal(r,stage,'reserved');r.status='sending_uncertain';save(r);
  const sent=d.send();journal(r,stage,'sent',sent.getId());
  r.thread_id=sent.getThread().getId();r.status=followup?'followup_sent':'sent';
  r[followup?'followup_sent_at':'sent_at']=new Date().toISOString();r.approval_hash='';
}
function tick(){return locked(()=>{
  if(Session.getEffectiveUser().getEmail()!==props().getProperty('OWNER_EMAIL'))throw Error('Run setup as the mailbox owner');
  importCandidates();let processed=0;const start=Date.now(), all=rows();
  const offset=Number(props().getProperty('CURSOR')||0)%Math.max(1,all.length);
  const batch=all.slice(offset).concat(all.slice(0,offset));
  for(const r of batch){
    props().setProperty('CURSOR',String(all.length?(all.indexOf(r)+1)%all.length:0));
    if(!normalizeEmail(r.email))continue;
    try{
      scanReplies(r);
      if(verified(r)&&!blocked(r.email)&&!r.last_reply_at){
        if(['needs_verification',''].includes(r.status)&&!r.sent_at)prepare(r,false);
        if(r.status==='sent'&&!r.followup_sent_at&&Date.now()-new Date(r.sent_at).getTime()>=3*86400000)prepare(r,true);
        sendApproved(r);
      }
      r.error='';
    }catch(e){r.error=String(e.message||e).slice(0,200); /* Private sheet only. No email body logs. */}
    save(r);if(++processed>=50||Date.now()-start>240000)break;
  }
});}
