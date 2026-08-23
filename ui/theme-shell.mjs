import { hydrateIcons } from './icons.mjs';

const DESTINATION_ICONS=Object.freeze({
  store:'shopping-cart-simple',
  ride:'person-simple-run',
  finance:'wallet',
});

function ensureThemeStylesheet(){
  if(document.querySelector('link[data-theme-authority="graphite-lime"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./theme.css';
  link.dataset.themeAuthority='graphite-lime';
  document.head.append(link);
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
  ensureThemeStylesheet();
  applyDestinationIcons();
  markSystemFacts();
}

applyGraphiteLimeTheme();
