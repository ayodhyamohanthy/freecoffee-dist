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
    fetch(API+'/me/bids',{headers:{authorization:'Bearer '+t}}).then(function(r){return r.ok?r.json():null;}).then(function(b){
      var el=$('acct-bids');
      if(!b||!b.bids||!b.bids.length){el.textContent='No bids yet. Bids you place on the advertisers page while signed in appear here.';return;}
      el.textContent='';
      var ul=document.createElement('ul');
      b.bids.forEach(function(x){var li=document.createElement('li');li.textContent=x.sponsor+' ('+x.campaignId+'): $'+Number(x.cpm).toFixed(2)+' CPM on '+x.placed+' block'+(x.placed===1?'':'s')+', holding '+x.winningAtTime+' when placed, '+new Date(x.ts).toLocaleDateString();ul.appendChild(li);});
      el.appendChild(ul);
      var n=document.createElement('p');n.textContent=b.note;el.appendChild(n);
    }).catch(function(){$('acct-bids').textContent='Could not load your bids.';});
    function renderLink(){
      var el=$('acct-link');
      fetch(API+'/me/link',{headers:{authorization:'Bearer '+t}}).then(function(r){return r.json();}).then(function(l){
        el.textContent='';
        var b=document.createElement('button');b.type='button';b.className='fc-primary';
        if(l.link){
          var p=document.createElement('p');p.textContent=l.link.label+', linked '+new Date(l.link.linkedAt).toLocaleDateString()+'. One Mac per account.';el.appendChild(p);
          b.textContent='Unlink this Mac';
          b.addEventListener('click',function(){fetch(API+'/me/link/unlink',{method:'POST',headers:{authorization:'Bearer '+t}}).then(renderLink);});
        } else {
          var q=document.createElement('p');q.textContent='No Mac linked. Make a one-time code, then enter it in the Mac app. The Mac app version that accepts codes has not been released yet, and linking does not change what you earn.';el.appendChild(q);
          b.textContent='Make a link code';
          b.addEventListener('click',function(){fetch(API+'/me/link-code',{method:'POST',headers:{authorization:'Bearer '+t}}).then(function(r){return r.json();}).then(function(c){
            if(!c.ok){q.textContent='Could not make a code. Try again.';return;}
            var out=document.createElement('p');out.className='fc-code';out.textContent=c.code;el.appendChild(out);
            var n=document.createElement('p');n.textContent='Expires at '+new Date(c.expiresAt).toLocaleTimeString()+'. One use.';el.appendChild(n);b.hidden=true;
          });});
        }
        el.appendChild(b);
      }).catch(function(){el.textContent='Could not load link status.';});
    }
    renderLink();
    $('acct-meta').textContent='Signed in with '+(j.account.provider==='github'?'GitHub':'Google')+'.';
  }).catch(function(){status.textContent='Could not reach the sign-in service. Try again in a minute.';});
  $('btn-out').addEventListener('click',function(){
    fetch(API+'/auth/logout',{method:'POST',headers:{authorization:'Bearer '+tok()}}).finally(function(){try{localStorage.removeItem(KEY);}catch(e){}location.reload();});
  });
})();
