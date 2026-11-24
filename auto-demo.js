(function(){
 const show=(form,input)=>{
  const f=document.getElementById(form),p=document.getElementById(input);
  if(!f||!p)return;
  p.value='106-public-demo-placeholder';
  const b=f.querySelector('button[type=submit]');
  if(b)b.textContent=form==='login-form'?'管理画面のデモを開く':'案件のデモを開く';
  // This is a public synthetic simulator. The product retains restricted login.
  const label=f.querySelector('label[for="'+input+'"]');if(label)label.hidden=true;p.hidden=true;
 };
 show('login-form','password');show('review-login','review-code');
})();
