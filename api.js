window.DemoSchema={"schemaVersion":1,"title":"お手続き確認書（デモ）","description":"架空の情報で画面を試してください。実際の氏名や連絡先は入力しないでください。","startSectionId":"contact","collectEmail":{"enabled":true,"required":true,"label":"メールアドレス（架空）"},"sections":[{"id":"contact","title":"基本情報","questions":[{"id":"name","title":"お名前（架空）","type":"short","required":true},{"id":"tel","title":"電話番号（架空・任意）","type":"short","required":false}]},{"id":"intent","title":"ご希望の手続き","questions":[{"id":"intentValue","title":"今後の進め方について、希望する内容を教えてください","type":"paragraph","required":true},{"id":"reason","title":"変更を希望する理由","type":"paragraph","required":true},{"id":"read","title":"手元の資料を確認しましたか","type":"radio","options":[{"value":"はい"},{"value":"いいえ"}],"required":true}]},{"id":"notes","title":"補足事項","next":"SUBMIT","questions":[{"id":"note","title":"事務に伝えておきたいこと（任意）","type":"paragraph","required":false}]}]};
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YourAceEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = ['short','paragraph','radio','checkbox','select','grid','checkboxGrid','date','time','scale'];
  const scalar = value => value && typeof value === 'object' && !Array.isArray(value) ? value.value : value;
  const text = value => value == null ? '' : String(value);
  const empty = value => value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
  const error = (q, code, message) => ({questionId:q.id,code,message});
  const values = q => (q.options || []).map(o => typeof o === 'string' ? o : o.value);
  const options = q => (q.options || []).map(o => typeof o === 'string' ? {value:o,label:o} : o);
  const rules = q => Array.isArray(q.validation) ? q.validation : q.validation ? [q.validation] : [];
  const label = item => typeof item === 'object' && item !== null ? item.value ?? item.label ?? item.id : item;
  function compare(actual, operator, a, b) {
    switch (operator) {
      case 'gt': return actual > Number(a);
      case 'gte': case 'min': return actual >= Number(a);
      case 'lt': return actual < Number(a);
      case 'lte': case 'max': return actual <= Number(a);
      case 'eq': case 'exact': return actual === Number(a);
      case 'ne': return actual !== Number(a);
      case 'between': return actual >= Number(a) && actual <= Number(b);
      case 'notBetween': return actual < Number(a) || actual > Number(b);
      case 'integer': return Number.isInteger(actual);
      default: return false;
    }
  }
  function matchesRule(rule, raw) {
    const value = text(scalar(raw)), number = Number(value), a = rule.value ?? rule.values?.[0], b = rule.max ?? rule.values?.[1];
    const op = rule.operator;
    switch (rule.kind) {
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'url': { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !!u.hostname; } catch { return false; } }
      case 'number': return value.trim() !== '' && Number.isFinite(number) && (op === 'isNumber' || !op || compare(number,op,a,b));
      case 'length': return compare(value.length,op,a,b);
      case 'text':
        if (op === 'contains') return value.includes(text(a));
        if (op === 'notContains') return !value.includes(text(a));
        if (op === 'eq') return value === text(a);
        return false;
      case 'regex': {
        try {
          const pattern = new RegExp(text(a));
          if (op === 'matches') return new RegExp('^(?:' + text(a) + ')$').test(value);
          if (op === 'notMatches') return !new RegExp('^(?:' + text(a) + ')$').test(value);
          if (op === 'notContains') return !pattern.test(value);
          return pattern.test(value);
        } catch { return false; }
      }
      case 'count': return compare(Array.isArray(raw) ? raw.length : 0,op,a,b);
      case 'gridUnique': {
        const selected = Object.values(raw || {}).flat().filter(v => !empty(v));
        return new Set(selected).size === selected.length;
      }
      default: return false;
    }
  }
  function validateQuestion(q, raw) {
    if (!TYPES.includes(q.type)) return [error(q,'unsupported','この質問形式は確認中です。先へ進めません。')];
    if (['grid','checkboxGrid'].includes(q.type)) {
      const rows = (q.rows || []).map(label), cols = (q.columns || []).map(label), data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      if (Object.keys(data).some(row => !rows.includes(row))) return [error(q,'choice','選択内容を確認してください。')];
      for (const row of rows) {
        const selected = q.type === 'checkboxGrid' ? (Array.isArray(data[row]) ? data[row] : []) : empty(data[row]) ? [] : [data[row]];
        if (q.required && selected.length === 0) return [error(q,'required','各行について選択してください。')];
        if (selected.some(v => !cols.includes(v)) || new Set(selected).size !== selected.length) return [error(q,'choice','選択内容を確認してください。')];
      }
      if (Object.values(data).every(empty) && !q.required) return [];
    } else {
      const value = scalar(raw);
      if (empty(value)) return q.required ? [error(q,'required','この項目を入力・選択してください。')] : [];
      if (['radio','select','checkbox','scale'].includes(q.type)) {
        const selected = q.type === 'checkbox' ? (Array.isArray(raw) ? raw.map(scalar) : [raw]) : [value];
        if (selected.some(v => !values(q).includes(v)) || new Set(selected).size !== selected.length) return [error(q,'choice','選択肢から選び直してください。')];
        for (const choice of selected) {
          if (options(q).some(o => o.value === choice && o.other)) {
            const other = Array.isArray(raw) ? raw.find(v => scalar(v) === choice) : raw;
            if (empty(other?.otherText)) return [error(q,'other','「その他」の内容を入力してください。')];
          }
        }
      }
      if (['short','paragraph','date','time'].includes(q.type) && typeof raw !== 'string') return [error(q,'format','入力形式を確認してください。')];
      if (q.type === 'date') {
        const match = text(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const date = match ? new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))) : null;
        if (!match || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2])-1 || date.getUTCDate() !== Number(match[3])) return [error(q,'date','有効な日付を入力してください。')];
      }
      if (q.type === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text(raw))) return [error(q,'time','有効な時刻を入力してください。')];
    }
    const failed = rules(q).find(rule => !matchesRule(rule,raw));
    return failed ? [error(q, failed.kind === 'unsupported' ? 'unsupported-validation' : 'validation',failed.message || '指定された入力条件を確認してください。')] : [];
  }
  function emailQuestion(schema) {
    return {id:'email',title:schema.collectEmail?.label || 'メールアドレス',type:'short',required:!!schema.collectEmail?.required,validation:[{kind:'email',message:'有効なメールアドレスを入力してください。'}]};
  }
  function validateSection(schema, section, answers) {
    const questions = [...(section.questions || [])];
    if (schema.collectEmail?.enabled && section.id === (schema.startSectionId || schema.sections[0]?.id)) questions.unshift(emailQuestion(schema));
    return questions.flatMap(q => validateQuestion(q,answers[q.id]));
  }
  function nextSection(schema, sectionId, answers) {
    const index = schema.sections.findIndex(s => s.id === sectionId);
    if (index < 0) return sectionId;
    const section = schema.sections[index];
    let destination = section.next;
    for (const q of section.questions || []) {
      if (!['radio','select'].includes(q.type)) continue;
      const choice = options(q).find(o => o.value === scalar(answers[q.id]));
      if (choice && choice.next != null) destination = choice.next;
    }
    if (destination === 'RESTART') return schema.startSectionId || schema.sections[0].id;
    if (destination == null || destination === 'CONTINUE') return schema.sections[index + 1]?.id || 'SUBMIT';
    return destination;
  }
  function traceRoute(schema, answers) {
    const sectionIds = [], seen = new Set();
    let id = schema.startSectionId || schema.sections[0]?.id;
    while (id && id !== 'SUBMIT') {
      if (seen.has(id)) return {sectionIds,error:{code:'routing-loop',sectionId:id}};
      const section = schema.sections.find(s => s.id === id);
      if (!section) return {sectionIds,error:{code:'missing-section',sectionId:id}};
      seen.add(id); sectionIds.push(id); id = nextSection(schema,id,answers);
    }
    return {sectionIds,complete:id === 'SUBMIT'};
  }
  const graphCache = new WeakMap();
  function conditionalGraph(schema) {
    if (graphCache.has(schema)) return graphCache.get(schema);
    const ids = schema.sections.map(s => s.id), all = new Set([...ids,'SUBMIT']);
    const successors = new Map(), branches = new Map();
    schema.sections.forEach((section,index) => {
      const routeQuestions = (section.questions || []).filter(q => ['radio','select'].includes(q.type) && options(q).some(o => o.next != null));
      if (routeQuestions.length > 1) throw new Error('複数の分岐質問があるセクションは確認が必要です。');
      const branch = routeQuestions[0]; if (branch) branches.set(section.id,branch);
      const destinations = branch ? options(branch).map(o => nextSection(schema,section.id,{[branch.id]:o.value})) : [nextSection(schema,section.id,{})];
      const unique = [...new Set(destinations)];
      if (unique.some(id => !all.has(id))) throw new Error('存在しない分岐先です。');
      successors.set(section.id,unique);
    });
    const post = new Map([...ids.map(id => [id,new Set(all)]),['SUBMIT',new Set(['SUBMIT'])]]);
    let changed = true, rounds = 0;
    while (changed && rounds++ < (ids.length + 1) * 2) {
      changed = false;
      for (const id of [...ids].reverse()) {
        const next = successors.get(id);
        const intersection = [...post.get(next[0])].filter(value => next.every(to => post.get(to).has(value)));
        const value = new Set([id,...intersection]), old = post.get(id);
        if (value.size !== old.size || [...value].some(item => !old.has(item))) { post.set(id,value); changed = true; }
      }
    }
    if (changed || ids.some(id => !post.get(id).has('SUBMIT'))) throw new Error('終了しない分岐があります。');
    const merges = new Map();
    for (const [id,next] of successors) {
      const common = [...post.get(next[0])].filter(value => next.every(to => post.get(to).has(value)) && value !== id);
      common.sort((a,b) => post.get(b).size - post.get(a).size);
      if (!common.length) throw new Error('分岐の合流点がありません。');
      merges.set(id,common[0]);
    }
    const graph={branches,merges,successors};graphCache.set(schema,graph);return graph;
  }
  function visibleRoute(schema, answers) {
    const graph = conditionalGraph(schema), sectionIds = [], seen = new Set();
    let id = schema.startSectionId || schema.sections[0]?.id;
    while (id && id !== 'SUBMIT') {
      if (seen.has(id)) return {sectionIds,error:{code:'routing-loop',sectionId:id}};
      const section = schema.sections.find(s => s.id === id);
      if (!section) return {sectionIds,error:{code:'missing-section',sectionId:id}};
      seen.add(id);sectionIds.push(id);
      const branch = graph.branches.get(id);
      const selected = branch && options(branch).some(o => o.value === scalar(answers[branch.id]));
      id = branch && !selected ? graph.merges.get(id) : nextSection(schema,id,answers);
    }
    return {sectionIds,complete:id === 'SUBMIT'};
  }
  function activePayload(schema, answers) {
    const route = traceRoute(schema,answers);
    if (route.error) throw new Error('分岐定義の確認が必要です。');
    const result = Object.create(null);
    if (schema.collectEmail?.enabled && Object.hasOwn(answers,'email')) result.email = answers.email;
    for (const id of route.sectionIds) for (const q of schema.sections.find(s => s.id === id).questions || []) {
      if (Object.hasOwn(answers,q.id)) result[q.id] = answers[q.id];
    }
    return {schemaVersion:schema.schemaVersion,title:schema.title,sectionIds:route.sectionIds,answers:{...result},sent:false};
  }
  function parityManifest(schema) {
    return {
      schemaVersion:schema.schemaVersion,title:schema.title,description:schema.description,collectEmail:schema.collectEmail,
      sectionCount:schema.sections.length,questionCount:schema.sections.reduce((n,s)=>n+(s.questions || []).length,0),
      sections:schema.sections.map(s=>({id:s.id,title:s.title,description:s.description,next:s.next,questions:(s.questions || []).map(q=>({id:q.id,entryId:q.entryId,type:q.type,title:q.title,description:q.description,required:q.required,options:q.options,rows:q.rows,columns:q.columns,validation:q.validation,rawType:q.rawType}))})),
    };
  }
  async function submit() { throw new Error('送信先は未接続です。本番送信は行えません。'); }
  return {TYPES,validateQuestion,validateSection,emailQuestion,nextSection,traceRoute,visibleRoute,activePayload,parityManifest,submit};
});

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

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YourAceWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MISSING_LABELS = {
    'config.attorneys': '弁護士の担当順を設定してください。',
    'config.attorneys.calendarId': '有効な弁護士の予定表IDを設定してください。',
    'config.attorneys.shiftName': 'シフト表の氏名を設定してください。',
    'config.shiftSpreadsheetId': '共有シフト表の参照先を設定してください。',
    'config.autoStartAt': '自動送信の開始日時を設定してください。',
    'config.lawyerRoomId': '弁護士確認用のChatworkルームIDを設定してください。',
    'config.officeStaff': '事務担当者を設定してください。',
    'config.officeRoomId': '事務処理用のChatworkルームIDを設定してください。',
    'config.luUrlTemplate': '確認済みのLU依頼者URLを設定してください。',
    'config.luUrlVerified': 'LU依頼者URLの実際の遷移先を確認してください。',
    'config.externalEnabled': '外部連携は停止中です。',
    'host.tokenConfigured': 'Chatworkトークンが未設定です。',
    'host.externalEnabled': '実行環境の外部連携は停止中です。',
    'case.identityConfirmed': '本人・依頼者IDを人が確認してください。',
    'case.targetConfirmed': '今回の依頼の対象回答であることを確認してください。',
    'case.contentStatus': '回答内容を確認し、不備がない状態にしてください。',
    'case.responseIds': '今回の依頼に使う回答を選択してください。',
    'case.responseSetChanged': '回答候補が追加・変更されています。今回の依頼と回答内容をもう一度確認してください。',
    'case.responseUrls': '選択した回答の非公開HTTPS確認リンクが必要です。',
    'case.historicalCompleted': '過去処理済みのため送信対象外です。',
    'case.lawyerResult': '弁護士の承認結果を人が記録してください。',
    'case.originalLawyerRequest': '送信済みの弁護士確認依頼が必要です。',
    'case.officeAccountId': '事務担当者を選択してください。',
    'case.lawyerSent': 'この依頼の弁護士タスクは送信済み・確認中です。',
    'case.reviewAccess': '担当弁護士の確認パスワードとHTTPSの確認画面を設定してください。',
    'case.reviewDecision': '弁護士が専用画面で「問題なし」を記録し、Chatworkのタスクを完了するまでお待ちください。',
    'case.officeSent': 'この依頼の事務タスクは送信済み・確認中です。',
    'case.taskWithdrawn': '取り下げ済みです。再依頼する場合は「誤送信を訂正」から準備してください。',
    'case.correctionAccount': '再依頼先が設定にありません。「誤送信を訂正」から送信先を選び直してください。',
    'availability.unknown': '担当順の弁護士の予定が未確認です。',
    'availability.none': '本日依頼できる弁護士がいません。'
  };
  const clone = value => { try { return JSON.parse(JSON.stringify(value)); } catch (_) { bad('INVALID_INPUT'); } };
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const defaults = () => ({ attorneys: [], officeStaff: [], lawyerRoomId: '', officeRoomId: '', senderAccountId: '', holidayKeywords: [], luUrlTemplate: '', luUrlVerified: false, externalEnabled: false, autoDispatchEnabled: false, autoOfficeReturnEnabled: false, autoOfficeAccountId: '', autoScopeKey: '', autoStartAt: '', attendanceSource: 'calendar', shiftSpreadsheetId: '', shiftSheetPattern: '{YYYY}{M}' });
  const CONFIG_KEYS = Object.keys(defaults());
  const EDIT_KEYS = ['clientId', 'cycleKey', 'responseIds', 'identityConfirmed', 'targetConfirmed', 'contentStatus', 'note', 'officeAccountId', 'lawyerResult', 'officeStatus', 'historicalCompleted'];
  const CASE_KEYS = EDIT_KEYS.concat(['caseKey', 'lawyerSent', 'officeSent', 'assignedAttorneyId', 'reviewedCandidateHash', 'version', 'createdAt', 'updatedAt', 'automation', 'sendRecovery', 'lawyerReview']);
  function bad(code, message) { const e = new Error(message || '入力内容を確認してください。'); e.code = code; e.userSafe = true; throw e; }
  function record(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) bad('INVALID_INPUT');
    if (Object.keys(value).some(k => ['__proto__', 'prototype', 'constructor'].includes(k) || keys && !keys.includes(k))) bad('INVALID_INPUT');
    return value;
  }
  function string(value, max, empty) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || !empty && !value.trim()) bad('INVALID_INPUT');
    return value;
  }
  function identifier(value, max = 120, empty = false) { string(value, max, empty); if (value.trim() !== value || /[\r\n\t]/.test(value)) bad('INVALID_INPUT'); return value; }
  function numeric(value, empty = false) { if (empty && value === '') return value; if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) bad('INVALID_INPUT'); return value; }
  function bool(value) { if (typeof value !== 'boolean') bad('INVALID_INPUT'); return value; }
  function list(value, max) { if (!Array.isArray(value) || value.length > max) bad('INVALID_INPUT'); return value; }
  function enumValue(value, values) { if (!values.includes(value)) bad('INVALID_INPUT'); return value; }
  function validateConfig(value, current) {
    record(value, CONFIG_KEYS); const c = clone(current || defaults());
    for (const key of CONFIG_KEYS) if (own(value, key)) c[key] = clone(value[key]);
    if (own(value, 'luUrlTemplate') && value.luUrlTemplate !== (current || {}).luUrlTemplate && !own(value, 'luUrlVerified')) c.luUrlVerified = false;
    for (const key of ['luUrlVerified', 'externalEnabled', 'autoDispatchEnabled', 'autoOfficeReturnEnabled']) bool(c[key]);
    identifier(c.autoScopeKey, 80, !c.autoDispatchEnabled);
    identifier(c.autoStartAt, 40, !c.autoDispatchEnabled);if(c.autoStartAt&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(c.autoStartAt)||!Number.isFinite(Date.parse(c.autoStartAt))))bad('INVALID_INPUT');
    enumValue(c.attendanceSource,['calendar','shift']);identifier(c.shiftSpreadsheetId,160,true);if(c.shiftSpreadsheetId&&!/^[A-Za-z0-9_-]{10,160}$/.test(c.shiftSpreadsheetId))bad('INVALID_INPUT');identifier(c.shiftSheetPattern,80);if((c.shiftSheetPattern.match(/\{YYYY\}/g)||[]).length!==1||(c.shiftSheetPattern.match(/\{MM?\}/g)||[]).length!==1||/[{}\/\\]/.test(c.shiftSheetPattern.replace('{YYYY}','').replace(/\{MM?\}/,'')))bad('INVALID_INPUT');
    for (const key of ['lawyerRoomId', 'officeRoomId', 'senderAccountId', 'autoOfficeAccountId']) numeric(c[key], true);
    for (const key of ['attorneys', 'officeStaff']) {
      const ids = new Set();
      list(c[key], 100).forEach(person => {
        record(person, key === 'attorneys' ? ['id', 'label', 'calendarId', 'enabled', 'shiftName'] : ['id', 'label']); numeric(person.id); string(person.label, 120, false);
        if (ids.has(person.id)) bad('INVALID_INPUT'); ids.add(person.id);
        if (key === 'attorneys') { identifier(person.calendarId, 320, true); if(own(person,'shiftName'))identifier(person.shiftName,120,true); bool(person.enabled); }
      });
    }
    if (c.autoOfficeReturnEnabled && (!c.autoOfficeAccountId || !c.officeStaff.some(a=>a.id===c.autoOfficeAccountId) || !c.officeRoomId)) bad('INVALID_INPUT', '事務への自動返却先を設定してください。');
    list(c.holidayKeywords, 30).forEach(word => identifier(word, 120));
    identifier(c.luUrlTemplate, 2000, true);
    if (c.luUrlTemplate && (!/^https:\/\/fixture\.example\.test(?::443)?\//.test(c.luUrlTemplate) || /[\s\\\[\]<>"'#]/.test(c.luUrlTemplate) || (c.luUrlTemplate.match(/\{id\}/g) || []).length !== 1 || /[{}]/.test(c.luUrlTemplate.replace('{id}', '')))) bad('INVALID_INPUT');
    if (!c.luUrlTemplate && c.luUrlVerified) bad('INVALID_INPUT');
    return c;
  }
  function createEngine(host) {
    if (!host || ['now', 'hash', 'random'].some(k => typeof host[k] !== 'function')) bad('INVALID_INPUT');
    const hash = value => String(host.hash(String(value)));
    function time() { const ms = Date.parse(host.now()); if (!Number.isFinite(ms)) bad('INVALID_INPUT'); return new Date(ms).toISOString(); }
    function init(state) {
      record(state);
      if (!own(state, 'workflow') || state.workflow == null) state.workflow = { config: defaults(), cases: [], drafts: [], sends: [], cursor: 0 };
      const w = record(state.workflow, ['config', 'cases', 'drafts', 'sends', 'cursor', 'reviewCredentials']);
      const old = w.config || {}, c = defaults(); record(old);
      for (const k of CONFIG_KEYS) if (own(old, k)) c[k] = clone(old[k]);
      w.config = c;
      for (const k of ['cases', 'drafts', 'sends']) if (!own(w, k)) w[k] = [];
      for (const k of ['cases', 'drafts', 'sends']) list(w[k], 20000);
      if (!own(w, 'cursor')) w.cursor = 0;
      if (!Number.isSafeInteger(w.cursor) || w.cursor < 0) bad('INVALID_INPUT');
      return w;
    }
    function setup(config, ctx) {
      const missing = [], c = config;
      if (!c.attorneys.some(a => a.enabled)) missing.push('config.attorneys');
      if(c.attendanceSource==='shift'){if(!c.shiftSpreadsheetId)missing.push('config.shiftSpreadsheetId');if(c.attorneys.some(a=>a.enabled&&!a.shiftName))missing.push('config.attorneys.shiftName');}
      else if (c.attorneys.some(a => a.enabled && !a.calendarId)) missing.push('config.attorneys.calendarId');
      if(c.autoDispatchEnabled&&!c.autoStartAt)missing.push('config.autoStartAt');
      if (!c.lawyerRoomId) missing.push('config.lawyerRoomId');
      if (!c.officeStaff.length) missing.push('config.officeStaff');
      if (!c.officeRoomId) missing.push('config.officeRoomId');
      if (!c.externalEnabled) missing.push('config.externalEnabled');
      if (ctx) { if (!ctx.tokenConfigured) missing.push('host.tokenConfigured'); if (!ctx.externalEnabled) missing.push('host.externalEnabled'); }
      return missing;
    }
    function publicCase(c) { const out = {}; for (const k of CASE_KEYS) if (own(c, k)) out[k] = clone(c[k]); return out; }
    function get(state, ctx) {
      const w = init(state);
      return clone({ config: w.config, cases: w.cases.map(publicCase), cursor: w.cursor, setupMissing: setup(w.config, ctx), missingLabels: MISSING_LABELS });
    }
    function configure(state, config) {
      const w = init(state), next = validateConfig(config, w.config); w.config = next;
      return get(state);
    }
    function validateContext(ctx, clientId) {
      record(ctx); record(ctx.client); identifier(ctx.client.id); if (ctx.client.id !== clientId) bad('INVALID_INPUT');
      const candidates = list(ctx.candidateResponseIds, 500); candidates.forEach(id => identifier(id));
      return candidates;
    }
    const candidateHash = ids => hash(JSON.stringify([...new Set(ids)].sort()));
    function saveCase(state, p, ctx) {
      const w = init(state); record(p, EDIT_KEYS); identifier(p.clientId); identifier(p.cycleKey);
      const candidates = validateContext(ctx, p.clientId), reviewedCandidateHash = candidateHash(candidates), caseKey = 'case_' + hash(JSON.stringify([p.clientId, p.cycleKey]));
      const old = w.cases.find(c => c.caseKey === caseKey), next = old ? clone(old) : {
        caseKey, clientId: p.clientId, cycleKey: p.cycleKey, responseIds: [], identityConfirmed: false, targetConfirmed: false, contentStatus: 'unchecked', note: '', officeAccountId: '', lawyerResult: 'pending', officeStatus: 'pending', historicalCompleted: false, lawyerSent: 'not_sent', officeSent: 'not_sent', assignedAttorneyId: '', reviewedCandidateHash, version: 0, createdAt: time(), updatedAt: time()
      };
      for (const key of EDIT_KEYS) if (own(p, key)) next[key] = clone(p[key]);
      list(next.responseIds, 200).forEach(id => { identifier(id); if (!candidates.includes(id)) bad('INVALID_INPUT'); });
      if (new Set(next.responseIds).size !== next.responseIds.length) bad('INVALID_INPUT'); next.responseIds.sort();
      for (const key of ['identityConfirmed', 'targetConfirmed', 'historicalCompleted']) bool(next[key]);
      enumValue(next.contentStatus, ['unchecked', 'incomplete', 'ready']); enumValue(next.lawyerResult, ['pending', 'approved', 'returned']); enumValue(next.officeStatus, ['pending', 'done']);
      string(next.note, 4000, true); numeric(next.officeAccountId, true);
      if (next.officeAccountId && !w.config.officeStaff.some(a => a.id === next.officeAccountId)) bad('INVALID_INPUT');
      if (old && (old.reviewedCandidateHash !== reviewedCandidateHash || JSON.stringify(old.responseIds) !== JSON.stringify(next.responseIds))) {
        if (['sending', 'sent', 'unknown'].includes(old.lawyerSent) || ['sending', 'sent', 'unknown'].includes(old.officeSent) || old.historicalCompleted === true || old.officeStatus === 'done') bad('CASE_LOCKED', '送信・完了記録がある依頼の回答候補は変更できません。新しい今回の依頼を作成してください。');
        Object.assign(next, { identityConfirmed: false, targetConfirmed: false, contentStatus: 'unchecked', lawyerResult: 'pending', officeStatus: 'pending', historicalCompleted: false });
      }
      if (old && isHeld(w, old, 'lawyer') && next.lawyerResult !== 'pending') bad('CORRECTION_BLOCKED', '再依頼が送信されるまでは、弁護士の確認結果を記録できません。');
      if (old && next.officeStatus === 'done' && (isHeld(w, old, 'lawyer') || replacementFor(w, old, 'office'))) bad('CORRECTION_BLOCKED', '再依頼の確認中は処理済みにできません。');
      next.reviewedCandidateHash = reviewedCandidateHash;
      if (next.historicalCompleted && (!next.identityConfirmed || !next.targetConfirmed || !next.note.trim())) bad('INVALID_INPUT');
      if (next.officeStatus === 'done' && next.lawyerResult !== 'approved' && !next.historicalCompleted) bad('INVALID_INPUT', '事務処理完了の前に弁護士の承認結果を記録してください。');
      const edited = !old || old.reviewedCandidateHash !== next.reviewedCandidateHash || EDIT_KEYS.some(k => JSON.stringify(old[k]) !== JSON.stringify(next[k]));
      if (edited) { next.version++; next.updatedAt = time(); }
      if (old) w.cases[w.cases.indexOf(old)] = next; else w.cases.push(next);
      return { case: clone(publicCase(next)) };
    }
    const escaped = value => String(value).replace(/\[/g, '［').replace(/\]/g, '］');
    const secureUrl = value => typeof value === 'string' && value.length <= 4000 && (value.startsWith(location.origin+'/')&&/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(location.origin) || /^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?#][^\s\\\[\]<>"']*)?$/.test(value));
    function today() { const ms = Date.parse(time()), day = Math.floor((ms + 32400000) / 86400000); return { day, limit: day * 86400 - 32400 }; }
    function findCase(w, key) { identifier(key, 300); const c = w.cases.find(item => item.caseKey === key); if (!c) bad('NOT_FOUND', '今回の依頼が見つかりません。'); return c; }
    const statusField = kind => kind === 'lawyer' ? 'lawyerSent' : 'officeSent';
    const latestSuccessful = (w, c, kind) => w.sends.slice().reverse().find(s => s.caseKey === c.caseKey && s.kind === kind && s.status === 'sent');
    const withdrawn = send => !!send?.corrections?.some(item => ['withdraw','withdraw_reissue'].includes(item.action));
    const effectiveAccount = send => (send.corrections || []).slice().reverse().find(item => item.action === 'reassign')?.accountId || send.request.accountId;
    const correctionRoster = (w, kind) => kind === 'lawyer' ? w.config.attorneys.filter(a => a.enabled) : w.config.officeStaff;
    const isHeld = (w, c, kind) => ['withdrawn','reissue_ready','failed'].includes(c[statusField(kind)]) && withdrawn(latestSuccessful(w, c, kind));
    function replacementFor(w, c, kind) {
      if (!['reissue_ready','failed'].includes(c[statusField(kind)])) return null;
      const send = latestSuccessful(w, c, kind);
      return withdrawn(send) ? send.corrections[send.corrections.length - 1] : null;
    }
    function correctionBlock(c, kind) {
      if (c.historicalCompleted || c.officeStatus === 'done') return '処理が完了しているため、この画面では訂正できません。';
      if (kind === 'lawyer' && ['sent','sending','unknown'].includes(c.officeSent)) return '事務へ返却済み、または返却結果の確認中です。先に事務タスクを確認し、必要なら取り下げを記録してください。';
      return '';
    }
    function taskInfo(state, p) {
      const w = init(state); record(p, ['caseKey']); const c = findCase(w, p.caseKey);
      const tasks = ['lawyer','office'].flatMap(kind => {
        const send = latestSuccessful(w, c, kind);
        if (!send) return [];
        const status = c[statusField(kind)], held = withdrawn(send), block = correctionBlock(c, kind) || (['sending','unknown'].includes(status) ? '送信結果が未確定のため、訂正・再送はできません。' : '');
        return [{ kind, sendId: send.id, roomId: send.request.roomId, taskIds: send.taskIds, accountId: effectiveAccount(send), withdrawn: held, status, block,
          history: send.corrections || [], archived: w.sends.filter(s => s.caseKey === c.caseKey && s.kind === kind && s.id !== send.id && withdrawn(s)).slice(-10).reverse().flatMap(s => s.corrections.map(item => ({ ...item, taskIds: s.taskIds }))), nextAccountId: replacementFor(w, c, kind)?.accountId || '' }];
      });
      return clone({ version: c.version, tasks });
    }
    function correctTask(state, p) {
      const w = init(state); record(p, ['caseKey','kind','sendId','expectedVersion','action','accountId','reason','confirmed']);
      enumValue(p.kind, ['lawyer','office']); enumValue(p.action, ['withdraw','withdraw_reissue','reassign','prepare']);
      identifier(p.sendId, 300); string(p.reason, 500, false); numeric(p.accountId, true);
      if (p.confirmed !== true) bad('APPROVAL_REQUIRED', 'Chatworkで元タスクを訂正したことを確認してください。');
      const c = findCase(w, p.caseKey), field = statusField(p.kind), send = latestSuccessful(w, c, p.kind);
      if (c.version !== p.expectedVersion || send?.id !== p.sendId) bad('STALE_TASK', '対応状態が変わりました。画面を開き直して確認してください。');
      const block = correctionBlock(c, p.kind);
      if (block) bad('CORRECTION_BLOCKED', block);
      const held = withdrawn(send);
      if (p.action === 'prepare' ? !isHeld(w, c, p.kind) : held || c[field] !== 'sent') bad('CORRECTION_BLOCKED', '対象タスクの状態を確認してください。送信結果が未確定の場合は再送できません。');
      const current = effectiveAccount(send);
      if (p.action === 'withdraw' ? p.accountId !== '' : !correctionRoster(w, p.kind).some(person => person.id === p.accountId)) bad('INVALID_INPUT', '設定済みの担当者を選択してください。');
      if (p.action === 'reassign' && current === p.accountId) bad('INVALID_INPUT', '元の担当者と異なる担当者を選んでください。');
      if (!send.corrections) send.corrections = [];
      send.corrections.push({ action: p.action, accountId: p.accountId, previousAccountId: current, reason: p.reason.trim(), at: time() });
      if (p.kind === 'lawyer') delete c.lawyerReview;
      if (p.action === 'reassign') {
        if (p.kind === 'lawyer') { c.assignedAttorneyId = p.accountId; c.lawyerResult = 'pending'; }
        else c.officeAccountId = p.accountId;
      } else {
        c[field] = p.action === 'withdraw' ? 'withdrawn' : 'reissue_ready';
        if (p.kind === 'lawyer') { c.assignedAttorneyId = ''; c.lawyerResult = 'pending'; }
      }
      c.version++; c.updatedAt = time();
      return { case: publicCase(c) };
    }
    function pendingInfo(state, p) {
      const w=init(state); record(p,['caseKey']); const c=findCase(w,p.caseKey);
      const pending=['lawyer','office'].flatMap(kind=>{
        const send=pendingSend(w,c,kind); if(!send) return [];
        const {request}=send;
        return [{kind, sendId:send.id, roomId:request.roomId, accountId:request.accountId, reference:send.reference || '',
          attemptedAt:send.createdAt, body:request.body, inProgress:remaining(send,false)>0, waitSeconds:Math.ceil(remaining(send,true)/1000)}];
      });
      return clone({version:c.version,pending});
    }
    function pendingSend(w,c,kind) {
      const field=statusField(kind);
      if(!['sending','unknown'].includes(c[field])) return null;
      return w.sends.slice().reverse().find(s=>s.caseKey===c.caseKey&&s.kind===kind&&s.status===c[field]) || null;
    }
    function remaining(send, absence) {
      const base=Date.parse(send.status==='sending' ? send.createdAt : send.finishedAt || send.createdAt);
      const age=Date.parse(time())-base;
      if(!Number.isFinite(age)) return 900000;
      return Math.max(0,(send.status==='sending' ? 900000 : absence ? 300000 : 0)-age);
    }
    function recoveryTarget(state,p) {
      const w=init(state); record(p,['caseKey','kind','sendId','expectedVersion','action','taskId','confirmed','reason']);
      enumValue(p.kind,['lawyer','office']); enumValue(p.action,['check','find_id','not_created']);
      identifier(p.sendId,300); if(p.action==='find_id') numeric(p.taskId);
      if(p.action==='not_created'){
        if(p.confirmed!==true) bad('APPROVAL_REQUIRED','Chatworkにタスクがないことを確認してください。');
        string(p.reason,500,false);
      }
      const c=findCase(w,p.caseKey), send=pendingSend(w,c,p.kind);
      if(c.version!==p.expectedVersion || send?.id!==p.sendId) bad('STALE_TASK','対応状態が変わりました。画面を開き直して確認してください。');
      if(remaining(send,p.action==='not_created')>0) bad('RECOVERY_WAIT','まだ送信処理中の可能性があります。画面に表示された時間を置いて再確認してください。');
      numeric(send.request.roomId); numeric(send.request.accountId);
      return {w,c,send};
    }
    function recoveryQuery(state,p) {
      const {send}=recoveryTarget(state,p);
      return clone({roomId:send.request.roomId,accountId:send.request.accountId,taskId:p.action==='find_id'?p.taskId:''});
    }
    const comparableBody = value => typeof value==='string' ? value.replace(/\r\n/g,'\n') : '';
    const remoteId = value => typeof value==='string' || Number.isSafeInteger(value) ? String(value) : '';
    function reconcileSend(state,p,evidence) {
      const {w,c,send}=recoveryTarget(state,p);
      if(!evidence || !Array.isArray(evidence.rows) || evidence.rows.length>200) bad('RECOVERY_READ_FAILED','Chatworkの確認結果が不明です。再送せず、時間を置いて確認してください。');
      const body=comparableBody(send.request.body), reference=send.reference ? '送信照会番号：'+send.reference : '';
      const related=new Map();
      let complete=evidence.complete===true;
      for(const row of evidence.rows){
        const id=remoteId(row?.task_id), account=remoteId(row?.account?.account_id), lines=comparableBody(row?.body);
        if(!/^[1-9][0-9]{0,19}$/.test(id)||!/^[1-9][0-9]{0,19}$/.test(account)||!lines||!['open','done'].includes(row?.status)){complete=false;continue;}
        if(p.action==='find_id' && id!==p.taskId) {complete=false;continue;}
        if(lines!==body && (!reference || !lines.split('\n').includes(reference))) continue;
        const usable=lines===body && account===send.request.accountId && !w.sends.some(other=>other.id!==send.id && other.request.roomId===send.request.roomId && other.taskIds.includes(id));
        if(related.get(id)===false||!usable) related.set(id,false); else related.set(id,true);
      }
      if(related.size>1 || [...related.values()].includes(false)) return {status:'ambiguous'};
      if(!complete) return {status:'incomplete'};
      const taskId=[...related.keys()][0];
      if(taskId){
        if(p.action==='not_created') return {status:'found_pending',taskId};
        if(!send.reference && p.action==='check') return {status:'legacy_match',taskId};
        finishSend(state,{sendId:send.id,outcome:'sent',taskIds:[taskId]});
        send.reconciliation={outcome:'sent',source:'chatwork_read',taskId,at:time()};
        c.sendRecovery={...c.sendRecovery,[p.kind]:{outcome:'sent',at:time()}};
        return {status:'recorded_sent',taskId,case:publicCase(c)};
      }
      if(p.action!=='not_created') return {status:'not_found'};
      finishSend(state,{sendId:send.id,outcome:'failed',taskIds:[]});
      send.reconciliation={outcome:'not_created',source:'operator_confirmed',reason:p.reason.trim(),at:time()};
      c.sendRecovery={...c.sendRecovery,[p.kind]:{outcome:'not_created',at:time()}};
      return {status:'recorded_not_created',case:publicCase(c)};
    }
    function selectAttorney(w, ctx, skipped, missing) {
      const attorneys = w.config.attorneys;
      if (!attorneys.some(a => a.enabled)) { missing.push('config.attorneys'); return null; }
      const availability = ctx.availability || {}; record(availability);
      for (let offset = 0; offset < attorneys.length; offset++) {
        const index = (w.cursor + offset) % attorneys.length, a = attorneys[index];
        if (!a.enabled) { skipped.push({ attorneyId: a.id, reason: 'disabled' }); continue; }
        if (w.sends.some(s => s.kind === 'lawyer' && s.request.accountId === a.id && ['sending', 'unknown'].includes(s.status))) { skipped.push({ attorneyId: a.id, reason: 'in_flight' }); continue; }
        if (availability[a.id] === 'absent') { skipped.push({ attorneyId: a.id, reason: 'absent' }); continue; }
        if (availability[a.id] !== 'available') { missing.push('availability.unknown'); skipped.push({ attorneyId: a.id, reason: 'unknown' }); return null; }
        return { id: a.id, index, label: a.label };
      }
      missing.push('availability.none'); return null;
    }
    function materialize(w, c, kind, ctx, reference = '') {
      const candidates = validateContext(ctx, c.clientId), missing = [], skipped = [], config = w.config, day = today();
      const reissue = replacementFor(w, c, kind);
      if (c[statusField(kind)] === 'withdrawn') missing.push('case.taskWithdrawn');
      const automatic = !reissue && !c.sendRecovery?.lawyer && kind === 'lawyer' && config.autoDispatchEnabled === true && c.automation?.source === 'matched' && c.automation.scopeKey === config.autoScopeKey && ctx.automaticEligible === true && Array.isArray(ctx.automaticResponseIds) && c.responseIds.every(id => ctx.automaticResponseIds.includes(id));
      string(ctx.client.name, 300, true); const emails = ctx.client.emails || []; list(emails, 10).forEach(v => identifier(v, 320, true));
      if (!c.identityConfirmed && !automatic) missing.push('case.identityConfirmed'); if (!c.targetConfirmed && !automatic) missing.push('case.targetConfirmed');
      if (c.contentStatus !== 'ready' && !automatic || automatic && c.contentStatus === 'incomplete') missing.push('case.contentStatus');
      if (!c.responseIds.length || c.responseIds.some(id => !candidates.includes(id))) missing.push('case.responseIds');
      const currentCandidateHash = candidateHash(candidates);
      if (c.reviewedCandidateHash !== currentCandidateHash) missing.push('case.responseSetChanged');
      if (c.historicalCompleted) { missing.push('case.historicalCompleted'); skipped.push({ reason: 'historical_completed' }); }
      for (const code of ['config.externalEnabled', 'host.tokenConfigured', 'host.externalEnabled']) {
        const parts = code.split('.'), value = parts[0] === 'config' ? config[parts[1]] : ctx[parts[1]];
        if (!value) missing.push(code);
      }
      const urls = ctx.client.responseUrls || []; list(urls, 500).forEach(item => { record(item, ['id', 'url']); identifier(item.id); string(item.url, 4000, true); });
      const selectedUrls = c.responseIds.map(id => urls.find(item => item.id === id));
      if (selectedUrls.some(item => !item || !secureUrl(item.url))) missing.push('case.responseUrls');
      const contact = ['今回の依頼：' + escaped(c.cycleKey), '依頼者ID：' + escaped(c.clientId), '氏名：' + escaped(ctx.client.name), 'メール：' + escaped(emails.filter(Boolean).join('、') || '未登録'), '回答確認：' + (selectedUrls.map((item, i) => item ? escaped(item.url) : '未設定（回答ID：' + escaped(c.responseIds[i]) + '）').join('\n') || '未選択')];
      let accountId = '', roomId = '', attorneyIndex = -1, original = null, body, reviewRequired = false;
      if (kind === 'lawyer') {
        let attorney = null;
        if (reissue) {
          const index = config.attorneys.findIndex(a => a.enabled && a.id === reissue.accountId), available = ctx.availability?.[reissue.accountId];
          if (index === -1) missing.push('case.correctionAccount');
          else if (available !== 'available') {
            missing.push(available === 'absent' ? 'availability.none' : 'availability.unknown');
            skipped.push({ attorneyId: reissue.accountId, reason: available === 'absent' ? 'absent' : 'unknown' });
          } else attorney = { id: reissue.accountId, index };
        } else attorney = selectAttorney(w, ctx, skipped, missing);
        if (attorney) { accountId = attorney.id; attorneyIndex = attorney.index; }
        roomId = config.lawyerRoomId; if (!roomId) missing.push('config.lawyerRoomId');
        if (['sent', 'sending', 'unknown'].includes(c.lawyerSent)) missing.push('case.lawyerSent');
        body = ['【106 方針変更・弁護士確認】', ...contact, ...(automatic ? ['受付：自動照合（' + (c.automation.matchMethod === 'id' ? '今回の依頼用URLで紐づけ' : '氏名・メールが一意に一致') + '）', '回答内容・方針は未確認です。本人確認や内容の承認を自動で済ませたものではありません。'] : ['本人確認：' + (c.identityConfirmed ? '確認済み' : '未確認'), '今回の対象：' + (c.targetConfirmed ? '確認済み' : '未確認'), '回答内容：' + ({ unchecked: '未チェック', incomplete: '不備あり', ready: '不備なし（人が確認）' }[c.contentStatus])]), '備考：' + escaped(c.note || 'なし'), '弁護士による方針の確認をお願いします。判断結果は人が管理画面に記録してください。'].join('\n');
        if (config.autoOfficeReturnEnabled) {
          reviewRequired = true;
          const reviewUrl = ctx.reviewBase ? ctx.reviewBase + '?view=review&case=' + encodeURIComponent(c.caseKey) : '';
          if (!accountId || !w.reviewCredentials?.[accountId] || !secureUrl(reviewUrl)) missing.push('case.reviewAccess');
          // Do not put a client's contact details or an admin link in a new review task.
          body = ['【106 方針変更・弁護士確認】','案件の確認画面：' + reviewUrl,'本人用の確認パスワードで開き、「問題なし」または「差し戻し」を記録してください。', '判断を保存すると、106番がこのChatworkタスクを完了します。'].join('\n');
        }
      } else {
        if (c.lawyerResult !== 'approved') missing.push('case.lawyerResult');
        original = latestSuccessful(w, c, 'lawyer');
        if (withdrawn(original)) original = null;
        if (!original) missing.push('case.originalLawyerRequest');
        if (original?.reviewRequired && config.autoOfficeReturnEnabled && (c.lawyerReview?.sendId !== original.id || c.lawyerReview?.result !== 'approved' || c.lawyerReview?.chatworkStatus !== 'done')) missing.push('case.reviewDecision');
        accountId = reissue ? reissue.accountId : c.officeAccountId; roomId = config.officeRoomId;
        if (!config.officeStaff.length) missing.push('config.officeStaff');
        if (!accountId || !config.officeStaff.some(a => a.id === accountId)) missing.push('case.officeAccountId');
        if (!roomId) missing.push('config.officeRoomId');
        if (['sent', 'sending', 'unknown'].includes(c.officeSent)) missing.push('case.officeSent');
        body = ['【106 方針変更・事務処理】', ...contact, '弁護士判断：' + (c.lawyerResult === 'approved' ? '承認（人が記録）' : '承認の記録なし'), '備考：' + escaped(c.note || 'なし'), '以下は送信済み弁護士確認依頼の全文です。', '--- 元の依頼全文（引用） ---', original ? original.request.body : '未送信（送信済み依頼がありません）', '--- 引用ここまで ---', '承認された内容に沿って事務処理をお願いします。処理完了は人が管理画面に記録してください。'].join('\n');
      }
      if (reissue) body = '【再依頼】元のタスクは取り下げを確認済みです。今回のタスクをご確認ください。\n' + body;
      if (reference) body += '\n\n送信照会番号：' + reference;
      if (body.length > 60000) bad('INVALID_INPUT', 'タスク本文が大きすぎます。');
      const request = { roomId, body, accountId, limit: day.limit, limitType: 'date' };
      const stamp = { caseVersion: c.version, currentCandidateHash, configHash: hash(JSON.stringify(config)), cursor: kind === 'lawyer' ? w.cursor : null, day: day.day, originalSendId: original ? original.id : null };
      return { request, stamp, hash: hash(JSON.stringify({ caseKey: c.caseKey, kind, request, stamp })), missing: [...new Set(missing)], skipped, attorneyIndex, reviewRequired };
    }
    function previewAutomatic(state, ctx) {
      const w = init(state), config = w.config;
      if (!config.autoDispatchEnabled || !config.autoScopeKey || ctx.automaticEligible !== true) return { eligible: false, skipped: 'not_eligible', missing: [], case: null, draft: null };
      const clientId = ctx.client.id, cycleKey = ctx.automaticCycleKey;
      identifier(clientId); identifier(cycleKey); list(ctx.automaticResponseIds, 200).forEach(id => identifier(id));
      const key = 'case_' + hash(JSON.stringify([clientId, cycleKey])), old = w.cases.find(c => c.caseKey === key);
      if (old && (!old.automation || old.automation.source !== 'matched')) return { eligible: false, skipped: 'manual_case', missing: [], case: publicCase(old), draft: null };
      if (old && (['sending', 'sent', 'unknown', 'failed', 'withdrawn', 'reissue_ready'].includes(old.lawyerSent) || old.historicalCompleted || old.officeStatus === 'done')) return { eligible: false, skipped: old.lawyerSent, missing: [], case: publicCase(old), draft: null };
      saveCase(state, { clientId, cycleKey, responseIds: ctx.automaticResponseIds }, ctx);
      const c = w.cases.find(c => c.caseKey === key);
      if (!c.automation) { c.automation = { source: 'matched', scopeKey: config.autoScopeKey, matchMethod: ctx.automaticMatchMethod === 'id' ? 'id' : 'both' }; c.version++; c.updatedAt = time(); }
      const plan = materialize(w, c, 'lawyer', ctx);
      if (plan.missing.length) return { eligible: false, skipped: 'blocked', missing: plan.missing, case: publicCase(c), draft: null, changed: !old || old.version !== c.version };
      return { ...preview(state, { caseKey: c.caseKey, kind: 'lawyer' }, ctx), case: publicCase(c), changed: true };
    }
    function uniqueId(w, prefix, collection) {
      for (let attempt = 0; attempt < 5; attempt++) { const id = prefix + identifier(String(host.random()), 160); if (!w[collection].some(item => item.id === id)) return id; }
      bad('ID_COLLISION', '処理番号を作成できませんでした。もう一度お試しください。');
    }
    function publicDraft(d) { const out = {}; for (const key of ['id', 'caseKey', 'kind', 'body', 'roomId', 'accountId', 'limit', 'limitType', 'hash']) out[key] = d[key]; return out; }
    function preview(state, p, ctx) {
      const w = init(state); record(p, ['caseKey', 'kind']); enumValue(p.kind, ['lawyer', 'office']);
      const c = findCase(w, p.caseKey), id=uniqueId(w,'draft_','drafts'), reference=hash(id).slice(0,20);
      const plan = materialize(w,c,p.kind,ctx,reference), d = { id, reference, caseKey:c.caseKey, kind:p.kind, ...plan.request, hash:plan.hash, stamp:plan.stamp, attorneyIndex:plan.attorneyIndex, createdAt:time() };
      w.drafts.push(d); return clone({ draft: publicDraft(d), missing: plan.missing, eligible: plan.missing.length === 0, skipped: plan.skipped });
    }
    function beginSend(state, p, ctx) {
      const w = init(state); record(p, ['draftId', 'approvedHash', 'confirmed']); identifier(p.draftId, 300); string(p.approvedHash, 300, false);
      if (p.confirmed !== true) bad('APPROVAL_REQUIRED', '表示した本文と宛先を確認して承認してください。');
      const draft = w.drafts.find(d => d.id === p.draftId); if (!draft) bad('NOT_FOUND', '下書きが見つかりません。再プレビューしてください。');
      if (p.approvedHash !== draft.hash) bad('APPROVAL_REQUIRED', '承認した下書きと送信内容が一致しません。');
      const c = findCase(w, draft.caseKey), statusField = draft.kind === 'lawyer' ? 'lawyerSent' : 'officeSent';
      if (['sending', 'sent', 'unknown'].includes(c[statusField]) || w.sends.some(s => s.caseKey === c.caseKey && s.kind === draft.kind && !withdrawn(s) && ['sending', 'sent', 'unknown'].includes(s.status))) bad('ALREADY_SENT', 'この依頼は送信済み・送信結果の確認中です。重複送信は停止しました。');
      const plan = materialize(w, c, draft.kind, ctx, draft.reference || '');
      if (plan.hash !== draft.hash) bad('STALE_DRAFT', '下書き後に内容・設定・予定・日付が変わりました。再プレビューしてください。');
      if (plan.missing.length) bad('GATES_BLOCKED', plan.missing.map(code => MISSING_LABELS[code] || code).join(' '));
      const send = { id: uniqueId(w, 'send_', 'sends'), caseKey: c.caseKey, kind: draft.kind, draftId: draft.id, approvedHash: draft.hash, reference: draft.reference || '', request: clone(plan.request), attorneyIndex: plan.attorneyIndex, status: 'sending', taskIds: [], createdAt: time(), finishedAt: '' };
      if (plan.reviewRequired) send.reviewRequired = true;
      if (replacementFor(w, c, draft.kind)) send.replacesSendId = latestSuccessful(w, c, draft.kind).id;
      w.sends.push(send); c[statusField] = 'sending'; if (draft.kind === 'lawyer') c.assignedAttorneyId = send.request.accountId;
      if (draft.kind === 'office' && send.replacesSendId) c.officeAccountId = send.request.accountId;
      c.version++; c.updatedAt = time();
      return clone({ sendId: send.id, request: send.request, clientId: c.clientId, kind: send.kind });
    }
    function finishSend(state, p) {
      const w = init(state); record(p, ['sendId', 'outcome', 'taskIds']); identifier(p.sendId, 300); enumValue(p.outcome, ['sent', 'unknown', 'failed']);
      list(p.taskIds, 100).forEach(id => numeric(id));
      if (new Set(p.taskIds).size !== p.taskIds.length || p.outcome === 'sent' && !p.taskIds.length || p.outcome === 'failed' && p.taskIds.length) bad('INVALID_INPUT');
      const send = w.sends.find(s => s.id === p.sendId); if (!send) bad('NOT_FOUND', '送信記録が見つかりません。');
      const c = findCase(w, send.caseKey), sameResult = send.status === p.outcome && JSON.stringify(send.taskIds) === JSON.stringify(p.taskIds);
      if (['sent', 'failed'].includes(send.status)) { if (!sameResult) bad('SEND_FINALIZED', '確定済みの送信結果は書き換えられません。'); return clone({ send, case: publicCase(c), cursor: w.cursor }); }
      if (!['sending', 'unknown'].includes(send.status)) bad('SEND_FINALIZED');
      if (sameResult) return clone({ send, case: publicCase(c), cursor: w.cursor });
      send.status = p.outcome; send.taskIds = clone(p.taskIds); send.finishedAt = time();
      c[send.kind === 'lawyer' ? 'lawyerSent' : 'officeSent'] = p.outcome; c.version++; c.updatedAt = time();
      if (p.outcome === 'sent' && send.kind === 'lawyer' && send.reviewRequired && send.taskIds.length === 1) {
        c.lawyerReview = {sendId:send.id,result:'pending',reason:'',chatworkStatus:'unknown'};
      }
      if(p.outcome==='sent'&&c.sendRecovery?.[send.kind]) { c.sendRecovery={...c.sendRecovery}; delete c.sendRecovery[send.kind]; }
      if (p.outcome === 'sent' && send.kind === 'lawyer' && !send.replacesSendId && !w.sends.slice(w.sends.indexOf(send) + 1).some(s => s.kind === 'lawyer' && s.status === 'sent')) {
        const index = w.config.attorneys.findIndex(a => a.id === send.request.accountId);
        if (index >= 0) w.cursor = (index + 1) % w.config.attorneys.length;
      }
      return clone({ send, case: publicCase(c), cursor: w.cursor });
    }
    return { get, configure, saveCase, preview, previewAutomatic, beginSend, finishSend, taskInfo, correctTask, pendingInfo, recoveryQuery, reconcileSend };
  }
  return { createEngine, MISSING_LABELS };
});

