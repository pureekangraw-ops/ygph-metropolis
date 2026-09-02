const CHAT_STORAGE_KEY='lighthouse.chat.v1';
const $=id=>document.getElementById(id);

function ensureStylesheet(){
  if(document.querySelector('link[data-lighthouse-chat-style]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./ui/chat-ui.css';
  link.dataset.lighthouseChatStyle='true';
  document.head.append(link);
}

function safeParse(raw){
  try{
    const value=JSON.parse(raw||'[]');
    return Array.isArray(value)?value:[];
  }catch{return[];}
}
function loadMessages(){return safeParse(globalThis.localStorage?.getItem(CHAT_STORAGE_KEY)).filter(message=>message&&['user','assistant'].includes(message.role)&&typeof message.text==='string');}
function saveMessages(messages){try{globalThis.localStorage?.setItem(CHAT_STORAGE_KEY,JSON.stringify(messages.slice(-300)));}catch{}}

function createShell(workspace){
  if($('lighthouseChat'))return $('lighthouseChat');
  const section=document.createElement('section');
  section.id='lighthouseChat';
  section.className='lighthouse-chat';
  section.setAttribute('data-lighthouse-page','chat');
  section.innerHTML=`
    <header class="lighthouse-chat-head"><small>CHAT</small><h1>คุยกับ GO</h1></header>
    <div id="lighthouseChatMessages" class="lighthouse-chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
    <form id="lighthouseChatForm" class="lighthouse-chat-composer">
      <textarea id="lighthouseChatText" rows="1" maxlength="1200" placeholder="พิมพ์ข้อความ…" aria-label="ข้อความ" required></textarea>
      <button id="lighthouseChatSend" class="lighthouse-chat-send" type="submit" aria-label="ส่ง">➤</button>
    </form>`;
  workspace.prepend(section);
  return section;
}

function textFromSource(){
  const question=$('masterInputQuestionBox')?.hidden?'':String($('masterInputQuestion')?.textContent||'').trim();
  const title=String($('masterInputTitle')?.textContent||'').trim();
  const copy=String($('masterInputCopy')?.textContent||'').trim();
  return [question,title,copy].filter(Boolean).join('\n');
}
function sourceActionLabels(){return [...($('masterInputActions')?.querySelectorAll('button')||[])].map(button=>String(button.textContent||'').trim()).filter(Boolean);}
function fingerprintSource(state,text,labels){return JSON.stringify([state,text,labels]);}

export function installChatUI(){
  ensureStylesheet();
  const workspace=$('workspace');
  const master=$('masterInputShell');
  if(!workspace||!master)return false;
  createShell(workspace);
  master.setAttribute('aria-hidden','true');
  master.classList.add('lighthouse-internal-master-input');

  const list=$('lighthouseChatMessages');
  const form=$('lighthouseChatForm');
  const input=$('lighthouseChatText');
  const send=$('lighthouseChatSend');
  let messages=loadMessages();
  let busy=false;
  let lastFingerprint=messages.at(-1)?.sourceFingerprint||'';

  function scrollLatest(){requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;});}
  function renderMessage(message,{persist=false,proxySourceButtons=false}={}){
    const row=document.createElement('article');
    row.className='lighthouse-chat-message';
    row.dataset.chatMessage='true';
    row.dataset.chatRole=message.role;
    row.setAttribute('data-chat-role',message.role);
    const bubble=document.createElement('div');
    bubble.className='lighthouse-chat-bubble';
    bubble.textContent=message.text;
    row.append(bubble);
    if(proxySourceButtons&&message.actions?.length){
      const actions=document.createElement('div');
      actions.className='lighthouse-chat-actions';
      message.actions.forEach((label,index)=>{
        const button=document.createElement('button');
        button.type='button';
        button.textContent=label;
        button.addEventListener('click',()=>{
          if(busy)return;
          const sourceButtons=[...($('masterInputActions')?.querySelectorAll('button')||[])];
          const sourceButton=sourceButtons[index];
          if(!sourceButton)return;
          if(label==='เปิดรายการ')document.querySelector('[data-lighthouse-nav="manual"]')?.click();
          sourceButton.click();
        });
        actions.append(button);
      });
      bubble.append(actions);
    }
    list.append(row);
    if(persist){messages.push(message);saveMessages(messages);}
    scrollLatest();
  }

  messages.forEach(message=>renderMessage(message));
  function appendUser(text){renderMessage({id:`u-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:'user',text,createdAt:new Date().toISOString()},{persist:true});}

  function mirrorSource(){
    const state=String($('masterInputState')?.dataset.state||'');
    busy=state==='INTERPRETING'||Boolean($('masterInputInterpret')?.disabled);
    send.disabled=busy;
    input.disabled=busy;
    if(!state||state==='IDLE'||state==='INTERPRETING')return;
    const text=textFromSource();
    if(!text)return;
    const actions=sourceActionLabels();
    const sourceFingerprint=fingerprintSource(state,text,actions);
    if(sourceFingerprint===lastFingerprint)return;
    lastFingerprint=sourceFingerprint;
    renderMessage({id:`a-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:'assistant',text,actions,sourceFingerprint,createdAt:new Date().toISOString()},{persist:true,proxySourceButtons:true});
  }

  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(busy)return;
    const text=input.value.trim();
    if(!text)return;
    appendUser(text);
    input.value='';
    const sourceInput=$('masterInputText');
    const sourceForm=$('masterInputForm');
    if(!sourceInput||!sourceForm){
      renderMessage({id:`a-${Date.now()}`,role:'assistant',text:'ส่งข้อความไม่ได้ในตอนนี้',createdAt:new Date().toISOString()},{persist:true});
      return;
    }
    sourceInput.value=text;
    sourceForm.requestSubmit();
    scrollLatest();
  });

  input.addEventListener('input',()=>{input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,136)}px`;});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});

  const observer=new MutationObserver(mirrorSource);
  observer.observe(master,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','disabled','data-state']});

  const viewport=globalThis.visualViewport;
  function syncViewport(){
    const height=Math.max(320,Math.round(viewport?.height||globalThis.innerHeight||0));
    document.documentElement.style.setProperty('--lh-viewport-height',`${height}px`);
    document.body?.style.setProperty('--lh-viewport-height',`${height}px`);
    scrollLatest();
  }
  viewport?.addEventListener('resize',syncViewport);
  viewport?.addEventListener('scroll',syncViewport);
  globalThis.addEventListener('resize',syncViewport);
  syncViewport();
  mirrorSource();
  scrollLatest();
  return true;
}
