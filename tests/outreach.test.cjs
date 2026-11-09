const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync('apps-script/Code.gs','utf8');
function env(){
 const p={SEND_ENABLED:'true',DAILY_CAP:'20'},events=[],entries=[];let sends=0;
 const message={getTo:()=> 'buyer@example.com',getCc:()=>'',getBcc:()=>'',getSubject:()=> 'Website',getPlainBody:()=> 'Approved copy',getBody:()=> 'Approved copy',getAttachments:()=>[]};
 const d={getMessage:()=>message,send:()=>{sends++;return {getId:()=> 'm1',getThread:()=>({getId:()=> 't1'})};}};
 const c=vm.createContext({console,Date,Set,JSON,Math,Number,String,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>p[k],setProperty:(k,v)=>p[k]=v})},
 Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>crypto.createHash('sha256').update(s).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},
 GmailApp:{getDraft:()=>d,search:()=>[],getThreadById:()=>null,createDraft:(...args)=>{events.push(args);return {getId:()=> 'draft1'};}}
 });vm.runInContext(source,c);
 c.blocked=()=>false;c.ledger=()=>entries;c.journal=(r,stage,state)=>{events.push(state);entries.push([r.email,stage,r.draft_id,state,'',new Date().toISOString()]);};c.save=()=>events.push('saved');c.rows=()=>[];
 const r={row:2,email:'buyer@example.com',verified:'YES',email_source:'https://example.com/request',market:'India',title:'Need a bakery website',status:'approved',draft_id:'d1',approved_at:new Date().toISOString()};r.approval_hash=c.digest(d);
 return {c,p,r,d,message,events,entries,sends:()=>sends};
}
test('email validation blocks header injection and multiple recipients',()=>{const {c}=env();assert.equal(c.normalizeEmail('x@example.com\r\nBcc: a@b.com'),'');assert.equal(c.normalizeEmail('a@b.com,b@c.com'),'');assert.equal(c.normalizeEmail(' Buyer@Example.com '),'buyer@example.com');});
test('verification requires explicit proof and country',()=>{const {c,r}=env();assert.ok(c.verified(r));r.email_source='';assert.equal(c.verified(r),false);r.email_source='https://example.com';r.market='Unknown';assert.equal(c.verified(r),false);});
test('offer and followup scope are correct',()=>{const {c,r}=env();assert.match(c.compose(r,false),/₹999/);r.market='International';assert.match(c.compose(r,true),/\$19/);assert.match(c.compose(r,true),/only follow-up/);assert.match(c.compose(r,true),/STOP/);});
test('classifier prioritizes optout and does not treat uninterested as interested',()=>{const {c}=env();assert.equal(c.classify('Not interested, stop'),'opt_out');assert.equal(c.classify('I am interested, send details'),'interested_candidate');assert.equal(c.classify('No thanks'),'not_interested');assert.equal(c.classify('Automatic reply: away'),'automated_or_bounce');assert.equal(c.classify('Thanks\nOn Monday X wrote:\nSTOP'),'replied_review');});
test('pause prevents sending',()=>{const e=env();e.p.SEND_ENABLED='false';e.c.sendApproved(e.r);assert.equal(e.sends(),0);});
test('no explicit approval prevents sending',()=>{const e=env();e.r.status='draft_ready';e.c.sendApproved(e.r);assert.equal(e.sends(),0);});
test('approved email is reserved before sending and is never sent twice',()=>{const e=env();e.c.sendApproved(e.r);assert.equal(e.sends(),1);assert.equal(e.events[0],'reserved');assert.equal(e.r.status,'sent');e.r.status='approved';e.c.sendApproved(e.r);assert.equal(e.sends(),1);});
test('modified body invalidates approval',()=>{const e=env();e.message.getPlainBody=()=> 'Changed after approval';e.c.sendApproved(e.r);assert.equal(e.sends(),0);assert.equal(e.r.status,'draft_ready');});
test('recipient changes and cc invalidate approval',()=>{const e=env();e.message.getTo=()=> 'other@example.com';e.r.approval_hash=e.c.digest(e.d);e.c.sendApproved(e.r);assert.equal(e.sends(),0);const f=env();f.message.getCc=()=> 'extra@example.com';f.r.approval_hash=f.c.digest(f.d);f.c.sendApproved(f.r);assert.equal(f.sends(),0);});
test('suppression and missing verification block send',()=>{const e=env();e.c.blocked=()=>true;e.c.sendApproved(e.r);assert.equal(e.sends(),0);const f=env();f.r.verified='NO';f.c.sendApproved(f.r);assert.equal(f.sends(),0);});
test('approval expires in 24 hours',()=>{const e=env();e.r.approved_at=new Date(Date.now()-25*3600000).toISOString();e.c.sendApproved(e.r);assert.equal(e.sends(),0);assert.equal(e.r.approval_hash,'');});
test('uncertain Gmail failure is reserved and cannot automatically retry',()=>{const e=env();e.d.send=()=>{throw Error('timeout');};assert.throws(()=>e.c.sendApproved(e.r));assert.equal(e.r.status,'sending_uncertain');e.r.status='approved';e.c.sendApproved(e.r);assert.equal(e.sends(),0);assert.equal(e.entries.length,1);});
test('daily cap blocks further sends',()=>{const e=env();e.p.DAILY_CAP='0';e.c.sendApproved(e.r);assert.equal(e.sends(),0);});
test('reply tracking detects separate thread optout before first send',()=>{const e=env();let suppressed=false;e.c.suppress=()=>suppressed=true;e.c.blocked=()=>suppressed;e.c.GmailApp.search=()=>[{getMessages:()=>[{getFrom:()=> 'Buyer <buyer@example.com>',getPlainBody:()=> 'Please unsubscribe me',getDate:()=>new Date()}]}];e.c.scanReplies(e.r);assert.equal(e.r.status,'opted_out');assert.equal(suppressed,true);});
test('any inbound reply halts followups and interest remains a review candidate',()=>{const e=env();e.r.sent_at=new Date(Date.now()-86400000).toISOString();e.c.GmailApp.search=()=>[{getMessages:()=>[{getFrom:()=> 'buyer@example.com',getPlainBody:()=> 'Interested, send details',getDate:()=>new Date()}]}];e.c.scanReplies(e.r);assert.equal(e.r.status,'interested_candidate');assert.ok(e.r.last_reply_at);assert.equal(e.r.approval_hash,'');});
test('duplicate recipient cannot get a second initial draft',()=>{const e=env();e.c.rows=()=>[{row:3,email:e.r.email,draft_id:'other'}];e.c.prepare(e.r,false);assert.equal(e.r.status,'duplicate_email');assert.equal(e.events.length,0);});
test('imported formula text is escaped',()=>{const {c}=env();assert.equal(c.safe('=IMPORTXML("evil")'),'\'=IMPORTXML("evil")');});
test('Gmail dot/plus aliases share a suppression and reservation identity',()=>{const {c}=env();assert.equal(c.emailKey('Buyer.Name+sales@googlemail.com'),'buyername@gmail.com');assert.equal(c.emailKey('buyer.name+sales@example.com'),'buyer.name+sales@example.com');});
test('invalid approval timestamp and cap fail closed',()=>{const e=env();e.r.approved_at='invalid';e.c.sendApproved(e.r);assert.equal(e.sends(),0);const f=env();f.p.DAILY_CAP='invalid';f.c.sendApproved(f.r);assert.equal(f.sends(),0);});
test('reply scan overflow prevents sending rather than missing optouts',()=>{const e=env();e.c.GmailApp.search=()=>Array(100).fill({});assert.throws(()=>e.c.scanReplies(e.r),/scan limit/);assert.equal(e.sends(),0);});
test('Gmail alias reservations prevent a duplicate initial send',()=>{const e=env();e.entries.push(['buyer+sales@gmail.com','initial','d0','reserved','',new Date().toISOString()]);e.r.email='b.u.y.e.r@gmail.com';assert.equal(e.c.reserved(e.r.email,'initial'),true);});
test('automatic mode sends a fresh verified template without per-email approval',()=>{const e=env();e.p.AUTO_SEND='true';e.c.GmailApp.createDraft=()=>({getId:()=> 'd1',getMessage:e.d.getMessage});e.r.status='needs_verification';e.c.prepare(e.r,false);assert.equal(e.r.status,'approved');e.c.sendApproved(e.r);assert.equal(e.sends(),1);});
test('automatic mode never authorizes arbitrary existing edited drafts',()=>{const e=env();e.p.AUTO_SEND='true';e.r.status='draft_ready';e.r.approval_hash='';e.c.sendApproved(e.r);assert.equal(e.sends(),0);});
test('followup draft creation is disabled',()=>{const e=env();assert.throws(()=>e.c.prepare(e.r,true),/manually/);assert.equal(e.sends(),0);});
test('legacy approved followups cannot send after upgrade',()=>{const e=env();e.r.status='followup_approved';e.r.sent_at=new Date(Date.now()-4*86400000).toISOString();e.c.sendApproved(e.r);assert.equal(e.sends(),0);assert.equal(e.r.status,'manual_followup');});
test('email includes escaped demo preview with correct pricing',()=>{const e=env();e.r.title='<script>bad</script>';const h=e.c.demoEmail(e.r);assert.ok(!h.includes('<script>'));assert.match(h,/&lt;script&gt;/);assert.match(h,/₹999/);assert.match(h,/NOT A LIVE WEBSITE/);e.r.market='International';assert.match(e.c.demoEmail(e.r),/\$19/);});
test('initial draft receives demo as htmlBody',()=>{const e=env();let args;e.c.GmailApp.createDraft=(...a)=>{args=a;return {getId:()=> 'd1'};};e.c.prepare(e.r,false);assert.match(args[3].htmlBody,/WEBSITE DESIGN PREVIEW/);assert.equal(args[0],e.r.email);});
