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
