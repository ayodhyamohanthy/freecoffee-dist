(function(){
  var API='https://freecoffee-backend.ayodhya-711.workers.dev', KEY='fc_session';
  var $=function(id){return document.getElementById(id);};
  var status=$('auth-status'), btns=$('auth-buttons'), acct=$('auth-account');
  var errs={not_configured:'Sign-in is not switched on yet.',expired:'That sign-in link expired. Try again.',bad_request:'Something went wrong. Try again.',provider_failed:'The sign-in provider did not answer. Try again.'};
  var h=location.hash.replace(/^#/,''), p=new URLSearchParams(h), msg='';
  if(p.get('session')&&/^[a-f0-9]{64}$/.test(p.get('session'))){try{localStorage.setItem(KEY,p.get('session'));}catch(e){}history.replaceState(null,'',location.pathname);}
  else if(p.get('error')){msg=errs[p.get('error')]||errs.bad_request;history.replaceState(null,'',location.pathname);}
  function tok(){try{return localStorage.getItem(KEY)||'';}catch(e){return '';}}
  function showOut(){
    fetch(API+'/auth/status').then(function(r){return r.json();}).then(function(j){
      var g=j.providers.github,o=j.providers.google;
      $('btn-github').hidden=!g;$('btn-google').hidden=!o;
      $('btn-github').href=API+'/auth/github/start';$('btn-google').href=API+'/auth/google/start';
      if(g||o){status.textContent=msg||'Choose how to sign in.';btns.hidden=false;}
      else status.textContent=msg||'Sign-in is not switched on yet. Check back soon.';
    }).catch(function(){status.textContent='Could not reach the sign-in service. Try again in a minute.';});
  }
  var t=tok();
  if(!t){showOut();return;}
  fetch(API+'/me',{headers:{authorization:'Bearer '+t}}).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.account){try{localStorage.removeItem(KEY);}catch(e){}showOut();return;}
    status.hidden=true;acct.hidden=false;
    $('acct-name').textContent=j.account.name;
    $('acct-meta').textContent='Signed in with '+(j.account.provider==='github'?'GitHub':'Google')+'.';
  }).catch(function(){status.textContent='Could not reach the sign-in service. Try again in a minute.';});
  $('btn-out').addEventListener('click',function(){
    fetch(API+'/auth/logout',{method:'POST',headers:{authorization:'Bearer '+tok()}}).finally(function(){try{localStorage.removeItem(KEY);}catch(e){}location.reload();});
  });
})();
