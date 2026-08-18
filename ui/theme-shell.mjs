import { hydrateIcons } from './icons.mjs';

const DESTINATION_ICONS=Object.freeze({
  home:'house-simple',
  store:'shopping-cart-simple',
  ride:'person-simple-run',
  finance:'wallet',
  calendar:'calendar-dots',
});

function ensureThemeStylesheet(){
  if(document.querySelector('link[data-theme-authority="graphite-lime"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./theme.css';
  link.dataset.themeAuthority='graphite-lime';
  document.head.append(link);
}

function applyBrandMark(){
  const appbar=document.querySelector('.appbar>div');
  if(!appbar||appbar.classList.contains('brand-lockup'))return;
  appbar.classList.add('brand-lockup');
  const mark=document.createElement('span');
  mark.className='brand-mark';
  mark.setAttribute('aria-hidden','true');
  mark.append(document.createElement('i'),document.createElement('i'),document.createElement('i'));
  appbar.prepend(mark);
}

function applyDestinationIcons(){
  for(const button of document.querySelectorAll('.bottom-nav-btn[data-destination]')){
    const iconName=DESTINATION_ICONS[button.dataset.destination];
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
  applyBrandMark();
  applyDestinationIcons();
  markSystemFacts();
}

applyGraphiteLimeTheme();
