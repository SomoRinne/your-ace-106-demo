(function(){
 const d=window.Ace106Demo,$=s=>document.querySelector(s);
 const q=new URLSearchParams(location.search);
 if(q.get('view')==='review'&&/^case_[a-f0-9]{64}$/.test(q.get('case')||'')){location.replace(d.base+'review/?case='+encodeURIComponent(q.get('case')));return;}
 if(location.hash.startsWith('#answer=')){location.replace(d.base+'admin.html'+location.hash);return;}
 const make=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
 function paint(){
  $('#demo-review').href=d.caseLink();
  const rows=d.tasks().map(v=>{
   const card=make('details',''), role=v.kind==='office'?'事務への返却':'弁護士への依頼', status=v.status==='done'?'完了':'未完了';
   card.append(make('summary',role+' · '+status),make('pre',v.body));return card;
  });
  $('#demo-tasks').replaceChildren(...rows);
 }
 $('#demo-reset').addEventListener('click',()=>{d.reset();paint();$('#demo-message').textContent='新しい架空案件から試せます。';});
 window.addEventListener('pageshow',paint);
 window.addEventListener('storage',paint);
 paint();
})();
