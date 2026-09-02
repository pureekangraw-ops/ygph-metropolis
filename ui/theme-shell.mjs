import { hydrateIcons } from './icons.mjs';

const DESTINATION_ICONS=Object.freeze({
  store:'shopping-cart-simple',
  ride:'person-simple-run',
  finance:'wallet',
});

function ensureStylesheet({ marker, href }){
  if(document.querySelector(`link[data-theme-authority="${marker}"]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.dataset.themeAuthority=marker;
  document.head.append(link);
}

function ensureThemeStylesheets(){
  ensureStylesheet({ marker:'graphite-lime', href:'./theme.css' });
  ensureStylesheet({ marker:'compact-mobile', href:'./compact-ui.css' });
  ensureStylesheet({ marker:'settings-utility', href:'./styles/settings-utility.css' });
}

function applyDestinationIcons(){
  for(const button of document.querySelectorAll('.command-nav-btn[data-command-destination]')){
    const iconName=DESTINATION_ICONS[button.dataset.commandDestination];
    const svg=button.querySelector('svg[data-icon]');
    if(!iconName||!svg)continue;
    svg.dataset.icon=iconName;
    svg.replaceChildren();
  }
  hydrateIcons(document);
}

function markSystemFacts(){
  document.getElementById('systemVersion')?.parentElement?.classList.add('system-facts');
}

export function applyGraphiteLimeTheme(){
  ensureThemeStylesheets();
  applyDestinationIcons();
  markSystemFacts();
}

applyGraphiteLimeTheme();
void import('./lighthouse-shell.mjs');