/* Canonical, lossless question summaries. Called only after server-side admin auth. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.YourAceStatistics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clean=s=>String(s??'').normalize('NFKC').replace(/\s/g,'');
 const scalar=v=>v==null?'':typeof v==='object'?(Object.hasOwn(v,'otherText')?String(v.otherText):Object.hasOwn(v,'value')?String(v.value):JSON.stringify(v)):String(v);
 const valueLabel=o=>typeof o==='object'?String(o.value??o.label??''):String(o);
 // These three short-answer bar charts were observed in the original Forms summary.
 const observedBars=new Set(['323740649','1691251018','364433512']);
 function legacySelections(raw,q){
  const known=(q.options||[]).filter(o=>!o.other).map(valueLabel);
  if(known.includes(raw))return{values:[raw],unresolved:false};
  const delimiter=raw.includes(';')?';':raw.includes(', ')?', ':'';
  if(!delimiter)return{values:[raw],unresolved:false};
  const parts=raw.split(delimiter);
  if(parts.every(v=>known.includes(v)))return{values:[...new Set(parts)],unresolved:false};
  // CSV cannot disambiguate a comma in an Other answer from a separator. Keep it intact.
  return{values:[raw],unresolved:true};
 }
 function calculate(schema,responses,options={}){
  const definitions=[{id:'email',title:'メールアドレス',type:'email',sectionTitle:'回答者情報',options:[]}];
  for(const s of schema.sections)for(const q of s.questions)definitions.push({...q,id:String(q.id),sectionTitle:s.title});
  const titleMap=new Map();for(const q of definitions){const k=clean(q.title);if(!titleMap.has(k))titleMap.set(k,[]);titleMap.get(k).push(q.id);}
  for(const alias of ['Email','email','メール','ユーザー名'])titleMap.set(clean(alias),['email']);
  const groups=new Map(definitions.map((q,order)=>[q.id,{id:q.id,title:q.title,type:q.type,sectionTitle:q.sectionTitle,order,answered:0,skipped:0,chartType:['radio','select'].includes(q.type)?'pie':q.type==='checkbox'||observedBars.has(q.id)?'bar':q.type==='date'?'date':'text',choices:[],answers:[],unresolved:0,counts:new Map()}]));
  const contacts=new Set(),months=new Map();
  for(const r of responses){
   const dt=options.parseDatetime?.(r.timestamp),month=dt?dt.slice(0,7):'日時不明';months.set(month,(months.get(month)||0)+1);
   contacts.add(r.clientId||[(options.normalizeName||String)(r.name||''),(options.normalizeEmail||String)(r.email||'')].join('|'));
   const values=new Map(),used=new Set();
   if(r.answers&&typeof r.answers==='object')for(const q of definitions)if(Object.hasOwn(r.answers,q.id)){values.set(q.id,r.answers[q.id]);used.add(q.id);}
   for(const f of r.fields||[]){
    const direct=f.questionId&&String(f.questionId);let id=direct&&groups.has(direct)?direct:null;
    if(!id){const ids=titleMap.get(clean(f.title))||[];id=ids.find(x=>!used.has(x));}
    if(!id||used.has(id))continue;used.add(id);values.set(id,f.value);
   }
   // Legacy contact fields may have noncanonical source headings; retain the actual stored email.
   if(!values.has('email')&&r.email)values.set('email',r.email);
   for(const q of definitions){
    if(!values.has(q.id))continue;const raw=values.get(q.id),array=Array.isArray(raw);
    if(raw==null||raw===''||array&&raw.length===0)continue;
    const g=groups.get(q.id);g.answered++;
    let selections;
    if(q.type==='checkbox'){
     if(array)selections=[...new Set(raw.map(scalar))];
     else{const parsed=legacySelections(scalar(raw),q);selections=parsed.values;if(parsed.unresolved)g.unresolved++;}
    }else selections=[scalar(raw)];
    const shown=selections.join(q.type==='checkbox'?'、':'');
    g.answers.push({responseId:r.id,value:shown});
    for(const label of selections)g.counts.set(label,(g.counts.get(label)||0)+1);
   }
  }
  for(const q of definitions){
   const g=groups.get(q.id),known=(q.options||[]).filter(o=>!o.other).map(valueLabel);
   g.skipped=responses.length-g.answered;
   g.choices=[...g.counts].map(([label,count])=>({label,count,percent:g.answered?count/g.answered*100:0,optionIndex:known.includes(label)?known.indexOf(label):known.length})).sort((a,b)=>a.optionIndex-b.optionIndex);
   delete g.counts;
  }
  return{total:responses.length,uniqueContacts:contacts.size,byMonth:[...months].sort().map(([month,count])=>({month,count})),source:{label:'保存済み回答',mode:'stored',asOf:options.now||'',...(options.source||{})},questions:[...groups.values()]};
 }
 return{calculate,legacySelections};
});

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.YourAceService=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function createService(host){
  const M=host.matching||(typeof YourAceMatching!=='undefined'?YourAceMatching:typeof require==='function'?require('../delivery_shared/matching.js'):null);
  const Stats=host.statistics||(typeof YourAceStatistics!=='undefined'?YourAceStatistics:typeof require==='function'?require('./statistics.js'):null);
  const W=host.workflow||(typeof YourAceWorkflow!=='undefined'?YourAceWorkflow:typeof require==='function'?require('./workflow.js'):null);
  const workflow=W.createEngine({now:()=>host.now(),hash:v=>host.hash(String(v)),random:()=>host.random()});
  const schema=host.schema,engine=host.engine,questions=schema.sections.flatMap(s=>s.questions),contact=questions.find(q=>/お名前|氏名/.test(q.title))||questions[0];
  const reviewSections=new Map(schema.sections.flatMap(section=>section.questions.map(q=>[q.id,String(section.title||'')])));
  const now=()=>host.now(),clock=()=>Date.parse(now()),bad=m=>{const e=new Error(m);e.userSafe=true;throw e;},text=x=>typeof x==='string'?x:'',hash=x=>host.hash(String(x));
  const safeString=(s,n=200)=>typeof s==='string'&&s.length<=n;
  const cleanHeader=s=>String(s).normalize('NFKC').replace(/\s/g,'');
  const display=v=>v==null?'':Array.isArray(v)?v.map(display).join('、'):typeof v==='object'&&Object.prototype.hasOwnProperty.call(v,'value')?String(v.value)+(v.otherText?'：'+v.otherText:''):typeof v==='object'?JSON.stringify(v):String(v);
  const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
  function admin(p){const t=text(p.token);if(!/^[a-f0-9-]{32,160}$/i.test(t))bad('管理画面へログインしてください。');const s=host.sessionGet(hash(t));if(!s||s.scope||s.expiresAt<=clock()||!same(s.credentialTag,host.adminHash))bad('管理画面へログインしてください。');return s;}
  function transaction(fn){return host.transaction(()=>{const s=host.load();s.responses=s.responses||[];s.invites=s.invites||[];s.clientsText=s.clientsText||'';const out=fn(s);return out;});}
  function save(s){host.save(s);}
  function bounded(p){if(!p||typeof p!=='object'||Array.isArray(p))bad('入力形式を確認してください。');return p;}
  function findInvite(s,token){if(!token)return null;if(!safeString(token,160)||!/^[a-f0-9-]{32,160}$/i.test(token))bad('この依頼用リンクは利用できません。');const i=s.invites.find(x=>same(x.tokenHash,hash(token)));if(!i||i.revoked||Date.parse(i.expiresAt)<=clock())bad('この依頼用リンクは期限切れか無効です。事務所へご連絡ください。');return i;}
  function fieldsFor(answers){const route=engine.traceRoute(schema,answers);const fields=[{title:'メールアドレス',value:text(answers.email),type:'email',questionId:'email'}];for(const id of route.sectionIds)for(const q of schema.sections.find(s=>s.id===id).questions){if(Object.prototype.hasOwnProperty.call(answers,q.id))fields.push({title:q.title,value:display(answers[q.id]),type:q.type,questionId:q.id});}return fields;}
  function validateAnswers(answers){
   if(!answers||typeof answers!=='object'||Array.isArray(answers)||host.byteLength(JSON.stringify(answers))>131072)bad('入力内容のサイズ・形式を確認してください。');
   const route=engine.traceRoute(schema,answers);if(route.error||!route.complete)bad('入力の分岐を確認してください。');
   const allowed=new Set(['email']);for(const id of route.sectionIds)for(const q of schema.sections.find(s=>s.id===id).questions)allowed.add(q.id);
   if(Object.keys(answers).some(k=>!allowed.has(k)))bad('対象外の質問が含まれています。フォームを開き直してください。');
   const errs=engine.validateQuestion(engine.emailQuestion(schema),answers.email);
   for(const id of route.sectionIds)errs.push(...engine.validateSection(schema,schema.sections.find(s=>s.id===id),answers));
   if(errs.length)bad('未入力または形式の異なる項目があります。入力内容をご確認ください。');
   return engine.activePayload(schema,answers).answers;
  }
  function summaryRow(r){return{id:r.id,timestamp:r.timestamp,name:r.name,email:r.email,source:r.source,answerCount:r.fields.filter(f=>f.value!=='').length,clientId:r.clientId||'',requestId:r.requestId||''};}
  function historical(p,s){
   if(s.responses.some(r=>r.source==='legacy_form'))bad('元フォームの回答は自動移行済み、または移行中です。重複を防ぐため回答CSVの追加を停止しました。元フォームの読取権限と移行状態を確認してください。');
   const headers=p.headers,rows=p.rows;
   if(!Array.isArray(headers)||headers.length<2||headers.length>300||headers.some(h=>!safeString(h,3000))||!Array.isArray(rows)||rows.length>40)bad('回答CSVの列または取込件数を確認してください。');
   const hs=headers.map(cleanHeader),ni=hs.findIndex(h=>['氏名','名前','お名前','ご依頼者名'].includes(h)||h.includes('ご依頼者様のお名前')),ei=hs.findIndex(h=>['メールアドレス','Email','email','メール','ユーザー名'].includes(h)),ti=hs.findIndex(h=>['タイムスタンプ','回答日時','timestamp'].includes(h));
   if(ni<0||ei<0)bad('回答CSVに氏名とメールアドレスの列が必要です。');
   if(hs.filter(h=>['メールアドレス','Email','email','メール','ユーザー名'].includes(h)).length!==1)bad('メールアドレスの列が複数あります。対象列を確認してください。');
   const pending=[],known=new Set(s.responses.map(r=>r.sourceKey));let duplicate=0,skippedHeaders=0;
   for(const cells of rows){
    if(!Array.isArray(cells)||cells.length!==headers.length||cells.some(c=>typeof c!=='string'))bad('回答CSVの列数・値の形式が異なります。');
    if(cells.every(c=>!c.trim()))continue;
    if(cells.every((v,i)=>cleanHeader(v)===hs[i])){skippedHeaders++;continue;}
    if(host.byteLength(JSON.stringify([headers,cells]))>131072)bad('1件の回答が大きすぎます。個別に確認してください。');
    const sourceKey='legacy:'+hash(JSON.stringify([headers,cells]));if(known.has(sourceKey)){duplicate++;continue;}known.add(sourceKey);
    const sourceTimestamp=ti<0?'':cells[ti],timestamp=M.parseDatetime(sourceTimestamp)||sourceTimestamp,name=cells[ni].trim(),email=M.normalizeEmail(cells[ei]);
    pending.push({id:host.random(),sourceKey,source:'legacy_csv',timestamp,sourceTimestamp,name,email,fields:headers.map((title,i)=>({title,value:cells[i],column:i})),clientId:'',requestId:'',receivedAt:now()});
   }
   s.responses.push(...pending);if(pending.length)save(s);return{imported:pending.length,duplicate,skippedHeaders,total:s.responses.length};
  }
  function adminHref(id){
   const base=host.adminUrl?host.adminUrl():host.publicFormUrl().replace(/\/form\/?$/,'/').replace(/[?&]view=form(?:&|$)/,'?');
   return String(base).split('#')[0]+(host.mode==='gas'?'?responseId=':'#answer=')+encodeURIComponent(id);
  }
  function workflowContext(s,p){
   p=p||{};let id=p.clientId;const record=s.workflow?.cases?.find(c=>c.caseKey===(p.caseKey||s.workflow?.drafts?.find(d=>d.id===p.draftId)?.caseKey));if(!id&&record)id=record.clientId;
   const ctx={tokenConfigured:host.workflowTokenConfigured?host.workflowTokenConfigured():false,externalEnabled:host.externalEnabled===true,hostMode:host.mode||'local',availability:{},reviewBase:host.adminUrl?String(host.adminUrl()).split(/[?#]/)[0]:''};
   if(id){
    if(!s.clientsText)bad('LUのCSVを読み込んでください。');const found=M.parseLu(s.clientsText).rows.filter(c=>String(c.client_id)===String(id));if(found.length!==1)bad('依頼者IDが空欄か重複しています。対象案件を確認してください。');
    const rows=matchState(s).diagnostics.rows,row=rows.find(c=>String(c.client_id)===String(id));const ids=[...new Set((row?.candidates||[]).map(c=>c.response_id).filter(Boolean))];
    ctx.client={id:String(id),name:found[0].name,emails:found[0].emails,responseUrls:ids.map(id=>({id,url:adminHref(id)}))};ctx.candidateResponseIds=ids;
    const exact=(row?.candidates||[]).filter(c=>c.response_id&&['both','id'].includes(c.pair_type)&&!c.other_lu_exact_count);
    // Manual confirmations are not inputs for automatic Chatwork dispatch.
    const manuallyConfirmed=new Set((s.workflow?.cases||[]).map(c=>c.manualMatch?.responseId).filter(Boolean));
    const unshared=exact.filter(c=>!manuallyConfirmed.has(c.response_id)&&rows.filter(r=>(r.candidates||[]).some(other=>other.response_id===c.response_id&&['both','id'].includes(other.pair_type))).length===1);
    const cfg=s.workflow?.config||{},cutover=Date.parse(cfg.autoStartAt),current=clock();
    const currentAnswers=unshared.filter(c=>{const answer=s.responses.find(r=>r.id===c.response_id),at=Date.parse(M.parseDatetime(answer?.timestamp)||'');return Number.isFinite(cutover)&&Number.isFinite(at)&&at>=cutover&&at<=current;});
    const selected=[...new Set(currentAnswers.sort((a,b)=>(Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0)||(b.source_row||0)-(a.source_row||0)).map(c=>c.response_id))].slice(0,200);
    ctx.automaticEligible=row?.status==='answered'&&selected.length>0;
    ctx.automaticResponseIds=selected;ctx.automaticMatchMethod=row?.match_method==='id'?'id':'both';
    ctx.automaticCycleKey=(cfg.autoScopeKey||'')+(row?.request_id?':'+hash(row.request_id).slice(0,16):'');
   }
   return ctx;
  }
  function candidateHash(ids){return hash(JSON.stringify([...new Set(ids)].sort()));}
  function caseView(c,ids){return{...c,needsRecheck:c.reviewedCandidateHash!==candidateHash(ids)};}
  const reviewKey=x=>typeof x==='string'&&/^case_[a-f0-9]{64}$/.test(x);
  const reviewDenied=()=>bad('この案件を開けません。担当者用の確認パスワードを確認してログインしてください。');
  const validNumber=x=>typeof x==='string'&&/^[1-9][0-9]{0,19}$/.test(x);
  const codeHash=(salt,code)=>hash('lawyer-review:'+salt+':'+code);
  function storeReviewCodes(s,list){
   if(list===undefined)return;
   if(!Array.isArray(list)||list.length>100)bad('確認パスワードの設定を確認してください。');
   const w=s.workflow, known=new Set();w.reviewCredentials=w.reviewCredentials||{};
   for(const item of list){
    if(!item||!validNumber(item.accountId)||known.has(item.accountId)||!w.config.attorneys.some(a=>a.id===item.accountId)||typeof item.code!=='string'||!/^\S{20,120}$/.test(item.code)||same(hash(host.adminSalt+':'+item.code),host.adminHash))bad('弁護士ごとに異なる20文字以上の確認パスワードを設定してください。');
    if(Object.entries(w.reviewCredentials).some(([id,r])=>id!==item.accountId&&same(r.digest,codeHash(r.salt,item.code))))bad('他の担当者と同じ確認パスワードは使えません。');
    known.add(item.accountId);
    const salt=host.random();w.reviewCredentials[item.accountId]={salt,digest:codeHash(salt,item.code)};
   }
  }
  function activeReview(s,key){
   const w=s.workflow;
   if(!w?.config?.autoOfficeReturnEnabled||!reviewKey(key))return null;
   const c=w.cases.find(c=>c.caseKey===key),r=c?.lawyerReview;
   if(!r||c.lawyerSent!=='sent'||c.historicalCompleted||!c.assignedAttorneyId)return null;
   const send=w.sends.slice().reverse().find(x=>x.caseKey===key&&x.kind==='lawyer'&&x.status==='sent');
   if(!send?.reviewRequired||r.sendId!==send.id||send.corrections?.length||send.taskIds?.length!==1||!validNumber(send.taskIds[0])||send.request.accountId!==c.assignedAttorneyId||!w.config.attorneys.some(a=>a.id===c.assignedAttorneyId&&a.enabled))return null;
   const credential=w.reviewCredentials?.[c.assignedAttorneyId];
   if(!credential)return null;
   return {c,r,send,credential,w};
  }
  function reviewSession(s,p){
   let t=text(p.token);
   if(!/^[a-f0-9-]{32,160}$/i.test(t))reviewDenied();
   const session=host.sessionGet(hash(t)),v=activeReview(s,p.caseKey);
   if(!session||session.scope!=='lawyer_review'||session.caseKey!==p.caseKey||session.expiresAt<=clock()||!v||session.sendId!==v.send.id||session.accountId!==v.c.assignedAttorneyId||!same(session.credentialTag,v.credential.digest))reviewDenied();
   return v;
  }
  function reviewView(s,v){
   const {c,r}=v,ctx=workflowContext(s,{caseKey:c.caseKey}),stale=c.reviewedCandidateHash!==candidateHash(ctx.candidateResponseIds);
   const answers=c.responseIds.map(id=>s.responses.find(x=>x.id===id)).filter(Boolean).map(a=>({timestamp:a.timestamp,formTitle:schema.title||'お手続き確認書',fields:a.fields.map(f=>({title:f.title,value:f.value,section:reviewSections.get(f.questionId)||''}))}));
   return {clientName:ctx.client.name,caseLabel:c.cycleKey,answers,result:r.result,reason:r.reason,chatworkStatus:r.chatworkStatus,completionAttempted:!!r.completionAttempt,officeSent:c.officeSent,canDecide:!stale&&r.result==='pending'&&c.lawyerResult==='pending'&&c.officeSent==='not_sent'&&answers.length>0};
  }
  function reviewLogin(p){
   if(host.throttle){host.throttle('lawyer-review-login',60,600);if(reviewKey(p.caseKey))host.throttle('lawyer-review:'+p.caseKey,10,600);}
   return transaction(s=>{
    const v=activeReview(s,p.caseKey),code=text(p.code);
    if(!v||!/^\S{20,120}$/.test(code)||!same(v.credential.digest,codeHash(v.credential.salt,code)))reviewDenied();
    const token=host.random();
    host.sessionSet(hash(token),{scope:'lawyer_review',caseKey:p.caseKey,sendId:v.send.id,accountId:v.c.assignedAttorneyId,credentialTag:v.credential.digest,expiresAt:clock()+3600000});
    return {token};
   });
  }
  function recordReview(p){
   const saved=transaction(s=>{
    const v=reviewSession(s,p),{c,r}=v,before=reviewView(s,v);
    if(!before.canDecide)bad('現在の回答または確認状態が変わりました。事務担当者にご確認ください。');
    const result=p.result,why=text(p.reason).trim();
    if(!['approved','returned'].includes(result)||why.length>800)bad('判断内容を確認してください。');
    if(result==='returned'&&!why)bad('差し戻しの理由を入力してください。');
    Object.assign(r,{result,reason:result==='returned'?why:'',decidedAt:now(),decidedBy:c.assignedAttorneyId});
    c.lawyerResult=result;c.version++;c.updatedAt=now();save(s);
    return reviewView(s,v);
   });
   if(!host.taskCompletionReady?.())return saved;
   const fresh=()=>transaction(s=>reviewView(s,reviewSession(s,p)));
   try{
    const result=runOfficeAutomatic(p.caseKey);
    return result&&typeof result.then==='function'?result.then(fresh,()=>saved):fresh();
   }catch{return saved;}
  }
  function automationReady(v){
   if(!v||!v.w.config.externalEnabled||!host.externalEnabled||!host.workflowTokenConfigured?.())return false;
   const {c,r,w}=v,officeId=c.officeAccountId||w.config.autoOfficeAccountId,done=Date.parse(r.polledAt);
   return r.result==='approved'&&r.decidedBy===c.assignedAttorneyId&&r.chatworkStatus==='done'&&clock()-done>=0&&clock()-done<=60000&&c.lawyerResult==='approved'&&c.officeStatus!=='done'&&c.officeSent==='not_sent'&&c.identityConfirmed&&c.targetConfirmed&&c.contentStatus==='ready'&&w.config.officeStaff.some(o=>o.id===officeId)&&!!w.config.officeRoomId;
  }
  function workflowMeta(s){
   const out=workflow.get(s,{tokenConfigured:host.workflowTokenConfigured?host.workflowTokenConfigured():false,externalEnabled:host.externalEnabled===true});
   const rows=s.clientsText?matchState(s).diagnostics.rows:[],byClient=new Map(rows.map(row=>[String(row.client_id),(row.candidates||[]).map(c=>c.response_id).filter(Boolean)]));
   return{...out,reviewConfiguredIds:Object.keys(s.workflow?.reviewCredentials||{}),cases:out.cases.map(c=>caseView(c,byClient.get(String(c.clientId))||[])),tokenConfigured:host.workflowTokenConfigured?host.workflowTokenConfigured():false,externalEnabled:host.externalEnabled===true,calendarCapability:host.calendarCapability||'manual',setupHints:host.workflowSetupHints?host.workflowSetupHints():null};
  }
  function calendarContext(s,p,ctx){
   const cfg=s.workflow?.config||{},people=cfg.attorneys||[];
   if(p.manualCalendarChecked===true){
    if(!Array.isArray(p.availableAttorneyIds)||p.availableAttorneyIds.some(id=>typeof id!=='string'||!people.some(a=>a.id===id)))bad('確認した弁護士の出勤状況を選択してください。');
    ctx.availability=Object.fromEntries(people.map(a=>[a.id,p.availableAttorneyIds.includes(a.id)?'available':'absent']));ctx.manualCalendarChecked=true;return ctx;
   }
   if(!host.calendarAvailability)return ctx;
   const result=host.calendarAvailability(cfg,now());
   if(result&&typeof result.then==='function')return result.then(availability=>({...ctx,availability}));
   return{...ctx,availability:result||{}};
  }
  function withAvailability(p,action){const info=transaction(s=>({context:workflowContext(s,p),state:s})),context=calendarContext(info.state,p,info.context);return context&&typeof context.then==='function'?context.then(action):action(context);}
  function sendWorkflow(p,automated=false){
   return withAvailability(p,ctx=>{
    const pending=transaction(s=>{const fresh={...workflowContext(s,p),availability:ctx.availability};
     if(automated==='office'){
      const draft=s.workflow?.drafts?.find(d=>d.id===p.draftId), v=activeReview(s,draft?.caseKey);
      if(draft?.kind!=='office'||!automationReady(v))bad('自動返却の条件が変わりました。送信していません。');
     }
     const result=workflow.beginSend(s,{draftId:p.draftId,approvedHash:p.approvedHash,confirmed:p.confirmed},fresh);save(s);return result;});
    const finish=result=>transaction(s=>{const out=workflow.finishSend(s,{sendId:pending.sendId,outcome:result?.outcome||'unknown',taskIds:result?.taskIds||[]},{});save(s);return out;});
    try{if(!host.chatworkCreate)return finish({outcome:'failed',taskIds:[]});const result=host.chatworkCreate(pending.request,{clientId:pending.clientId,kind:pending.kind,automated:automated===true||automated==='office'});return result&&typeof result.then==='function'?result.then(finish,()=>finish({outcome:'unknown',taskIds:[]})):finish(result);}catch(error){return finish({outcome:'unknown',taskIds:[]});}
   });
  }
  const chain=(value,next)=>value&&typeof value.then==='function'?value.then(next):next(value);
  function reconcileWorkflow(p){
   if(!host.chatworkTaskRead)bad('この環境ではChatworkのタスク確認を利用できません。');
   const {token,...data}=p;
   const q=transaction(s=>workflow.recoveryQuery(s,data)), prefix='/rooms/'+q.roomId+'/tasks';
   const persist=evidence=>transaction(s=>{
    admin(p);const result=workflow.reconcileSend(s,data,evidence);
    if(result.case){
     save(s);
     const row=s.clientsText?matchState(s).diagnostics.rows.find(r=>String(r.client_id)===String(result.case.clientId)):null;
     result.case=caseView(result.case,(row?.candidates||[]).map(c=>c.response_id).filter(Boolean));
    }
    return result;
   });
   if(q.taskId)return chain(host.chatworkTaskRead(prefix+'/'+q.taskId),row=>persist({rows:row?[row]:[],complete:true}));
   const filter=prefix+'?account_id='+q.accountId+'&status=';
   return chain(host.chatworkTaskRead(filter+'open'),open=>chain(host.chatworkTaskRead(filter+'done'),done=>{
    if(!Array.isArray(open)||!Array.isArray(done)||open.length>100||done.length>100)bad('Chatworkの一覧を確認できません。状態は変更していません。');
    return persist({rows:[...open,...done],complete:open.length<100&&done.length<100});
   }));
  }
  let automaticBusy=false,automaticInFlight=null;
  function runLawyerAutomatic(){
   if(automaticBusy)return automaticInFlight||{busy:true,sent:0,blocked:0,skipped:0,failed:0,unknown:0,remaining:0};
   automaticBusy=true;
   const finish=value=>{automaticBusy=false;automaticInFlight=null;return value;};
   try{
    const initial=transaction(s=>{const meta=workflow.get(s,{tokenConfigured:host.workflowTokenConfigured?host.workflowTokenConfigured():false,externalEnabled:host.externalEnabled===true});return{enabled:meta.config.autoDispatchEnabled===true,missing:meta.setupMissing,ids:s.clientsText?[...new Set(matchState(s).diagnostics.rows.filter(r=>r.status==='answered'&&r.client_id).map(r=>String(r.client_id)))]:[]};});
    const out={enabled:initial.enabled,sent:0,blocked:0,skipped:0,failed:0,unknown:0,remaining:0,rows:[]};
    if(!initial.enabled)return finish(out);
    if(initial.missing.length)return finish({...out,blocked:initial.ids.length,missing:initial.missing});
    function one(id){
     const info=transaction(s=>({state:s,context:workflowContext(s,{clientId:id})}));
     if(!info.context.automaticEligible)return{skipped:'not_eligible',clientId:id};
     return chain(calendarContext(info.state,{},info.context),ctx=>{
      const prepared=transaction(s=>{const fresh={...workflowContext(s,{clientId:id}),availability:ctx.availability};const p=workflow.previewAutomatic(s,fresh);if(p.changed)save(s);return p;});
      if(!prepared.eligible)return{clientId:id,skipped:prepared.skipped,missing:prepared.missing||[]};
      return chain(sendWorkflow({draftId:prepared.draft.id,approvedHash:prepared.draft.hash,confirmed:true},true),result=>({clientId:id,status:result.send.status}));
     });
    }
    function step(index){
     if(index>=initial.ids.length)return out;
     if(out.sent+out.failed+out.unknown>=5){out.remaining=initial.ids.length-index;return out;}
     const id=initial.ids[index];
     const accept=result=>{out.rows.push(result);if(['sent','failed','unknown'].includes(result.status))out[result.status]++;else if(result.skipped==='blocked'||result.error)out.blocked++;else out.skipped++;return step(index+1);};
     try{const result=one(id);return result&&typeof result.then==='function'?result.then(accept,error=>accept({clientId:id,error:error?.code||'AUTOMATIC_BLOCKED'})):accept(result);}catch(error){return accept({clientId:id,error:error?.code||'AUTOMATIC_BLOCKED'});}
    }
    const result=step(0);
    if(result&&typeof result.then==='function'){automaticInFlight=result.then(finish,error=>{finish(null);throw error;});return automaticInFlight;}
    return finish(result);
   }catch(error){finish(null);throw error;}
  }
  let officeBusy=false;
  function runOfficeAutomatic(onlyCase=''){
   if(officeBusy||!host.chatworkTaskRead||host.trialOnly)return null;
   const selected=transaction(s=>{
    const w=s.workflow;
    if(!w?.config?.autoOfficeReturnEnabled||!w.config.externalEnabled||!host.externalEnabled||!host.workflowTokenConfigured?.())return null;
    const waiting=w.cases.filter(c=>(!onlyCase||c.caseKey===onlyCase)&&c.lawyerReview&&c.officeSent==='not_sent'&&c.officeStatus!=='done'&&!(c.lawyerReview.result==='returned'&&c.lawyerReview.chatworkStatus==='done'))
      .sort((a,b)=>String(a.lawyerReview.polledAt||'').localeCompare(String(b.lawyerReview.polledAt||'')));
    const batch=[];
    for(const item of waiting){
     const v=activeReview(s,item.caseKey);if(!v)continue;
     const {c,send}=v;
     batch.push({key:c.caseKey,sendId:send.id,roomId:send.request.roomId,taskId:send.taskIds[0],accountId:send.request.accountId,body:send.request.body});
     if(batch.length>=8)break;
    }
    return batch;
   });
   if(!selected)return null;
   const result={checked:0,sent:0,failed:0,unknown:0},attempted=new Set();
   officeBusy=true;
   const finish=value=>{officeBusy=false;return value;};
   const one=ref=>{
    const detail='/rooms/'+ref.roomId+'/tasks/'+ref.taskId;
    const exactStatus=remote=>remote&&String(remote.task_id)===ref.taskId&&String(remote.account?.account_id)===ref.accountId&&same(remote.body,ref.body)&&['open','done'].includes(remote.status)?remote.status:'unknown';
    function read(callback){let value;try{value=host.chatworkTaskRead(detail);}catch{return callback(null);}
     return value&&typeof value.then==='function'?value.then(callback,()=>callback(null)):callback(value);
    }
    function observe(remote,canComplete=true){
     const status=exactStatus(remote),canWrite=canComplete&&status==='open'&&host.taskCompletionReady?.()&&typeof host.chatworkTaskComplete==='function';
     if(canWrite){
      const reserved=transaction(s=>{
       const v=activeReview(s,ref.key);if(!v||v.send.id!==ref.sendId||v.r.completionAttempt||!v.w.config.externalEnabled||!host.externalEnabled||v.c.officeSent!=='not_sent'||v.c.officeStatus==='done'||!['approved','returned'].includes(v.r.result)||v.r.decidedBy!==ref.accountId||v.c.lawyerResult!==v.r.result)return false;
       const ctx=workflowContext(s,{caseKey:ref.key});
       if(v.c.reviewedCandidateHash!==candidateHash(ctx.candidateResponseIds))return false;
       v.r.completionAttempt={at:now()};save(s);return true;
      });
      if(reserved){
       const reread=()=>read(value=>observe(value,false));
       let update;try{update=host.chatworkTaskComplete(detail);}catch{return reread();}
       return update&&typeof update.then==='function'?update.then(reread,reread):reread();
      }
     }
     const prep=transaction(s=>{
      const v=activeReview(s,ref.key);if(!v||v.send.id!==ref.sendId||v.c.officeSent!=='not_sent'||v.c.officeStatus==='done')return null;
      v.r.polledAt=now();
      if(v.r.chatworkStatus!==status){v.r.chatworkStatus=status;v.c.version++;v.c.updatedAt=now();}
      save(s);
      if(!automationReady(v)||attempted.size>=3)return null;
      const ctx=workflowContext(s,{caseKey:v.c.caseKey});
      if(v.c.reviewedCandidateHash!==candidateHash(ctx.candidateResponseIds))return null;
      if(!v.c.officeAccountId){workflow.saveCase(s,{clientId:v.c.clientId,cycleKey:v.c.cycleKey,officeAccountId:v.w.config.autoOfficeAccountId},ctx);}
      const preview=workflow.preview(s,{caseKey:v.c.caseKey,kind:'office'},ctx);
      if(preview.eligible){save(s);return preview.draft;}
      return null;
     });
     result.checked++;
     if(!prep)return null;
     attempted.add(ref.key);
     return chain(sendWorkflow({draftId:prep.id,approvedHash:prep.hash,confirmed:true},'office'),q=>{
      if(['sent','failed','unknown'].includes(q.send.status))result[q.send.status]++;
      return null;
     });
    }
    return read(observe);
   };
   function step(i){
    if(i>=selected.length)return result;
    let out;try{out=one(selected[i]);}catch{return step(i+1);}
    return out&&typeof out.then==='function'?out.then(()=>step(i+1),()=>step(i+1)):step(i+1);
   }
   try{const out=step(0);return out&&typeof out.then==='function'?out.then(finish,e=>{finish(null);throw e;}):finish(out);}catch(e){finish(null);throw e;}
  }
  function runAutomatic(){
   return chain(runLawyerAutomatic(),out=>chain(runOfficeAutomatic(),office=>office?{...out,office}:out));
  }
  function afterAutomatic(method,result){
   const done=automatic=>method==='submit'||automatic?.enabled!==true?result:{...result,automatic};
   try{const outcome=runLawyerAutomatic();return outcome&&typeof outcome.then==='function'?outcome.then(done,()=>done({blocked:1,error:'AUTOMATIC_STOPPED'})):done(outcome);}catch(error){return done({blocked:1,error:'AUTOMATIC_STOPPED'});}
  }
  function matchState(s){
   if(!s.clientsText)bad('LUの依頼者一覧CSVを読み込んでください。');
   const lu=M.parseLu(s.clientsText),legacy=s.responses.filter(r=>!r.requestId),responses=legacy.map((r,i)=>({name:r.name,email:r.email,timestamp:r.timestamp,source_row:i+2}));
   const result=M.match(lu,responses,{identity_scope:'matched'}),active=s.invites.filter(i=>!i.revoked);result.selection.source_count=lu.rows.length;
   for(const inv of active){
    const clients=lu.rows.filter(c=>String(c.client_id)===inv.clientId);if(clients.length!==1)continue;const c=clients[0],linked=s.responses.filter(r=>r.requestId===inv.requestId&&r.clientId===inv.clientId);
    result.rows=result.rows.filter(r=>r.source_row!==c.source_row);result.diagnostics.rows=result.diagnostics.rows.filter(r=>r.source_row!==c.source_row);
    const status=linked.length?'answered':'candidate',latest=linked.map(r=>r.timestamp).sort().at(-1)||'';
    const row={status,label:linked.length?'回答あり':'未回答',client_id:c.client_id,name:c.name,emails:c.emails,source_row:c.source_row,reason:linked.length?'専用リンクで依頼者ID・今回の依頼と紐づいた回答':'今回の依頼用リンクへの回答はまだありません。',answer_count:linked.length,latest_response_at:latest,match_method:'id',request_id:inv.requestId};
    const past=s.responses.filter(r=>!linked.some(x=>x.id===r.id)&&(r.clientId===c.client_id||(c.name_key&&M.normalizeName(r.name)===c.name_key)||c.emails.includes(M.normalizeEmail(r.email)))).map(r=>({name:r.name,email:r.email,timestamp:r.timestamp,response_id:r.id,answer_url:host.mode==='gas'?adminHref(r.id):'#answer='+encodeURIComponent(r.id),source:r.source}));
    result.rows.push(row);result.diagnostics.rows.push({...row,classification:'id_linked',classification_label:'依頼者ID・依頼番号で紐づけ',candidates:linked.map((r,i)=>({name:r.name,email:r.email,timestamp:r.timestamp,source_row:i+2,pair_type:'id',other_lu_exact_count:0,response_id:r.id,answer_url:host.mode==='gas'?adminHref(r.id):'#answer='+encodeURIComponent(r.id),source:r.source})),past_responses:past});
   }
   if(active.length){result.rows.sort((a,b)=>a.source_row-b.source_row);result.diagnostics.rows.sort((a,b)=>a.source_row-b.source_row);for(const k of ['answered','review','candidate'])result.summary[k]=result.rows.filter(r=>r.status===k).length;result.summary.total=result.rows.length;result.summary.excluded=lu.rows.length-result.rows.length;result.selection.invitation_tracking=true;result.diagnostics.summary.id_linked=active.length;}
   for(const row of result.diagnostics.rows){for(const c of row.candidates||[]){if(!c.response_id){const r=legacy[c.source_row-2];if(r){c.response_id=r.id;c.answer_url=host.mode==='gas'?adminHref(r.id):'#answer='+encodeURIComponent(r.id);c.source=r.source;}}}row.workflowCases=(s.workflow?.cases||[]).filter(c=>String(c.clientId)===String(row.client_id)).map(c=>caseView(c,(row.candidates||[]).map(c=>c.response_id).filter(Boolean)));}
   const uniqueClients=new Map(), claimed=new Map(), manualCases=new Map(), bySource=new Map();
   for(const c of lu.rows)if(c.client_id)uniqueClients.set(c.client_id,1+(uniqueClients.get(c.client_id)||0));
   for(const c of s.workflow?.cases||[])if(c.manualMatch?.responseId){
    claimed.set(c.manualMatch.responseId,c.clientId);
    if(!manualCases.has(c.clientId))manualCases.set(c.clientId,[]);
    manualCases.get(c.clientId).push(c);
   }
   for(const row of result.diagnostics.rows){
    bySource.set(row.source_row,row);
    row.manual_candidates=[];
    if(uniqueClients.get(row.client_id)!==1||row.request_id)continue;
    const candidates=(row.candidates||[]).filter(c=>c.response_id&&!c.other_lu_exact_count&&(!claimed.has(c.response_id)||claimed.get(c.response_id)===row.client_id));
    const basis=hash(JSON.stringify([row.client_id,M.normalizeName(row.name),[...row.emails].sort(),candidateHash((row.candidates||[]).map(c=>c.response_id).filter(Boolean))]));
    const confirmed=[...(manualCases.get(row.client_id)||[])].reverse().find(c=>c.manualMatch.basis===basis&&c.identityConfirmed===true&&c.targetConfirmed===true&&c.responseIds.includes(c.manualMatch.responseId)&&candidates.some(a=>a.response_id===c.manualMatch.responseId));
    if(confirmed)row.manual_confirmation={caseKey:confirmed.caseKey,responseId:confirmed.manualMatch.responseId};
    if(row.status==='review'&&['email_only','name_only','split'].includes(row.classification)){
     row.manual_candidates=[...new Set(candidates.map(c=>c.response_id))];
     row.manual_basis=basis;
    }
   }
   for(const row of result.rows){
    const detail=bySource.get(row.source_row);row.workflowCases=detail?.workflowCases||[];
    if(detail?.manual_confirmation)row.manual_confirmation=detail.manual_confirmation;
   }
   return result;
  }
  function confirmManualMatch(s,p){
   if(!safeString(p.clientId,120)||!p.clientId||!safeString(p.responseId,120)||!p.responseId)bad('今回の回答を選択してください。');
   const row=matchState(s).diagnostics.rows.find(r=>r.client_id===p.clientId);
   if(!row?.manual_candidates?.includes(p.responseId))bad('この回答は現在の案件に確定できません。照合一覧を開き直してください。');
   if(p.expectedBasis!==row.manual_basis||!Array.isArray(p.expectedCandidates)||p.expectedCandidates.length!==row.manual_candidates.length||
      candidateHash(p.expectedCandidates)!==candidateHash(row.manual_candidates))bad('回答候補またはLUの登録が変わりました。照合一覧を開き直してください。');
   if(row.manual_confirmation){
    if(row.manual_confirmation.responseId===p.responseId)return{match:matchState(s)};
    bad('この案件は別の回答で確認済みです。照合一覧を開き直してください。');
   }
   const cycleKey='照合-'+hash(JSON.stringify([p.clientId,p.responseId])).slice(0,24);
   const old=s.workflow?.cases?.find(c=>c.clientId===p.clientId&&c.cycleKey===cycleKey);
   if(old&&old.manualMatch?.responseId!==p.responseId)bad('この依頼には別の対応記録があります。');
   const ctx=workflowContext(s,p),data={clientId:p.clientId,cycleKey,responseIds:[p.responseId],identityConfirmed:true,targetConfirmed:true};
   let saved=workflow.saveCase(s,data,ctx);
   // Refreshing a stale selection intentionally leaves any old content approval reset.
   if(!saved.case.identityConfirmed||!saved.case.targetConfirmed)saved=workflow.saveCase(s,data,ctx);
   const record=s.workflow.cases.find(c=>c.caseKey===saved.case.caseKey);
   record.manualMatch={responseId:p.responseId,basis:row.manual_basis};
   save(s);
   return{match:matchState(s)};
  }
  const handlers={
   publicInfo:p=>transaction(s=>{findInvite(s,p.inviteToken);return{publicFormUrl:host.publicFormUrl(),inviteValid:true,mode:host.mode||'local'};}),
   login:p=>{if(host.throttle)host.throttle('login',30,600);if(!safeString(p.password,200)||!same(hash(host.adminSalt+':'+p.password),host.adminHash))bad('パスワードが違います。');const token=host.random(),expiresAt=clock()+7200000;host.sessionSet(hash(token),{expiresAt,credentialTag:host.adminHash});return{token,expiresAt:new Date(expiresAt).toISOString()};},
   logout:p=>{host.sessionDelete(hash(p.token));return{loggedOut:true};},
   submit:p=>transaction(s=>{
    if(p.website)bad('送信を受け付けられません。');if(!safeString(p.idempotencyKey,120)||p.idempotencyKey.length<16)bad('送信番号を確認できません。フォームを開き直してください。');
    const answers=validateAnswers(p.answers),requestHash=hash(JSON.stringify([answers,p.inviteToken||''])),key=hash(p.idempotencyKey),old=s.responses.find(r=>r.idempotencyKey===key);
    if(old){if(old.requestHash!==requestHash)bad('再送内容が異なります。入力内容を確認して送信し直してください。');return{saved:true,receiptId:old.id,timestamp:old.timestamp,duplicate:true};}
    const inv=findInvite(s,p.inviteToken);if(host.throttle)host.throttle('submit',120,60);
    const r={id:host.random(),idempotencyKey:key,requestHash,source:'integrated_form',timestamp:now(),receivedAt:now(),name:display(answers[contact.id]).trim(),email:M.normalizeEmail(answers.email),fields:fieldsFor(answers),answers,clientId:inv?.clientId||'',requestId:inv?.requestId||''};
    if(JSON.stringify(r).length>144000)bad('入力内容が保存上限を超えています。事務所へご連絡ください。');s.responses.push(r);save(s);return{saved:true,receiptId:r.id,timestamp:r.timestamp};
   }),
   status:p=>transaction(s=>({total:s.responses.length,clientCount:s.clientsText?M.parseLu(s.clientsText).rows.length:0,storage:host.mode==='gas'?'先方Googleアカウントの非公開スプレッドシート':'このPCの非公開ローカル保存先',label:'ユア・エース',publicFormUrl:host.publicFormUrl(),legacyImport:host.legacyStatus?host.legacyStatus():{status:'manual'}})),
   list:p=>transaction(s=>{let rows=s.responses.map(summaryRow);const q=text(p.q).trim().toLowerCase();if(q.length>200)bad('検索文字は200文字以内です。');if(q)rows=rows.filter(r=>[r.name,r.email,r.timestamp].some(x=>String(x).toLowerCase().includes(q)));rows.sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));const offset=Math.max(0,Math.floor(Number(p.offset)||0)),limit=Math.min(100,Math.max(1,Math.floor(Number(p.limit)||40)));return{rows:rows.slice(offset,offset+limit),total:rows.length};}),
   detail:p=>transaction(s=>{const r=s.responses.find(r=>r.id===p.id);if(!r)bad('回答が見つかりません。');return{...summaryRow(r),fields:r.fields};}),
   stats:p=>transaction(s=>Stats.calculate(schema,s.responses,{now:now(),parseDatetime:M.parseDatetime,normalizeName:M.normalizeName,normalizeEmail:M.normalizeEmail,source:host.statsSource?host.statsSource():s.historySource})),
   importHistory:p=>{if(host.validateImport)host.validateImport('importHistory',p);return transaction(s=>historical(p,s));},
   importClients:p=>transaction(s=>{if(!safeString(p.text,12000000)||host.byteLength(p.text)>12000000)bad('LU CSVは12MB以内で選択してください。');if(host.validateImport)host.validateImport('importClients',p);const t=M.parseLu(p.text);s.clientsText=p.text;save(s);return{count:t.rows.length};}),
   match:p=>transaction(matchState),
   workflowGet:p=>transaction(workflowMeta),
   lawyerReviewLogin:reviewLogin,
   lawyerReviewGet:p=>transaction(s=>reviewView(s,reviewSession(s,p))),
   lawyerReviewDecide:recordReview,
   workflowResolveMembers:p=>{
    if(!host.chatworkLookup||!host.resolveAttorneyMembers)bad('この環境では本番メンバーの読取設定がありません。');
    const room=String(p.lawyerRoomId||'');const office=String(p.officeRoomId||'');if(!/^[1-9][0-9]{0,19}$/.test(room)||office&&!/^[1-9][0-9]{0,19}$/.test(office))bad('タスクを送る部屋を指定してください。');
    if(typeof p.chatworkToken==='string'&&p.chatworkToken.trim()){if(!host.workflowSetToken)bad('API認証を設定できません。');host.workflowSetToken(p.chatworkToken.trim());}
    const hints=(host.workflowSetupHints?host.workflowSetupHints():null)||{};
    return chain(host.chatworkLookup('/me'),me=>{
     return chain(host.chatworkLookup('/rooms/'+room+'/members'),members=>{
      return chain(office?host.chatworkLookup('/rooms/'+office+'/members'):[],staff=>({
       ...host.resolveAttorneyMembers(hints.attorneys||[],members),senderAccountId:String(me.account_id),officeMembers:staff.map(m=>({id:String(m.account_id),label:m.name}))
      }));
     });
    });
   },
   workflowConfigure:p=>transaction(s=>{
    const prev=s.workflow?.config||{},had=prev.autoDispatchEnabled===true||prev.autoOfficeReturnEnabled===true;
    if(host.trialOnly&&p.config?.autoOfficeReturnEnabled)bad('この接続試験版では事務への実送信はできません。');
    workflow.configure(s,p.config||{});storeReviewCodes(s,p.reviewCodes);
    if(typeof p.chatworkToken==='string'&&p.chatworkToken.trim()){if(!host.workflowSetToken)bad('この保存先ではAPIトークンを設定できません。');host.workflowSetToken(p.chatworkToken.trim());}
    const isOn=s.workflow.config.autoDispatchEnabled||s.workflow.config.autoOfficeReturnEnabled;
    if(host.ensureAutomaticTrigger&&['autoDispatchEnabled','autoOfficeReturnEnabled'].some(k=>Object.prototype.hasOwnProperty.call(p.config||{},k))&&(had||isOn))host.ensureAutomaticTrigger(isOn);
    save(s);return workflowMeta(s);
   }),
   workflowConfirmMatch:p=>transaction(s=>confirmManualMatch(s,p)),
   workflowSaveCase:p=>transaction(s=>{const {token,...data}=p;const out=workflow.saveCase(s,data,workflowContext(s,p));save(s);return out;}),
   workflowPreview:p=>withAvailability(p,ctx=>transaction(s=>{const out=workflow.preview(s,{caseKey:p.caseKey,kind:p.kind},{...workflowContext(s,p),availability:ctx.availability});save(s);return out;})),
   workflowSend:sendWorkflow,
   workflowPendingInfo:p=>transaction(s=>workflow.pendingInfo(s,{caseKey:p.caseKey})),
   workflowReconcileSend:reconcileWorkflow,
   workflowTaskInfo:p=>transaction(s=>workflow.taskInfo(s,{caseKey:p.caseKey})),
   workflowCorrectTask:p=>transaction(s=>{const {token,...data}=p;const out=workflow.correctTask(s,data);save(s);return out;}),
   workflowAutoRun:p=>runAutomatic(),
  };
  const automaticEvents=new Set(['submit','importClients','importHistory','match','workflowConfigure']);
  return{runAutomatic,rpc(method,payload){const p=bounded(payload||{});if(!Object.prototype.hasOwnProperty.call(handlers,method))bad('この操作は利用できません。');if(!['publicInfo','submit','login','lawyerReviewLogin','lawyerReviewGet','lawyerReviewDecide'].includes(method))admin(p);const result=handlers[method](p);return automaticEvents.has(method)?chain(result,out=>afterAutomatic(method,out)):result;}};
 }
 return{createService};
});

(function(){
 'use strict';
 const base=new URL('./',document.currentScript.src).href, C=window.DemoSchema, E=window.YourAceEngine, M=window.YourAceMatching;
 const keys={state:'yourace106.demo.v1.case',tasks:'yourace106.demo.v1.tasks',meta:'yourace106.demo.v1.links'};
 const memory={},get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return memory[k]??d;}};
 const set=(k,v)=>{memory[k]=v;try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
 const secret='106-demo-office-only',code='106-demo-review-only-password',sessions=new Map(),salt='public-demo';
 // Non-secret deterministic IDs, for the offline demonstration only. There is no actual authentication or data exchange.
 function hash(str){
  return Array.from({length:8},(_,i)=>{let h=(2166136261+Math.imul(i,275604541))|0;for(const c of String(str)){h=Math.imul(h^c.codePointAt(0),16777619);}return (h>>>0).toString(16).padStart(8,'0');}).join('');
 }
 const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
 function task(p){return get(keys.tasks,[]).find(t=>p==='/rooms/'+t.roomId+'/tasks/'+t.task_id)||null;}
 const host={mode:'local',schema:C,engine:E,matching:M,externalEnabled:true,calendarCapability:'manual',
  now:()=>new Date().toISOString(),hash,random,byteLength:s=>new TextEncoder().encode(s).length,
  adminSalt:salt,adminHash:hash(salt+':'+secret),sessionGet:k=>sessions.get(k),sessionSet:(k,v)=>sessions.set(k,v),sessionDelete:k=>sessions.delete(k),
  transaction:fn=>fn(),load:()=>get(keys.state,{responses:[],invites:[],clientsText:''}),save:s=>set(keys.state,s),
  adminUrl:()=>base,publicFormUrl:()=>base+'form/',workflowTokenConfigured:()=>true,calendarAvailability:()=>({'101':'available'}),
  taskCompletionReady:()=>true,
  chatworkTaskRead:task,
  chatworkTaskComplete:p=>{const tasks=get(keys.tasks,[]),t=tasks.find(t=>p==='/rooms/'+t.roomId+'/tasks/'+t.task_id);if(!t)return false;t.status='done';set(keys.tasks,tasks);return true;},
  chatworkCreate:(p,meta)=>{const tasks=get(keys.tasks,[]),id=String(1000+tasks.length);tasks.push({task_id:id,roomId:p.roomId,account:{account_id:p.accountId},status:'open',body:p.body,kind:meta.kind});set(keys.tasks,tasks);return{outcome:'sent',taskIds:[id]};}
 };
 const service=window.YourAceService.createService(host);
 function seed(){
  if(get(keys.meta,null))return;
  set(keys.tasks,[]);set(keys.state,{responses:[],invites:[],clientsText:''});
  const access=service.rpc('login',{password:secret}).token,rpc=(m,p={})=>service.rpc(m,{token:access,...p});
  rpc('workflowConfigure',{config:{attorneys:[{id:'101',label:'確認担当（デモ）',calendarId:'demo',enabled:true}],officeStaff:[{id:'201',label:'事務担当（デモ）'}],lawyerRoomId:'901',officeRoomId:'902',externalEnabled:true,autoOfficeReturnEnabled:true,autoOfficeAccountId:'201'},reviewCodes:[{accountId:'101',code}]});
  service.rpc('submit',{idempotencyKey:'fictional-example-answer-001',answers:{email:'hanako@example.test',name:'架空 花子',tel:'000-0000-0000',intentValue:'今の手続きの進め方を変更したいです。',reason:'あらためて希望する進め方を事務と相談したいからです。',read:'はい',note:'動作確認用の架空の回答です。'}});
  rpc('importClients',{text:'依頼者ID,氏名,Email1\n10601,架空花子,hanako@example.test\n'});
  const match=rpc('match'),responseId=match.diagnostics.rows[0].candidates[0].response_id;
  const prepared=rpc('workflowSaveCase',{clientId:'10601',cycleKey:'方針変更・公開デモ（架空）',responseIds:[responseId],identityConfirmed:true,targetConfirmed:true,contentStatus:'ready'}).case;
  const draft=rpc('workflowPreview',{caseKey:prepared.caseKey,kind:'lawyer'});
  if(!draft.eligible)throw new Error('デモの準備ができませんでした。');
  // GitHub Pages and the local web-testing server both use a real HTTPS or loopback base.
  rpc('workflowSend',{draftId:draft.draft.id,approvedHash:draft.draft.hash,confirmed:true});
  set(keys.meta,{caseKey:prepared.caseKey});
 }
 // This alias is only used by the public demonstration assets, not by production Code.gs.
 seed();
 const demoLogin=(m,p)=>m==='login'?{...p,password:secret}:m==='lawyerReviewLogin'?{...p,code}:p;
 const disallowed=new Set(['workflowResolveMembers','workflowConfigure','workflowAutoRun','importHistory','importClients','workflowCorrectTask','workflowReconcileSend','workflowSend']);
 window.AceAPI=Object.freeze({call:async(m,p={})=>{
  if(disallowed.has(m))throw Error('公開デモでは外部連携・設定変更・実データ取込みはできません。');
  return service.rpc(m,demoLogin(m,p));
 }});
 window.Ace106Demo=Object.freeze({caseLink:()=>base+'review/?case='+encodeURIComponent(get(keys.meta,null).caseKey),tasks:()=>get(keys.tasks,[]),reset:()=>{for(const k of Object.values(keys)){try{localStorage.removeItem(k);}catch{}delete memory[k];}seed();},base});
})();
