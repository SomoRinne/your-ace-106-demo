(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const key=window.ACE_REVIEW_CASE||new URLSearchParams(location.search).get('case')||'';
 const el=(t,v)=>{const span=document.createElement(t);if(v!=null)span.textContent=String(v);return span;};
 const request=(m,p={})=>window.AceAPI.call(m,{caseKey:key,...p});
 let token='';
 const error=text=>{$('review-error').textContent=text||'';$('review-error').hidden=!text;};
 function paintStatus(x){
  const labels={pending:'判断はまだ記録されていません',approved:'問題なしを記録済み',returned:'差し戻しを記録済み'};
  $('review-state').textContent=(labels[x.result]||'未確認')+(x.reason?'\n理由：'+x.reason:'');
  const wasDone=x.chatworkStatus==='done';
  const doneText=wasDone?'元のChatwork ToDoは完了しました。':x.completionAttempted?'判断は保存済みです。Chatworkの完了を確認できていません。':'元のChatwork ToDoを完了処理中です。';
  $('review-next').textContent=x.result==='returned'?doneText+' 通常の事務ToDoは送りません。': x.officeSent==='sent'?'元のChatwork ToDoは完了し、事務へのToDoを送信しました。': x.officeSent==='unknown'?doneText+' 事務への送信結果を管理画面で確認してください。': x.officeSent==='failed'?doneText+' 事務への送信に失敗しました。管理画面で確認してください。': x.result==='approved'?doneText+(wasDone?' 事務への返却を待っています。':''):wasDone?'Chatworkは完了しています。判断を選んで保存してください。': x.canDecide?'判断を保存すると、元のChatwork ToDoも自動で完了します。':'この画面から判断を変更できません。事務担当者にご確認ください。';
  $('review-decision').hidden=!x.canDecide;
 }
 function show(x){
  $('review-login').hidden=true;$('review-case').hidden=false;
  $('review-client').textContent=x.clientName;$('review-cycle').textContent=x.caseLabel;
  const groups=x.answers.map((a,i)=>{
   const box=el('details');box.className='submitted-form';box.open=i===0;
   const d=new Date(a.timestamp),date=Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(d);
   box.append(el('summary',(a.formTitle||'お手続き確認書')+'：回答 '+(i+1)+(date?'　'+date:'')));
   let stack=null,section=null;
   for(const f of a.fields){
    if(!stack||section!==f.section){section=f.section;if(section)box.append(el('h3',section));stack=el('dl');box.append(stack);}
    const cell=el('div');cell.className='answer-field';cell.append(el('dt',f.title),el('dd',String(f.value??'')||'—'));stack.append(cell);
   }
   return box;
  });
  $('review-answers').replaceChildren(...groups);paintStatus(x);
 }
 function close(){
  token='';$('review-case').hidden=true;$('review-login').hidden=false;
  $('review-answers').replaceChildren();$('review-client').textContent='';$('review-cycle').textContent='';$('review-state').textContent='';$('review-next').textContent='';
  $('review-decision').reset();toggleReason();$('review-code').focus();
 }
 function toggleReason(){
  const returned=$('review-decision').querySelector('input:checked')?.value==='returned';
  $('review-reason-label').hidden=!returned;$('review-reason').required=returned;$('review-reason').disabled=!returned;
 }
 $('review-decision').addEventListener('change',toggleReason);
 $('review-logout').addEventListener('click',()=>{error();close();});
 if(!/^case_[a-f0-9]{64}$/.test(key)){$('review-login').hidden=true;error('案件を確認できません。Chatworkに届いたリンクを開いてください。');}
 $('review-login').addEventListener('submit',async ev=>{
  ev.preventDefault();const button=ev.submitter;if(button.disabled)return;button.disabled=true;error();
  const code=$('review-code').value;$('review-code').value='';
  try{token=(await request('lawyerReviewLogin',{code})).token;show(await request('lawyerReviewGet',{token}));}
  catch(e){token='';error(e.message);}
  finally{button.disabled=false;}
 });
 $('review-decision').addEventListener('submit',async ev=>{
  ev.preventDefault();const button=ev.submitter;if(button.disabled)return;button.disabled=true;error();
  try{
   const result=new FormData(ev.target).get('result'),reason=result==='returned'?$('review-reason').value:'';
   paintStatus(await request('lawyerReviewDecide',{token,result,reason}));
  }catch(e){error(e.message);}
  finally{button.disabled=false;}
 });
 setInterval(async()=>{
  if(!token||document.hidden)return;const t=token;
  try{const state=await request('lawyerReviewGet',{token:t});if(t===token)paintStatus(state);}
  catch(e){if(t===token&&e.code==='UNAUTHORIZED'){close();error(e.message);}}
 },15000);
})();
