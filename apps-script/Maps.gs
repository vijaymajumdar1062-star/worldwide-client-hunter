/* Official Places API only. API credentials and contacts never leave private Google storage. */
function initializeDiscovery_(){
  const p=props_();
  const defaults={MAPS_ENABLED:'false',RSS_IMPORT_ENABLED:'false',SEARCH_DAILY_CAP:'4',DAILY_CAP:'20'};
  Object.keys(defaults).forEach(k=>{if(!p.getProperty(k))p.setProperty(k,defaults[k]);});
  if(!p.getProperty('DEMO_SECRET'))p.setProperty('DEMO_SECRET',Utilities.getUuid()+Utilities.getUuid());
  let q=book_().getSheetByName('Queries');
  if(!q){q=book_().insertSheet('Queries');q.appendRow(['enabled','city','country','category','market']);q.setFrozenRows(1);
    const cities=[['Gorakhpur','India','India'],['Delhi','India','India'],['London','UK','International'],['Manchester','UK','International'],['Toronto','Canada','International'],['New York','USA','International'],['Sydney','Australia','International'],['Dubai','UAE','International'],['Auckland','New Zealand','International'],['Singapore','Singapore','International'],['Dublin','Ireland','International'],['Cape Town','South Africa','International']];
    const cats=['salon','restaurant','clinic','garage','cleaning','shop'];
    cities.forEach(c=>cats.forEach(cat=>q.appendRow(['YES',c[0],c[1],cat,c[2]])));
  }
}
function enableMaps(){owner_();if(!props_().getProperty('MAPS_API_KEY'))throw Error('Set MAPS_API_KEY in Script Properties first');props_().setProperty('MAPS_ENABLED','true');}
function publicUrl_(value){
  const m=String(value||'').match(/^https:\/\/([^/?#:]+)(?::443)?(?:[/?#].*)?$/i);
  if(!m)return '';
  const h=m[1].toLowerCase();
  if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)||/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(h)||/^[\d.]+$/.test(h))return '';
  return String(value).split('#')[0];
}
function siteHost_(url){const m=String(url).match(/^https:\/\/([^/:?#]+)/i);return m?m[1].toLowerCase().replace(/^www\./,''):'';}
function sitePage_(url){
  if(!publicUrl_(url))throw Error('Only public HTTPS websites can be inspected');
  let current=url;
  for(let i=0;i<4;i++){
    const res=UrlFetchApp.fetch(current,{muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true,headers:{'User-Agent':'WebsiteConceptChecker/1.0'}});
    const status=res.getResponseCode();
    if(status>=300&&status<400){
      const hs=res.getAllHeaders(),loc=String(hs.Location||hs.location||'');
      const next=loc.startsWith('/')?current.match(/^https:\/\/[^/]+/)[0]+loc:loc;
      if(!publicUrl_(next)||siteHost_(next)!==siteHost_(url))throw Error('Cross-domain or unsafe redirect requires review');
      current=next;continue;
    }
    const headers=res.getAllHeaders(),type=String(headers['Content-Type']||headers['content-type']||'');
    if(status>=200&&status<300&&!/text\/html/i.test(type))throw Error('Website is not HTML');
    return {url:current,status,html:res.getContentText().slice(0,400000)};
  }
  throw Error('Too many redirects');
}
function inspectSite_(url){
  if(!url)return {reason:'website_not_listed',target:true};
  if(!publicUrl_(url))return {reason:'website_needs_manual_check',target:false};
  try{
    const page=sitePage_(url);
    if(page.status===404||page.status===410)return {reason:'website_returns_'+page.status,target:true,page};
    if(page.status<200||page.status>=300)return {reason:'website_check_inconclusive',target:false};
    const noViewport=!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(page.html);
    const noContact=!/mailto:|tel:|contact|whatsapp|wa\.me|book(?:ing)?|appointment|enquir/i.test(page.html);
    return {reason:noViewport?(noContact?'missing_mobile_viewport_and_contact':'missing_mobile_viewport'):'no_clear_redesign_need',target:noViewport,page};
  }catch(e){return {reason:'website_check_inconclusive',target:false};}
}
function isProspect_(r){return ['website_not_listed','website_returns_404','website_returns_410','missing_mobile_viewport_and_contact','missing_mobile_viewport'].includes(r.audit_reason);}
function extractContact_(html){
  const noScripts=String(html).replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const links=[...noScripts.matchAll(/href\s*=\s*["']mailto:([^"'?\s>]+)/gi)].map(m=>m[1].replace(/&#64;|&commat;/g,'@'));
  const visible=noScripts.replace(/<[^>]*>/g,' ');
  const candidates=links.concat(visible.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]);
  return [...new Set(candidates.map(normalizeEmail_).filter(Boolean))].find(e=>!/(?:noreply|no-reply|abuse|privacy|legal|example|sentry|wixpress|wordpress)/i.test(e))||'';
}
function enrichContact_(r){
  if(!r.website||r.email||!isProspect_(r))return;
  if(r.email_found_at&&Date.now()-new Date(r.email_found_at).getTime()<7*86400000)return;
  r.email_found_at=new Date().toISOString();
  const root=publicUrl_(r.website);if(!root)return;
  const origin=root.match(/^https:\/\/[^/]+/)[0];
  for(const u of [root,origin+'/contact',origin+'/contact-us']){
    try{const page=sitePage_(u);if(page.status!==200)continue;const email=extractContact_(page.html);
      if(email){r.email=email;r.email_source=page.url;r.verified='YES';r.status='needs_verification';return;}
    }catch(e){/* No guessed or unrelated recipient. */}
  }
  r.status='needs_contact_email';
}
function discoverMaps_(){
  const p=props_();if(p.getProperty('MAPS_ENABLED')!=='true')return;
  const key=p.getProperty('MAPS_API_KEY');if(!key)throw Error('Missing MAPS_API_KEY');
  const day=new Date().toISOString().slice(0,10),cap=Number(p.getProperty('SEARCH_DAILY_CAP')||4);
  if(!Number.isInteger(cap)||cap<0||cap>48)throw Error('SEARCH_DAILY_CAP must be 0..48');
  const used=p.getProperty('SEARCH_DAY')===day?Number(p.getProperty('SEARCH_COUNT')||0):0;
  if(used>=cap)return;
  const s=book_().getSheetByName('Queries');if(!s||s.getLastRow()<2)return;
  const queries=s.getRange(2,1,s.getLastRow()-1,5).getValues().filter(x=>String(x[0]).toUpperCase()==='YES');if(!queries.length)return;
  const cursor=Number(p.getProperty('QUERY_CURSOR')||0)%queries.length,q=queries[cursor];
  p.setProperties({SEARCH_DAY:day,SEARCH_COUNT:String(used+1),QUERY_CURSOR:String((cursor+1)%queries.length)});
  const response=UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'post',contentType:'application/json',muteHttpExceptions:true,
    headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.businessStatus'},
    payload:JSON.stringify({textQuery:q[3]+' businesses in '+q[1]+', '+q[2],pageSize:10,languageCode:'en'})
  });
  if(response.getResponseCode()!==200)throw Error('Places API HTTP '+response.getResponseCode()+'; check billing, quota and API restrictions');
  const places=JSON.parse(response.getContentText()).places||[],existing=new Set(rows_().map(r=>String(r.place_id))),sheet=book_().getSheetByName('Leads');
  for(const place of places){
    if(!place.id||existing.has(place.id)||place.businessStatus!=='OPERATIONAL')continue;
    const audit=inspectSite_(place.websiteUri||'');if(!audit.target)continue;
    const name=String(place.displayName&&place.displayName.text||'').slice(0,160);if(!name)continue;
    const r={id:'maps_'+Utilities.getUuid(),title:name,business_name:name,category:q[3],city:q[1],market:q[4],place_id:place.id,website:place.websiteUri||'',url:place.googleMapsUri||'',audit_reason:audit.reason,source_kind:'maps',created_at:new Date().toISOString(),status:'needs_contact_email'};
    enrichContact_(r);r.demo_url=demoLink_(r);
    sheet.appendRow(HEADERS.map(k=>safe_(r[k]||'')));existing.add(place.id);
  }
  p.setProperty('MAPS_LAST_RUN',new Date().toISOString());
}
function businessMessage_(r){
  const observation={website_not_listed:'I could not find a website link on your business listing. You may already have one elsewhere.',website_returns_404:'The listed website page returned a not-found response when checked.',website_returns_410:'The listed website page returned a gone response when checked.',missing_mobile_viewport:'Your website may benefit from a mobile-focused redesign. This is based on a limited automated page check, so I may have missed features.',missing_mobile_viewport_and_contact:'The page check did not find a mobile viewport tag or a clear contact/booking reference; please correct me if I missed it.'}[r.audit_reason]||'I put together a website layout concept for your business.';
  return 'Hello '+r.business_name+' team,\n\n'+observation+'\n\nI made a '+r.category+' website design concept for '+r.business_name+' in '+r.city+'.\nView the demo: '+r.demo_url+'\n\nThis is a proposed design, not your official website. Photos, services and final content would be confirmed with you. A mobile-friendly one-page website starts at '+price_(r)+'. Domain, paid hosting, ecommerce and custom work are extra.\n\nWould a website like this be useful for your business?\n\nIf you prefer no contact, reply STOP or unsubscribe. I will not send automated follow-ups.\n\n'+(props_().getProperty('SENDER_NAME')||'Vijay');
}
