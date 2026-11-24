/* Your Ace offline matcher. No I/O, persistence, fuzzy matching or network access.
 * Conservative matching is ported from product/matching.py (SHA in API.md).
 * Strings and source rows are never rewritten in the selected input files. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YourAceMatching = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES=40*1024*1024, MAX_ROWS=100000, MAX_COLUMNS=512, MAX_FIELD=32768;
  const WS='\\t-\\r\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
  const white=new RegExp('['+WS+']','gu'), edgeWhite=new RegExp('^['+WS+']+|['+WS+']+$','gu');
  const decoration=/[♩♪♫♬🎵🎶▼▽▾▿⏷🔻][\ufe0e\ufe0f]?/gu;
  const LABELS={answered:'回答済',candidate:'一致なし',review:'要確認'};
  const DIAGNOSTIC_LABELS={both:'同一回答で両方一致',name_only:'名前のみ一致（メール一致ゼロ）',email_only:'メールのみ一致（名前一致ゼロ）',split:'名前・メールが別々の回答に一致',neither:'どちらも一致なし'};
  const PAIR_LABELS={both:'両方一致（同一回答）',name_only:'名前のみ一致',email_only:'メールのみ一致'};
  const CURRENT_NAME='１．ご依頼者様のお名前を漢字フルネームでご記入ください。';
  class DataError extends Error {constructor(message){super(message);this.name='DataError';}}
  const fail=message=>{throw new DataError(message);};
  const strip=value=>String(value??'').replace(edgeWhite,'');
  // Compare only; keep the source spelling for display/export. Not a fuzzy character match.
  const nameVariants=Object.freeze({'﨑':'崎','栁':'柳'});
  const trailingKanaReading=/([\p{Script=Han}ぁ-ゖァ-ヺー])\([ぁ-ゖァ-ヺーゝゞヽヾ・]+\)$/u;
  const normalizeName=value=>String(value??'').normalize('NFKC').replace(white,'').replace(decoration,'')
    .replace(trailingKanaReading,'$1').replace(/[﨑栁]/gu,c=>nameVariants[c]);
  const normalizeEmail=value=>strip(value).toLowerCase();
  const header=value=>String(value??'').normalize('NFKC').replace(white,'').toLowerCase();
  const validEmail=value=>typeof value==='string' && value.length>0 && value.split('@').length===2 && !new RegExp('['+WS+']','u').test(value) && value.split('@').every(Boolean);
  const length=value=>Array.from(value).length;
  function decodeBytes(input){
    const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):null;
    if(!bytes || bytes.byteLength>MAX_BYTES) fail('CSVの上限は40MBです。');
    if(!bytes.byteLength) fail('CSVが空です。');
    for(const [label,encoding] of [['UTF-8','utf-8'],['Shift_JIS (CP932)','shift_jis']]){
      try{const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);if(!text.includes('\0'))return {text,encoding:label};}catch(_){}
    }
    fail('CSVの文字コードを読めません。UTF-8またはCP932で保存してください。');
  }
  function parseCsv(value){
    if(typeof value!=='string') fail('CSVの形式を読めません。カンマ区切りCSVで保存してください。');
    if(!value.length)fail('CSVが空です。');
    if(value.length>MAX_BYTES)fail('CSVの上限は40MBです。');
    if(value.includes('\0'))fail('CSVの文字コードを読めません。UTF-8またはCP932で保存してください。');
    const text=value.charCodeAt(0)===0xfeff?value.slice(1):value;
    let cells=[],field='',quoted=false,closed=false,touched=false,line=1,headers=null;
    const records=[];
    const finishField=()=>{if(length(field)>MAX_FIELD)fail('CSVの1項目が上限を超えています。');cells.push(field);field='';closed=false;};
    const finishRow=()=>{
      const empty=!touched&&!cells.length&&!field.length;
      if(!empty)finishField();
      const row=empty?[]:cells;cells=[];touched=false;
      if(headers===null){headers=row;if(!row.length||row.length>MAX_COLUMNS)fail('CSVの列数を確認してください（上限512列）。');}
      else if(row.some(c=>strip(c))){
        if(row.length!==headers.length)fail('CSVの列数が行によって異なります。元のCSVを確認してください。');
        records.push({source_row:line,cells:row});
        if(records.length>MAX_ROWS)fail('CSVは10万行以下で読み込んでください。');
      }
    };
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){
        if(c==='"'){
          if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}
        }else if(c==='\r'||c==='\n'){
          if(c==='\r'&&text[i+1]==='\n'){field+='\r\n';i++;}else field+=c;
          line++;
        }else field+=c;
        continue;
      }
      if(closed&&c!==','&&c!=='\r'&&c!=='\n')fail('CSVの形式を読めません。カンマ区切りCSVで保存してください。');
      if(c===','){finishField();touched=true;}
      else if(c==='\r'||c==='\n'){
        finishRow();if(c==='\r'&&text[i+1]==='\n')i++;line++;
      }else if(c==='"'&&!field.length){quoted=true;touched=true;}
      else{field+=c;touched=true;}
    }
    if(quoted)fail('CSVの形式を読めません。カンマ区切りCSVで保存してください。');
    if(touched||cells.length||field.length||closed)finishRow();
    if(headers===null)fail('CSVの形式を読めません。カンマ区切りCSVで保存してください。');
    return {headers,records,columns:headers.length};
  }
  function column(headers,aliases,{required=false,explicit=null}={}){
    if(explicit!==null&&explicit!==undefined){
      if(typeof explicit==='number'&&Number.isInteger(explicit)){
        if(explicit>=0&&explicit<headers.length)return explicit;
        fail('設定したCSV列番号が見つかりません。');
      }
      if(typeof explicit!=='string')fail('CSV列の設定を確認してください。');
      aliases=[explicit];
    }
    const names=new Set(aliases.map(header)), indexes=[];headers.forEach((name,i)=>{if(names.has(header(name)))indexes.push(i);});
    if(indexes.length>1)fail('照合に使う列名が重複しています。列の設定を確認してください。');
    if(!indexes.length){if(required||explicit!==null&&explicit!==undefined)fail('照合に必要なCSV列が見つかりません。列名と設定を確認してください。');return null;}
    return indexes[0];
  }
  function parseLu(text,mapping={}){
    const {headers,records}=parseCsv(text);
    const ni=column(headers,['氏名'],{required:true,explicit:mapping.name});
    const eis=[1,2,3].map(i=>column(headers,['Email'+i],{explicit:mapping['email'+i]}));
    if(eis.every(i=>i===null))fail('Email１・Email２・Email３のいずれかの列が必要です。');
    const idi=column(headers,['依頼者ID'],{explicit:mapping.client_id});
    const optional={policy_date:column(headers,['方針変更日'],{explicit:mapping.policy_date}),ended_date:column(headers,['終了日'],{explicit:mapping.ended_date}),engagement:column(headers,['受任状況'],{explicit:mapping.engagement})};
    const rows=records.map(({source_row,cells})=>{
      const raw=eis.filter(i=>i!==null&&strip(cells[i])).map(i=>normalizeEmail(cells[i]));
      const name=strip(cells[ni]),values={};for(const [key,i] of Object.entries(optional))values[key]=i===null?'':strip(cells[i]);
      return {client_id:idi===null?'':strip(cells[idi]),name,name_key:normalizeName(name),emails:[...new Set(raw.filter(validEmail))],source_row,...values,invalid_email:raw.some(e=>!validEmail(e))};
    });
    return {rows,available:Object.keys(optional).filter(key=>optional[key]!==null),columns:headers.length};
  }
  // Canonical JST ISO strings preserve Python microseconds; Date is used only after validation.
  function dateInfo(value){
    const input=strip(value);if(!input)return null;
    // Direct Forms exports use a localized 12-hour clock and an explicit GMT offset.
    const forms=/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2}) (午前|午後) GMT([+-])(\d{1,2})(?::?(\d{2}))?$/u.exec(input.normalize('NFKC'));
    if(forms){
      const h=+forms[4],oh=+forms[9],om=+(forms[10]||0);if(h<1||h>12||oh>23||om>59)return null;
      const pad=v=>String(v).padStart(2,'0'),hour=h%12+(forms[7]==='午後'?12:0);
      return dateInfo(forms[1]+'-'+pad(forms[2])+'-'+pad(forms[3])+'T'+pad(hour)+':'+pad(forms[5])+':'+pad(forms[6])+forms[8]+pad(oh)+':'+pad(om));
    }
    let year,month,day,hour=0,minute=0,second=0,micro=0,offset=540,m;
    const slash=/^(\d{4})(?:\/(\d{1,2})\/( ?\d{1,2})|年(\d{1,2})月( ?\d{1,2})日)(?: (\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/u.exec(input);
    if(slash){
      year=+slash[1];month=+(slash[2]||slash[4]);day=+(slash[3]||slash[5]);hour=+(slash[6]||0);minute=+(slash[7]||0);second=+(slash[8]||0);
      if(slash[4]&&slash[6]&&!slash[8])return null;
    }else{
      let suffix='';
      m=/^(\d{4})-(\d{2})-(\d{2})(.*)$/u.exec(input)||/^(\d{4})(\d{2})(\d{2})(.*)$/u.exec(input);
      if(m){year=+m[1];month=+m[2];day=+m[3];suffix=m[4];}
      else{
        m=/^(\d{4})-W(\d{2})(?:-(\d))?(.*)$/u.exec(input)||/^(\d{4})W(\d{2})(\d)?(.*)$/u.exec(input);
        if(!m)return null;
        const wy=+m[1],week=+m[2],wd=+(m[3]||1),jan1=new Date(0),jan4=new Date(0);
        jan1.setUTCFullYear(wy,0,1);jan1.setUTCHours(0,0,0,0);jan4.setUTCFullYear(wy,0,4);jan4.setUTCHours(0,0,0,0);
        const leap=wy%4===0&&(wy%100!==0||wy%400===0),maxWeek=jan1.getUTCDay()===4||leap&&jan1.getUTCDay()===3?53:52;
        if(wy<1||wy>9999||week<1||week>maxWeek||wd<1||wd>7)return null;
        jan4.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()||7)+1+(week-1)*7+(wd-1));
        year=jan4.getUTCFullYear();month=jan4.getUTCMonth()+1;day=jan4.getUTCDate();suffix=m[4];
      }
      if(suffix){
        // CPython accepts one arbitrary Unicode separator, but not mixed compact/colon formats.
        const timeText=Array.from(suffix).slice(1).join('');if(!timeText)return null;
        const zi=timeText.search(/[+\-Z]/u),main=zi<0?timeText:timeText.slice(0,zi),zone=zi<0?'':timeText.slice(zi);
        const t=/^(?:(\d{2}):(\d{2})(?::(\d{2}))?|(\d{2})(\d{2})?(\d{2})?)(?:[.,](\d+))?$/u.exec(main);
        if(!t||t[7]&&!(t[3]||t[6]))return null;hour=+(t[1]||t[4]);minute=+(t[2]||t[5]||0);second=+(t[3]||t[6]||0);micro=+(t[7]||'').slice(0,6).padEnd(6,'0');
        if(zone){
          if(zone==='Z')offset=0;
          else{
            const sign=zone[0]==='-'?-1:zone[0]==='+'?1:0;if(!sign)return null;
            const z=/^(?:(\d{2}):(\d{2})(?::(\d{2}))?|(\d{2})(\d{2})?(\d{2})?)(?:[.,](\d+))?$/u.exec(zone.slice(1));if(!z||z[7]&&!(z[3]||z[6]))return null;
            offset=(+(z[1]||z[4])*60+ +(z[2]||z[5]||0)+ +(z[3]||z[6]||0)/60+ +(z[7]||'').slice(0,6).padEnd(6,'0')/60000000)*sign;if(Math.abs(offset)>=1440)return null;
          }
        }
      }
    }
    if(year<1||year>9999||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;
    const d=new Date(0);d.setUTCFullYear(year,month-1,day);d.setUTCHours(hour,minute,second,0);
    if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
    const totalMicros=BigInt(d.getTime())*1000n+BigInt(micro)-BigInt(Math.round(offset*60000000));
    const jstMicros=totalMicros+32400000000n;
    let ms=jstMicros/1000n,rest=Number(jstMicros%1000n);if(rest<0){ms--;rest+=1000;}
    const jst=new Date(Number(ms));year=jst.getUTCFullYear();if(year<1||year>9999)return null;
    const pad=(n,l=2)=>String(n).padStart(l,'0');const date=pad(year,4)+'-'+pad(jst.getUTCMonth()+1)+'-'+pad(jst.getUTCDate());
    const micros=jst.getUTCMilliseconds()*1000+rest;
    return {key:totalMicros,date,year,iso:date+'T'+pad(jst.getUTCHours())+':'+pad(jst.getUTCMinutes())+':'+pad(jst.getUTCSeconds())+(micros?'.'+pad(micros,6):'')+'+09:00'};
  }
  const parseDatetime=value=>dateInfo(value)?.iso??null;
  function responseRow(raw,i){
    const name=strip(raw.name),email=normalizeEmail(raw.email),timestamp=strip(raw.timestamp);
    return {name,name_key:normalizeName(name),email,timestamp,parsed_at:parseDatetime(timestamp),source_row:Number.isInteger(raw.source_row)?raw.source_row:i+2,valid_email:validEmail(email)};
  }
  function parseResponses(text,mapping={}){
    const {headers,records}=parseCsv(text);
    const ni=column(headers,['氏名','お名前','名前','依頼者氏名',CURRENT_NAME],{required:true,explicit:mapping.name});
    const ei=column(headers,['メールアドレス','メール','Email','email_address','ユーザー名'],{required:true,explicit:mapping.email});
    const ti=column(headers,['タイムスタンプ','回答日時','timestamp','submitted_at'],{explicit:mapping.timestamp});
    return records.map(({source_row,cells},i)=>responseRow({name:cells[ni],email:cells[ei],timestamp:ti===null?'':cells[ti],source_row},i));
  }
  const union=(...sets)=>new Set(sets.flatMap(s=>[...s]));
  const intersect=(a,b)=>new Set([...a].filter(x=>b.has(x)));
  const difference=(a,b)=>new Set([...a].filter(x=>!b.has(x)));
  const empty=new Set();
  const put=(map,key,value)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(value);};
  const owners=(map,key)=>map.get(key)||empty;
  const key=(name,email)=>JSON.stringify([name,email]);
  const sorted=values=>[...values].sort();
  function filtersFor(filters,clients){
    if(filters===undefined||filters===null)filters={};
    if(typeof filters!=='object'||Array.isArray(filters))fail('対象条件の形式を確認してください。');
    const allowed=new Set(['response_since','policy_from','policy_to','ended','engagement','identity_scope']);
    if(Object.entries(filters).some(([k,v])=>!allowed.has(k)||typeof v!=='string'||length(v)>300))fail('対象条件の形式を確認してください。');
    const clean={};for(const [k,v] of Object.entries(filters))if(strip(v))clean[k]=strip(v);
    if(!Object.hasOwn(clean,'identity_scope'))clean.identity_scope='matched';
    for(const k of ['response_since','policy_from','policy_to'])if(clean[k]&&!dateInfo(clean[k]))fail('日付の条件を確認してください。');
    if(!['any','active','ended'].includes(clean.ended||'any'))fail('終了日の条件を確認してください。');
    if(!['all','matched'].includes(clean.identity_scope))fail('名前・メールの一致範囲を選んでください。');
    const available=new Set(clients.available||[]);
    if((clean.policy_from||clean.policy_to)&&!available.has('policy_date'))fail('方針変更日列がないため、この期間条件は使えません。');
    if((clean.ended||'any')!=='any'&&!available.has('ended_date'))fail('終了日列がないため、この条件は使えません。');
    if(clean.engagement&&!available.has('engagement'))fail('受任状況列がないため、この条件は使えません。');
    if(clean.policy_from&&clean.policy_to&&dateInfo(clean.policy_from).date>dateInfo(clean.policy_to).date)fail('方針変更日の開始日は終了日以前にしてください。');
    return clean;
  }
  function scope(client,filters){
    const reasons=[];let excluded=false;
    if(filters.policy_from||filters.policy_to){const date=dateInfo(client.policy_date);if(!date)reasons.push('方針変更日が不明のため対象条件を要確認');else{if(filters.policy_from&&date.date<dateInfo(filters.policy_from).date)excluded=true;if(filters.policy_to&&date.date>dateInfo(filters.policy_to).date)excluded=true;}}
    const ended=filters.ended||'any';if(ended!=='any'){if(!client.ended_date)excluded ||= ended==='ended';else if(!dateInfo(client.ended_date))reasons.push('終了日の形式が不明のため対象条件を要確認');else excluded ||= ended==='active';}
    if(filters.engagement&&client.engagement!==filters.engagement)excluded=true;
    return {in_scope:!excluded,reasons};
  }
  function match(table,inputResponses,filters){
    if(Array.isArray(table))table={rows:table,available:table.available||[],columns:table.columns||0};
    if(!table||!Array.isArray(table.rows)||!Array.isArray(inputResponses))fail('照合するCSVを確認してください。');
    const clients=table.rows,responses=inputResponses.map(responseRow),clean=filtersFor(filters,table),since=dateInfo(clean.response_since||'');
    const byKey=new Map(),byName=new Map(),byEmail=new Map(),issues=new Map(),matched=new Map(),identity=new Set();
    clients.forEach((c,i)=>{if(c.name_key)put(byName,c.name_key,i);for(const e of c.emails){put(byEmail,e,i);if(c.name_key)put(byKey,key(c.name_key,e),i);}});
    for(const o of byKey.values())if(o.size>1)for(const i of o)put(issues,i,'LU内で同じ氏名＋メールが重複');
    const unlinked=[];let older=0,considered=0,linked=0,unknown=0,invalid=0;
    for(const r of responses){
      const parsed=dateInfo(r.timestamp);if(since&&parsed&&parsed.key<since.key){older++;continue;}
      considered++;unknown+=!parsed;for(const i of owners(byName,r.name_key))identity.add(i);if(r.valid_email)for(const i of owners(byEmail,r.email))identity.add(i);
      const identityOk=Boolean(r.name_key&&r.valid_email);invalid+=!identityOk;
      const exact=identityOk?owners(byKey,key(r.name_key,r.email)):empty,uncertain=Boolean(since&&!parsed);
      if(exact.size===1&&!uncertain){const i=[...exact][0];if(!matched.has(i))matched.set(i,[]);matched.get(i).push(r);linked++;continue;}
      let affected,reason;
      if(exact.size>1){affected=exact;reason='氏名＋メールがLU内で重複し回答先を一意に特定できない';}
      else if(uncertain){affected=exact.size?exact:union(owners(byName,r.name_key),owners(byEmail,r.email));reason='回答日時が不明のため指定日時以降か判定できない';}
      else{affected=union(owners(byName,r.name_key),owners(byEmail,r.email));reason=!identityOk?'回答側の氏名またはメールが欠損・形式不明':affected.size?'氏名のみ・メールのみ一致する回答がある':'LUの氏名＋メールに一致する連絡先なし';}
      for(const i of affected)put(issues,i,reason);
      unlinked.push({name:r.name,email:r.email,timestamp:r.timestamp,source_row:r.source_row,reason});
    }
    const rows=[];let excluded=0;
    clients.forEach((c,i)=>{
      if(clean.identity_scope==='matched'&&!identity.has(i)){excluded++;return;}
      const scoped=scope(c,clean);if(!scoped.in_scope){excluded++;return;}
      const reasons=union(issues.get(i)||empty,new Set(scoped.reasons));
      if(!c.name_key)reasons.add('LUの氏名が欠損');if(!c.emails.length)reasons.add('LUのメールが欠損・形式不明');else if(c.invalid_email)reasons.add('LUに形式不明のメールがある');
      const answers=matched.get(i)||[],dates=answers.map(r=>dateInfo(r.timestamp)),known=Boolean(answers.length&&dates.every(Boolean));let latest='';
      if(known)latest=dates.reduce((a,b)=>b.key>a.key?b:a).iso;
      let status,reason;
      if(reasons.size){status='review';reason=sorted(reasons).join(' / ');}
      else if(answers.length){status='answered';reason='氏名＋メールが一意に一致';if(answers.length>1)reason+='（同一連絡先への複数回答を集計）';if(!known)reason+=' / 回答日時に不明分があり最終日時は未確定';}
      else if(clean.identity_scope==='matched'){status='review';reason='名前またはメールの一致候補はあるが、このLU行への回答とは一意に確定できない';}
      else{status='candidate';reason='選択した回答範囲に氏名＋メールの一致なし';}
      rows.push({status,label:LABELS[status],client_id:c.client_id,name:c.name,emails:[...c.emails],source_row:c.source_row,reason,answer_count:answers.length,latest_response_at:latest});
    });
    const summary={total:rows.length,answered:0,candidate:0,review:0,excluded};for(const row of rows)summary[row.status]++;
    const result={summary,rows,filters:clean,response_summary:{total:responses.length,considered,older_excluded:older,timestamp_unknown:unknown,linked_submissions:linked,unlinked:unlinked.length,invalid_identity:invalid},unlinked_responses:unlinked};
    result.diagnostics=diagnose(table,responses,clean,rows);
    if(clean.identity_scope==='matched'){
      const related=new Set(result.diagnostics.rows.flatMap(row=>row.candidates.map(c=>c.source_row)));
      result.unlinked_responses=unlinked.filter(r=>related.has(r.source_row));result.response_summary.outside_scope=unlinked.length-result.unlinked_responses.length;result.response_summary.unlinked=result.unlinked_responses.length;
    }
    result.selection={identity_scope:clean.identity_scope,source_lu_rows:clients.length,identity_matched_lu_rows:identity.size,no_identity_match_lu_rows:clients.length-identity.size,unanswered_assessed:false};
    return result;
  }
  function diagnose(table,responses,filters,strictRows){
    const clients=table.rows,since=dateInfo(filters.response_since||''),active=responses.filter(r=>{const p=dateInfo(r.timestamp);return !(since&&p&&p.key<since.key);});
    const byName=new Map(),byEmail=new Map(),luExact=new Map();
    active.forEach((r,i)=>{if(r.name_key)put(byName,r.name_key,i);if(r.valid_email)put(byEmail,r.email,i);});
    clients.forEach((c,i)=>{if(c.name_key)for(const e of c.emails)put(luExact,key(c.name_key,e),i);});
    const inScope=new Map(strictRows.map(r=>[r.source_row,r]));
    const summary={total:0,both:0,name_only:0,email_only:0,split:0,neither:0,name_any:0,email_any:0};
    const rows=[],rn=new Set(),re=new Set(),rb=new Set(),policy={available:(table.available||[]).includes('policy_date'),present:0,blank:0,unparseable:0};
    clients.forEach((c,ci)=>{
      const strict=inScope.get(c.source_row);if(!strict)return;
      const names=c.name_key?owners(byName,c.name_key):empty,emails=union(...c.emails.map(e=>owners(byEmail,e))),exact=intersect(names,emails);
      const classification=exact.size?'both':names.size&&emails.size?'split':names.size?'name_only':emails.size?'email_only':'neither';
      const candidates=[...union(names,emails)].sort((a,b)=>a-b).map(i=>{
        const r=active[i],pair=exact.has(i)?'both':names.has(i)?'name_only':'email_only',o=owners(luExact,key(r.name_key,r.email));
        return {name:r.name,email:r.email,timestamp:r.timestamp,source_row:r.source_row,pair_type:pair,pair_label:PAIR_LABELS[pair],time_condition:since&&!dateInfo(r.timestamp)?'unknown':since?'in_range':'not_filtered',other_lu_exact_count:difference(o,new Set([ci])).size,lu_exact_count:o.size};
      });
      rows.push({...strict,classification,classification_label:DIAGNOSTIC_LABELS[classification],name_match_count:names.size,email_match_count:emails.size,both_match_count:exact.size,candidates});
      summary.total++;summary[classification]++;summary.name_any+=names.size>0;summary.email_any+=emails.size>0;
      for(const i of names)rn.add(i);for(const i of emails)re.add(i);for(const i of exact)rb.add(i);
      if(policy.available){if(c.policy_date){policy.present++;policy.unparseable+=!dateInfo(c.policy_date);}else policy.blank++;}
    });
    const dates=active.map(r=>dateInfo(r.timestamp)).filter(Boolean).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
    const coverage={responses:{total:responses.length,considered:active.length,older_excluded:responses.length-active.length,timestamp_unknown:active.filter(r=>!dateInfo(r.timestamp)).length,unique_names:new Set(active.filter(r=>r.name_key).map(r=>r.name_key)).size,unique_emails:new Set(active.filter(r=>r.valid_email).map(r=>r.email)).size,unique_pairs:new Set(active.filter(r=>r.name_key&&r.valid_email).map(r=>key(r.name_key,r.email))).size,with_name:rn.size,with_email:re.size,with_both:rb.size,neither:active.length-union(rn,re).size,earliest_at:dates[0]?.iso||'',latest_at:dates.at(-1)?.iso||''},lu_policy_dates:policy};
    const firstYear=dates[0]?.year,years=new Map(),periods=new Map();
    if(policy.available)for(const c of clients){const strict=inScope.get(c.source_row);if(!strict)continue;const parsed=dateInfo(c.policy_date),year=parsed?String(parsed.year):c.policy_date?'unparseable':'blank',period=parsed&&firstYear&&parsed.year<firstYear?'before_response_year':year;
      for(const [group,k] of [[years,year],[periods,period]]){if(!group.has(k))group.set(k,{total:0,answered:0,candidate:0,review:0});const r=group.get(k);r.total++;r[strict.status]++;}
    }
    const rank=k=>k==='blank'?0:k==='before_response_year'?1:k==='unparseable'?3:2;
    const order=map=>[...map.keys()].sort((a,b)=>rank(a)-rank(b)||(a<b?-1:a>b?1:0));
    coverage.lu_policy_years=order(years).map(k=>({year:k,...years.get(k)}));
    coverage.lu_policy_periods=order(periods).map(k=>({period:k,label:k==='blank'?'方針変更日 空欄':k==='unparseable'?'方針変更日 形式不明':k==='before_response_year'?String(firstYear)+'年より前（回答履歴開始年より前）':k+'年',...periods.get(k)}));
    return {summary,rows,coverage};
  }
  function formulaSafe(value){const s=String(value);return /^[ \t\r\n]*[=+\-@]/u.test(s)||/^[\t\r\n]/u.test(s)?"'"+s:s;}
  const encodeCsv=rows=>'\ufeff'+rows.map(row=>row.map(v=>{const s=formulaSafe(v);return /[",\r\n]/u.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\r\n')+'\r\n';
  function exportCsv(rows){return encodeCsv([['状態','依頼者ID','氏名','メールアドレス','判定理由','回答数','最終回答日時','LUの行番号'],...rows.map(r=>[r.label,r.client_id,r.name,r.emails.join(' / '),r.reason,r.answer_count,r.latest_response_at,r.source_row])]);}
  function selectDiagnostics(diagnostics,kind='all',scope='all'){
    if(!['all','both','name_only','email_only','split','neither','name_any','email_any'].includes(kind)||!['all','candidate'].includes(scope))fail('診断の分類・対象範囲を選んでください。');
    return diagnostics.rows.filter(r=>(scope!=='candidate'||r.status==='candidate')&&(kind==='all'||kind==='name_any'&&r.name_match_count>0||kind==='email_any'&&r.email_match_count>0||r.classification===kind));
  }
  function exportDiagnosticsCsv(diagnostics,kind='all',scope='all'){
    const values=[['現在の判定','診断分類（LU行単位）','LU行番号','依頼者ID','LU氏名','LUメール','名前一致回答数（両方含む）','メール一致回答数（両方含む）','同一回答で両方一致数','回答との一致種別','回答行番号','回答氏名','回答メール','回答日時','回答日時条件','他LU行への両方一致数']];
    for(const r of selectDiagnostics(diagnostics,kind,scope)){
      let candidates=r.candidates;if(['name_any','email_any','both'].includes(kind)){const allow={name_any:['both','name_only'],email_any:['both','email_only'],both:['both']}[kind];candidates=candidates.filter(c=>allow.includes(c.pair_type));}
      for(const c of candidates.length?candidates:[null])values.push([r.label,r.classification_label,r.source_row,r.client_id,r.name,r.emails.join(' / '),r.name_match_count,r.email_match_count,r.both_match_count,...(c?[c.pair_label,c.source_row,c.name,c.email,c.timestamp,{unknown:'日時不明・条件適合未確定',in_range:'下限以降',not_filtered:'下限なし'}[c.time_condition],c.other_lu_exact_count]:['一致候補なし','','','','','',''])]);
    }
    return encodeCsv(values);
  }
  return Object.freeze({version:'1.0.0',DataError,LABELS:Object.freeze(LABELS),parseCsv,decodeBytes,parseLu,parseResponses,match,normalizeName,normalizeEmail,validEmail,parseDatetime,formulaSafe,exportCsv,exportDiagnosticsCsv,selectDiagnostics,limits:Object.freeze({MAX_BYTES,MAX_ROWS,MAX_COLUMNS,MAX_FIELD})});
});
