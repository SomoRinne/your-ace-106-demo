(function () {
  'use strict';
  const schema=window.YOURACE_FORM_SCHEMA,engine=window.YourAceEngine,$=id=>document.getElementById(id);
  const make=(tag,cls,content)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(content!=null)node.textContent=String(content);return node;};
  const labelOf=item=>typeof item==='object'&&item!==null?String(item.label??item.value??item.id):String(item);
  const valueOf=item=>typeof item==='object'&&item!==null?item.value??item.label??item.id:item;
  const selectedValue=value=>value&&typeof value==='object'&&!Array.isArray(value)?value.value:value;
  const answers=Object.create(null),readers=new Map(),questionNodes=new Map(),sectionNodes=new Map();
  let page='contact',emailRecheck=false,correction=false,activeIds=new Set(),ready=false,submission=null,savedReceipt=null;
  const inviteToken=window.ACE_INVITE_TOKEN||new URLSearchParams(location.search).get('inviteToken')||undefined;
  const newKey=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
  function fatal(message){$('loading-panel').hidden=true;$('fatal').textContent=message;$('fatal').hidden=false;$('form-panel').hidden=true;}
  if(!schema?.sections?.length||!engine){fatal('フォーム定義を読み込めません。ファイル一式をご確認ください。');return;}
  const startId=schema.startSectionId||schema.sections[0].id,contactQuestion=schema.sections.find(s=>s.id===startId)?.questions?.[0];
  if(!contactQuestion){fatal('基本情報の定義を確認できません。');return;}
  const allQuestions=schema.sections.flatMap(s=>s.questions),contactIds=new Set([contactQuestion.id,'email','emailConfirm']);
  function collect(){for(const[id,read]of readers)if(activeIds.has(id))answers[id]=read();}
  function flow(which){for(const name of ['input','review','done']){const item=$('flow-'+name);item.classList.toggle('is-current',name===which);if(name===which)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');}}
  function focusTitle(id){const node=$(id);node.focus({preventScroll:true});window.scrollTo({top:0,behavior:'auto'});}
  function setHelp(control,q) {const ids=[];if(q.description)ids.push('help-'+q.id);ids.push('error-'+q.id);control.setAttribute('aria-describedby',ids.join(' '));control.dataset.questionId=q.id;}
  function makeControl(q,type,value) {const node=make(type==='textarea'?'textarea':'input','answer-control');node.id='answer-'+q.id;if(type!=='textarea')node.type=type;node.name=q.id;node.value=value??'';node.autocomplete=q.id==='email'?'email':'off';if(q.required)node.required=true;setHelp(node,q);return node;}
  function renderQuestion(q) {
    const choice=['radio','checkbox','scale','grid','checkboxGrid'].includes(q.type);
    const group=make(choice?'fieldset':'div','question');group.id='question-'+q.id;
    const heading=make(choice?'legend':'label','question-heading');if(!choice)heading.htmlFor='answer-'+q.id;
    heading.append(make('span','question-title',q.title));if(q.required)heading.append(make('span','required-tag','必須'));group.append(heading);
    if(q.description?.trim()){const help=make('p','field-help',q.description);help.id='help-'+q.id;group.append(help);}
    if(choice){group.setAttribute('aria-required',q.required?'true':'false');group.setAttribute('aria-describedby','error-'+q.id);}
    const stored=answers[q.id];
    if(['short','paragraph','date','time'].includes(q.type)) {
      const type=q.type==='paragraph'?'textarea':q.type==='date'?'date':q.type==='time'?'time':q.id==='email'||q.id==='emailConfirm'?'email':'text';
      const control=makeControl(q,type,stored);group.append(control);readers.set(q.id,()=>control.value);
    } else if(q.type==='select') {
      const control=make('select','answer-control');control.id='answer-'+q.id;control.name=q.id;setHelp(control,q);if(q.required)control.required=true;
      const placeholder=make('option','', '選択してください');placeholder.value='';control.append(placeholder);
      for(const option of q.options||[]){const node=make('option','',labelOf(option));node.value=valueOf(option);control.append(node);}control.value=stored??'';group.append(control);readers.set(q.id,()=>control.value);
    } else if(['radio','checkbox','scale'].includes(q.type)) {
      const list=make('div','option-list'),entries=[];const multiple=q.type==='checkbox';
      (q.options||[]).forEach((option,index)=>{
        const value=valueOf(option),card=make('label','option-card'),input=make('input');input.type=multiple?'checkbox':'radio';input.id='answer-'+q.id+'-'+index;input.name=q.id;input.value=value;setHelp(input,q);
        const selected=multiple?(Array.isArray(stored)?stored:[]):[stored];input.checked=selected.some(v=>selectedValue(v)===value);
        card.append(input,make('span','',labelOf(option)));list.append(card);const entry={input,value};
        if(option.other){const detail=make('div','other-detail'),other=make('input','answer-control');other.type='text';other.id='other-'+q.id+'-'+index;other.autocomplete='off';other.setAttribute('aria-label',q.title+'：その他の内容');other.setAttribute('aria-describedby','error-'+q.id);const old=selected.find(v=>selectedValue(v)===value);other.value=old?.otherText||'';detail.append(other);list.append(detail);detail.hidden=!input.checked;entry.other=other;entry.detail=detail;}
        entries.push(entry);
      });
      const updateOthers=()=>entries.forEach(item=>{if(item.detail)item.detail.hidden=!item.input.checked;});list.addEventListener('change',updateOthers);group.append(list);
      if(!q.required&&!multiple){const clear=make('button','clear-answer','選択を取り消す');clear.type='button';clear.addEventListener('click',()=>{for(const entry of entries)entry.input.checked=false;updateOthers();answers[q.id]='';});group.append(clear);}
      readers.set(q.id,()=>{const chosen=entries.filter(item=>item.input.checked).map(item=>item.other?{value:item.value,otherText:item.other.value}:item.value);return multiple?chosen:chosen[0]??'';});
    } else if(['grid','checkboxGrid'].includes(q.type)) {
      const scroll=make('div','grid-scroll'),table=make('table','answer-grid'),head=make('thead'),headrow=make('tr');headrow.append(make('th','', ''));
      for(const col of q.columns||[]){const th=make('th','',labelOf(col));th.scope='col';headrow.append(th);}head.append(headrow);table.append(head);const body=make('tbody'),inputs=[];
      (q.rows||[]).forEach((row,r)=>{const tr=make('tr'),th=make('th','',labelOf(row));th.scope='row';tr.append(th);const cells=[];
        (q.columns||[]).forEach((col,c)=>{const td=make('td'),input=make('input');input.type=q.type==='grid'?'radio':'checkbox';input.id='answer-'+q.id+'-'+r+'-'+c;input.name=q.id+'-'+r;input.value=valueOf(col);input.setAttribute('aria-label',labelOf(row)+'：'+labelOf(col));setHelp(input,q);const rowValue=stored?.[valueOf(row)];input.checked=Array.isArray(rowValue)?rowValue.includes(valueOf(col)):rowValue===valueOf(col);td.append(input);tr.append(td);cells.push(input);});body.append(tr);inputs.push({row:valueOf(row),cells});});table.append(body);scroll.append(table);group.append(scroll,make('p','grid-note','横にスクロールしてすべての選択肢を確認できます。'));
      readers.set(q.id,()=>{const result={};for(const row of inputs){const selected=row.cells.filter(n=>n.checked).map(n=>n.value);if(selected.length)result[row.row]=q.type==='grid'?selected[0]:selected;}return result;});
    } else {group.append(make('p','field-error','この質問形式は確認中のため先へ進めません。'));readers.set(q.id,()=>stored??'');}
    const error=make('p','field-error');error.id='error-'+q.id;error.hidden=true;group.append(error);return group;
  }

  function appendQuestion(parent,q){const node=renderQuestion(q);questionNodes.set(q.id,node);parent.append(node);return node;}
  function resetQuestion(id){delete answers[id];const group=questionNodes.get(id);if(!group)return;for(const field of group.querySelectorAll('input,select,textarea')){if(['radio','checkbox'].includes(field.type))field.checked=false;else field.value='';}for(const detail of group.querySelectorAll('.other-detail'))detail.hidden=true;}
  function clearErrors(){const summary=$('error-summary');summary.hidden=true;summary.replaceChildren();for(const node of document.querySelectorAll('.question [aria-invalid]'))node.removeAttribute('aria-invalid');for(const node of document.querySelectorAll('.question .field-error')){node.hidden=true;node.textContent='';}}
  function showErrors(errors){clearErrors();const summary=$('error-summary');summary.append(make('p','', '入力内容をご確認ください'));const list=make('ul');for(const error of errors){const group=questionNodes.get(error.questionId),message=$('error-'+error.questionId);if(message){message.textContent=error.message;message.hidden=false;}if(group)for(const field of group.querySelectorAll('input,select,textarea'))field.setAttribute('aria-invalid','true');const li=make('li'),link=make('a','',error.message);link.href='#question-'+error.questionId;link.addEventListener('click',event=>{event.preventDefault();group?.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus();});li.append(link);list.append(li);}summary.append(list);summary.hidden=false;summary.focus({preventScroll:true});summary.scrollIntoView({behavior:'auto',block:'start'});}
  function buildContact(){for(const id of contactIds){readers.delete(id);questionNodes.delete(id);}$('contact-questions').replaceChildren();if(schema.collectEmail?.enabled)appendQuestion($('contact-questions'),engine.emailQuestion(schema));if(emailRecheck)appendQuestion($('contact-questions'),{id:'emailConfirm',title:'メールアドレス（再入力）',type:'short',required:true,validation:[{kind:'email'}]});appendQuestion($('contact-questions'),contactQuestion);}
  function syncVisibility(){let route;try{route=engine.visibleRoute(schema,answers);}catch{fatal('分岐の定義を確認する必要があります。');return;}if(route.error){fatal('分岐の定義を確認する必要があります。');return;}const visibleSections=new Set(route.sectionIds),nextActive=new Set(['email',contactQuestion.id,...(emailRecheck?['emailConfirm']:[])]);for(const id of route.sectionIds)for(const q of schema.sections.find(s=>s.id===id).questions)nextActive.add(q.id);for(const [id,node]of questionNodes){const active=nextActive.has(id);if(!active&&activeIds.has(id))resetQuestion(id);for(const field of node.querySelectorAll('input,select,textarea,button'))field.disabled=!active;}for(const[id,node]of sectionNodes)node.hidden=!visibleSections.has(id);activeIds=nextActive;}
  function buildQuestions(){for(const section of schema.sections){const questions=section.questions.filter(q=>q.id!==contactQuestion.id);if(!questions.length)continue;const block=make('section','source-section');block.id='source-section-'+section.id;const heading=make('h3','source-section-title',section.title);block.append(heading);if(section.description?.trim())block.append(make('div','source-description',section.description));for(const q of questions)appendQuestion(block,q);sectionNodes.set(section.id,block);$('questions').append(block);}}
  function showPage(next,focus=true){page=next;$('fatal').hidden=true;$('form-panel').hidden=!['contact','questions'].includes(next);$('contact-panel').hidden=next!=='contact';$('question-panel').hidden=next!=='questions';$('review-panel').hidden=next!=='review';$('done-panel').hidden=next!=='done';$('back-button').disabled=next==='contact';$('back-button').hidden=next==='contact';$('next-button').replaceChildren(document.createTextNode(next==='questions'?'入力内容を確認する ':'確認事項の入力へ '),make('span','', '→'));flow(next==='review'?'review':next==='done'?'done':'input');clearErrors();if(focus)focusTitle(next==='contact'?'contact-title':next==='questions'?'questions-title':next==='review'?'review-title':'done-title');}
  function contactErrors(){const errors=[];if(schema.collectEmail?.enabled)errors.push(...engine.validateQuestion(engine.emailQuestion(schema),answers.email));errors.push(...engine.validateQuestion(contactQuestion,answers[contactQuestion.id]));if(emailRecheck){errors.push(...engine.validateQuestion({id:'emailConfirm',type:'short',required:true,validation:[{kind:'email'}]},answers.emailConfirm));if(answers.email!==answers.emailConfirm)errors.push({questionId:'emailConfirm',message:'メールアドレスが一致していません。'});}return errors;}
  function activeErrors(){return allQuestions.filter(q=>activeIds.has(q.id)&&q.id!==contactQuestion.id).flatMap(q=>engine.validateQuestion(q,answers[q.id]));}
  function displayAnswer(value){if(value==null||value==='')return '（未入力）';if(Array.isArray(value))return value.map(displayAnswer).join('、');if(typeof value==='object'){if(Object.hasOwn(value,'value'))return String(value.value)+(value.otherText?'：'+value.otherText:'');return Object.entries(value).map(([k,v])=>k+'：'+displayAnswer(v)).join('\n');}return String(value);}
  function displayAnswerFor(q,value){if(Array.isArray(value))return value.map(v=>displayAnswerFor(q,v)).join('、');if(value&&typeof value==='object'&&Object.hasOwn(value,'value')){const option=(q.options||[]).find(o=>valueOf(o)===value.value);return(option?labelOf(option):String(value.value))+(value.otherText?'：'+value.otherText:'');}return displayAnswer(value);}
  function reviewBlock(title,questions){const block=make('section','review-section');block.append(make('h3','',title));const list=make('dl');for(const q of questions)list.append(make('dt','',q.title),make('dd','',displayAnswerFor(q,answers[q.id])));block.append(list);return block;}
  function showReview(){collect();syncVisibility();const basics=contactErrors(),errors=activeErrors();if(basics.length){showPage('contact');showErrors(basics);return;}if(errors.length){showPage('questions');showErrors(errors);return;}const original=engine.traceRoute(schema,answers),visible=engine.visibleRoute(schema,answers);if(original.error||JSON.stringify(original.sectionIds)!==JSON.stringify(visible.sectionIds)){fatal('分岐を確認できません。');return;}$('review-content').replaceChildren();const basicQuestions=[...(schema.collectEmail?.enabled?[engine.emailQuestion(schema)]:[]),contactQuestion];$('review-content').append(reviewBlock('基本情報',basicQuestions));for(const id of original.sectionIds){const section=schema.sections.find(s=>s.id===id),questions=section.questions.filter(q=>q.id!==contactQuestion.id);if(questions.length)$('review-content').append(reviewBlock(section.title,questions));}$('correction-confirm-wrap').hidden=!correction;$('correction-confirm').checked=false;$('review-error').hidden=true;showPage('review');}
  async function finish(){
    if(!ready||savedReceipt)return;
    if(correction&&!$('correction-confirm').checked){$('review-error').textContent='内容を確認してチェックしてください。';$('review-error').hidden=false;$('correction-confirm').focus();return;}
    const button=$('finish-button');if(button.disabled)return;button.disabled=true;button.textContent='送信中…';
    for(const id of ['review-back','review-edit-contact','review-edit-questions'])$(id).disabled=true;
    $('review-error').hidden=true;
    try{
      const payload=engine.activePayload(schema,answers),json=JSON.stringify(payload.answers);
      if(!submission||submission.json!==json)submission={json,key:newKey()};
      const receipt=await window.AceAPI.call('submit',{answers:payload.answers,idempotencyKey:submission.key,...(inviteToken?{inviteToken}:{}),website:$('website').value});
      if(receipt?.saved!==true||!receipt.receiptId||!receipt.timestamp)throw new Error('receipt');
      savedReceipt=receipt;$('receipt-id').textContent='受付番号：'+receipt.receiptId;$('receipt-id').hidden=false;
      showPage('done');$('session-note').hidden=true;
    }catch{
      $('review-error').textContent='送信を確認できませんでした。入力内容はこの画面に残っています。通信状態をご確認のうえ、もう一度「回答を送信する」を押してください。';$('review-error').hidden=false;$('review-error').focus();
    }finally{
      button.disabled=!!savedReceipt;button.replaceChildren(document.createTextNode('回答を送信する '),make('span','', '→'));
      for(const id of ['review-back','review-edit-contact','review-edit-questions'])$(id).disabled=!!savedReceipt;
    }
  }
  $('form-title').textContent=schema.sections[0]?.title||schema.title;$('form-description').textContent=schema.description||'';document.title=(schema.sections[0]?.title||schema.title)+'｜ユア・エース';
  window.AceAPI.call('publicInfo',inviteToken?{inviteToken}:{}).then(()=>{ready=true;$('loading-panel').hidden=true;buildContact();buildQuestions();syncVisibility();showPage('contact',false);document.body.dataset.ready='true';}).catch(()=>fatal('フォームを読み込めませんでした。URLをご確認のうえ、もう一度開いてください。'));
  $('answer-form').addEventListener('submit',event=>{event.preventDefault();if(!ready||savedReceipt)return;collect();syncVisibility();if(page==='contact'){const errors=contactErrors();if(errors.length){showErrors(errors);return;}showPage('questions');}else showReview();});
  const onInput=()=>{collect();syncVisibility();};$('answer-form').addEventListener('input',onInput);$('answer-form').addEventListener('change',onInput);
  $('back-button').addEventListener('click',()=>{collect();showPage('contact');});
  $('review-back').addEventListener('click',()=>showPage('questions'));$('review-edit-contact').addEventListener('click',()=>showPage('contact'));$('review-edit-questions').addEventListener('click',()=>showPage('questions'));$('finish-button').addEventListener('click',finish);
})();
