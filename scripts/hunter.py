#!/usr/bin/env python3
"""Public buyer-request discovery; standard library only; never sends outreach."""
import csv
import hashlib
import html
import json
import os
from pathlib import Path
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UA = "WebsiteClientHunter/1.0 (public RSS reader)"
BUY = re.compile(r"(need|looking for|seeking|hire|hiring|wanted|want|require|recommend).{0,100}(website|web designer|web developer|landing page)|(website|web designer|web developer|landing page).{0,100}(need|wanted|hiring|help)", re.I)
SELL = re.compile(r"\[for hire\]|i (?:will|offer|build|create)|my services|available for hire", re.I)
INDIA = re.compile(r"\bindia\b|\bindian\b|\binr\b|₹|delhi|mumbai|bangalore|bengaluru|gorakhpur|hyderabad|kolkata|chennai", re.I)

def canonical(url):
    p = urlsplit(html.unescape(url.strip()))
    query = [(k,v) for k,v in parse_qsl(p.query) if not k.lower().startswith("utm_") and k not in ("ref","ref_source")]
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), urlencode(query), ""))

def clean(value):
    return html.unescape(re.sub(r"<[^>]+>", " ", value or "")).strip()

def parse_feed(raw):
    root = ET.fromstring(raw)
    ns = {"a":"http://www.w3.org/2005/Atom"}
    for item in root.findall(".//item"):
        yield {"title":clean(item.findtext("title")), "url":item.findtext("link") or "",
               "text":clean(item.findtext("description")), "published":item.findtext("pubDate") or ""}
    for item in root.findall("a:entry", ns):
        links = item.findall("a:link",ns)
        url = next((x.get("href","") for x in links if x.get("rel","alternate")=="alternate"), "")
        yield {"title":clean(item.findtext("a:title","",ns)), "url":url,
               "text":clean(item.findtext("a:content","",ns)), "published":item.findtext("a:published","",ns)}

def proposal(lead):
    price = "₹999" if lead["market"] == "India" else "$19"
    return (f"Hi! I saw your request: {lead['title']}. "
            f"I can build a mobile-friendly one-page business website starting at {price}, "
            "with your services, contact details and a contact button. "
            "Domain, paid hosting, ecommerce and custom integrations are quoted separately. "
            "Could you share the pages/features you need so I can confirm the scope and timeline?")

def main():
    DATA.mkdir(exist_ok=True)
    statefile = DATA / "state.json"
    state = json.loads(statefile.read_text()) if statefile.exists() else {"seen":[], "leads":[]}
    seen = set(state["seen"])
    feeds = []
    for sub in ("forhire","smallbusiness","Entrepreneur","web_design","slavelabour"):
        q = '"need a website" OR "looking for web designer" OR "hiring web developer"'
        feeds.append(("Reddit r/"+sub, "https://www.reddit.com/r/"+sub+"/search.rss?q="+quote(q)+"&restrict_sr=on&sort=new&t=week"))
    for q in ('"need a website" hiring', '"looking for web designer" India', '"website developer wanted"'):
        feeds.append(("Bing News", "https://www.bing.com/news/search?q="+quote(q)+"&format=rss"))
    errors, new, fetched = [], [], 0
    now = datetime.now(timezone.utc).isoformat()
    for source,url in feeds:
        try:
            with urlopen(Request(url, headers={"User-Agent":UA}), timeout=20) as response:
                rows = list(parse_feed(response.read(2_000_000)))
            fetched += 1
            for row in rows:
                text = row["title"]+" "+row["text"]
                if not BUY.search(text) or SELL.search(row["title"]) or not row["url"]:
                    continue
                link = canonical(row["url"])
                key = hashlib.sha256(link.encode()).hexdigest()
                titlekey = hashlib.sha256(re.sub(r"\W+","",row["title"].casefold()).encode()).hexdigest()
                if key in seen or titlekey in seen:
                    continue
                seen.update((key,titlekey))
                lead = dict(id=key[:16], title=row["title"], url=link, source=source,
                            published=row["published"], discovered_at=now,
                            market="India" if INDIA.search(text) else "International",
                            status="needs_review", evidence=row["text"][:1200])
                lead["price"] = "₹999" if lead["market"]=="India" else "$19"
                lead["proposal"] = proposal(lead)
                new.append(lead)
        except Exception as exc:
            errors.append({"source":source,"error":str(exc)})
        time.sleep(1)
    if not fetched:
        raise SystemExit("All discovery feeds failed; no state changed. "+json.dumps(errors))
    state["seen"] = sorted(seen)
    state["leads"].extend(new)
    state["last_run"] = now
    statefile.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n")
    fields = ["id","title","url","source","published","discovered_at","market","price","status","evidence","proposal"]
    with (DATA/"leads.csv").open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(state["leads"])
    (DATA/"latest-proposals.md").write_text("# Latest proposal drafts\n\n"+"\n\n".join(
        f"## {x['title']}\n\nSource: {x['url']}\n\nMarket: {x['market']} (verify before sending)\n\n{x['proposal']}" for x in new),encoding="utf-8")
    summary = {"run_at":now,"feeds_ok":fetched,"feeds_total":len(feeds),"new_leads":len(new),"total_leads":len(state["leads"]),"errors":errors}
    (DATA/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(summary,ensure_ascii=False))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"],"a") as f:
            f.write(f"## Client Hunter\nNew candidates: {len(new)} | Total: {len(state['leads'])} | Feeds OK: {fetched}/{len(feeds)}\n\nIndia ₹999 · International $19. Drafts only; review buyer intent and market.\n")
            for error in errors:
                f.write(f"\n- Feed warning: {error['source']}: {error['error']}\n")

if __name__ == "__main__":
    main()
