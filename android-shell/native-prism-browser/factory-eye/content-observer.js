// Vendored from Ergasterion-factory 8440e37741b72802df4138b7eca14791a1c65d10; canonical Factory Eye authority remains there.
(() => {
  const CONTENT_SCRIPT_VERSION = '0.4.0';
  const PAGE_SCHEMA = 'ERGASTERION_BROWSER_PAGE_SUMMARY_V2';
  const MAX_SECTIONS = 24;
  const MAX_TEXT_BLOCKS = 32;
  const MAX_LISTS = 16;
  const MAX_LIST_ITEMS = 20;
  const MAX_TABLES = 12;
  const MAX_TABLE_ROWS = 12;
  const MAX_TABLE_CELLS = 8;
  const MAX_IMAGES = 24;
  const MAX_STATES = 40;
  const SECRET_TEXT = [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/,
    /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
    /\b(?:api|access|refresh|secret)[-_ ]?(?:key|token)\s*[:=]\s*[^\s]{8,}/i,
    /\b(?:otp|one[- ]?time|verification|password|passcode)\s*[:=]\s*[^\s]{2,}/i,
    /\b(?:\d[ -]?){13,19}\b/,
  ];

  const clean = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const textFrom = (element, max = 240) => clean(element?.innerText || element?.textContent, max);
  const tagName = (element) => String(element?.tagName || '').toLowerCase();

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function privateContext(element) {
    return Boolean(element?.closest?.('form,input,textarea,select,[role="textbox"],[contenteditable="true"],[contenteditable="plaintext-only"]'));
  }

  function containsPrivateControl(element) {
    return Boolean(element?.querySelector?.('input,textarea,select,[role="textbox"],[contenteditable="true"],[contenteditable="plaintext-only"]'));
  }

  function safeVisible(element) {
    return visible(element) && !privateContext(element);
  }

  function safeText(element, max = 240) {
    if (!element || privateContext(element) || containsPrivateControl(element)) return null;
    const text = textFrom(element, max);
    if (!text || SECRET_TEXT.some((pattern) => pattern.test(text))) return null;
    return text;
  }

  function safeMetadata(value, max = 240) {
    const text = clean(value, max);
    return text && !SECRET_TEXT.some((pattern) => pattern.test(text)) ? text : null;
  }

  function labelFor(element) {
    const aria = clean(element.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = clean(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const value = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .map((item) => clean(item))
        .filter(Boolean)
        .join(' ');
      if (value) return clean(value);
    }
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return clean(label.textContent);
    }
    const wrapping = element.closest('label');
    if (wrapping) return clean(wrapping.textContent);
    return clean(element.getAttribute('placeholder') || element.getAttribute('name') || '');
  }

  function safeHref(anchor) {
    const raw = anchor?.href || '';
    try {
      const url = new URL(raw, location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      url.username = '';
      url.password = '';
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/password|passcode|otp|token|secret|key|auth|code|card|cvv/i.test(key)) url.searchParams.delete(key);
      }
      return url.href.slice(0, 800);
    } catch {
      return null;
    }
  }

  function collectHeadings(limit = 24) {
    return [...document.querySelectorAll('h1,h2,h3')]
      .filter(safeVisible)
      .map((element) => ({
        level: Number(element.tagName.slice(1)),
        text: safeText(element, 320),
      }))
      .filter((item) => item.text)
      .slice(0, limit);
  }

  function readState(element) {
    const state = {};
    const selected = element.getAttribute('aria-selected');
    const expanded = element.getAttribute('aria-expanded');
    const pressed = element.getAttribute('aria-pressed');
    const current = element.getAttribute('aria-current');
    if (selected !== null) state.selected = selected === 'true';
    if (expanded !== null) state.expanded = expanded === 'true';
    if (pressed !== null) state.pressed = pressed === 'true';
    if (current !== null && current !== 'false') state.active = current === 'true' ? true : clean(current, 80);
    return Object.keys(state).length ? state : null;
  }

  function collectButtons(limit = 30) {
    return [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]
      .filter(safeVisible)
      .map((element) => ({
        label: safeMetadata(element.innerText || element.textContent || labelFor(element), 220),
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        state: readState(element),
      }))
      .filter((item) => item.label)
      .slice(0, limit);
  }

  function collectLinks(limit = 40) {
    return [...document.querySelectorAll('a[href]')]
      .filter(safeVisible)
      .map((anchor) => ({
        label: safeMetadata(anchor.innerText || anchor.textContent, 220),
        href: safeHref(anchor),
      }))
      .filter((item) => item.label || item.href)
      .slice(0, limit);
  }

  function collectFields(limit = 40) {
    return [...document.querySelectorAll('input,textarea,select,[contenteditable="true"]')]
      .filter(visible)
      .map((element) => {
        const tag = tagName(element);
        const type = tag === 'input' ? clean(element.getAttribute('type') || 'text', 60).toLowerCase() : tag;
        const sensitive = ['password'].includes(type) ||
          /password|passcode|otp|one[- ]?time|verification code|cvv|cvc|card number/i.test(
            [labelFor(element), element.getAttribute('name'), element.getAttribute('autocomplete')].filter(Boolean).join(' ')
          );
        return {
          tag,
          type,
          name: clean(element.getAttribute('name'), 140) || null,
          label: clean(labelFor(element), 220) || null,
          placeholder: sensitive ? null : clean(element.getAttribute('placeholder'), 220) || null,
          disabled: Boolean(element.disabled),
          readOnly: Boolean(element.readOnly),
          sensitive,
        };
      })
      .slice(0, limit);
  }

  function collectLandmarks(limit = 20) {
    return [...document.querySelectorAll('main,nav,header,footer,aside,[role="main"],[role="navigation"],[role="dialog"]')]
      .filter(safeVisible)
      .map((element) => ({
        role: clean(element.getAttribute('role') || tagName(element), 80),
        label: safeMetadata(element.getAttribute('aria-label') || element.getAttribute('title'), 220),
      }))
      .slice(0, limit);
  }

  function semanticSectionElements() {
    return [...document.querySelectorAll('main,article,section,aside,nav,header,footer,[role="region"],[role="group"],[role="tabpanel"]')]
      .filter(safeVisible)
      .slice(0, MAX_SECTIONS);
  }

  function sectionFor(element, sections) {
    let current = element;
    while (current) {
      const match = sections.find((section) => section.element === current);
      if (match) return match.id;
      current = current.parentElement;
    }
    return null;
  }

  function collectSections(sections) {
    return sections.map((section, index) => {
      const heading = section.element.querySelector('h1,h2,h3,h4');
      return {
        id: `section-${index + 1}`,
        role: clean(section.element.getAttribute('role') || tagName(section.element), 80),
        label: safeMetadata(section.element.getAttribute('aria-label') || section.element.getAttribute('title'), 220),
        heading: safeText(heading, 240),
        parentSectionId: sectionFor(section.element.parentElement, sections),
      };
    });
  }

  function collectTextBlocks(sections) {
    return [...document.querySelectorAll('p,blockquote,dt,dd,[role="paragraph"]')]
      .filter(safeVisible)
      .map((element, index) => ({
        id: `text-${index + 1}`,
        text: safeText(element, 320),
        sectionId: sectionFor(element, sections),
      }))
      .filter((item) => item.text)
      .slice(0, MAX_TEXT_BLOCKS);
  }

  function collectLists(sections) {
    return [...document.querySelectorAll('ol,ul')]
      .filter(safeVisible)
      .slice(0, MAX_LISTS)
      .map((element, index) => {
        const items = [...element.querySelectorAll('li')]
          .filter((item) => item.parentElement === element && safeVisible(item))
          .map((item) => safeText(item, 240))
          .filter(Boolean)
          .slice(0, MAX_LIST_ITEMS);
        return {
          id: `list-${index + 1}`,
          ordered: tagName(element) === 'ol',
          items,
          sectionId: sectionFor(element, sections),
        };
      })
      .filter((item) => item.items.length);
  }

  function collectTables(sections) {
    return [...document.querySelectorAll('table')]
      .filter((table) => safeVisible(table) && !containsPrivateControl(table))
      .slice(0, MAX_TABLES)
      .map((table, index) => {
        const caption = safeText(table.querySelector('caption'), 220);
        const rows = [...table.querySelectorAll('tr')]
          .slice(0, MAX_TABLE_ROWS)
          .map((row) => [...row.querySelectorAll('th,td')]
            .filter((cell) => cell.parentElement === row)
            .map((cell) => safeText(cell, 180))
            .filter((cell) => cell !== null)
            .slice(0, MAX_TABLE_CELLS))
          .filter((row) => row.length);
        return {
          id: `table-${index + 1}`,
          caption,
          rows,
          sectionId: sectionFor(table, sections),
        };
      })
      .filter((item) => item.rows.length);
  }

  function collectImages(sections) {
    return [...document.querySelectorAll('img')]
      .filter(safeVisible)
      .slice(0, MAX_IMAGES)
      .map((image) => {
        const figure = image.closest('figure');
        const rawAlt = clean(image.getAttribute('alt'), 240);
        const alt = safeMetadata(rawAlt, 240);
        return {
          alt,
          caption: safeText(figure?.querySelector('figcaption'), 240),
          context: safeMetadata(image.getAttribute('title') || image.getAttribute('role'), 160),
          decorative: rawAlt === '' || ['presentation', 'none'].includes(image.getAttribute('role')),
          sectionId: sectionFor(image, sections),
        };
      });
  }

  function collectStates(sections, limit = MAX_STATES) {
    const seen = new Set();
    const elements = [...document.querySelectorAll('[aria-selected],[aria-expanded],[aria-current],[aria-pressed]')]
      .filter(safeVisible)
      .filter((element) => {
        if (seen.has(element)) return false;
        seen.add(element);
        return true;
      });
    return elements.map((element) => ({
      role: clean(element.getAttribute('role') || tagName(element), 80),
      label: safeMetadata(element.innerText || element.textContent || labelFor(element), 220),
      state: readState(element),
      sectionId: sectionFor(element, sections),
    })).filter((item) => item.state).slice(0, limit);
  }

  function digest(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `GEN-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function semanticDiff(previous, current) {
    if (!previous) return null;
    const oldText = (previous.textBlocks || []).map((item) => item.text).filter(Boolean);
    const newText = (current.textBlocks || []).map((item) => item.text).filter(Boolean);
    const changed = [];
    for (let index = 0; index < Math.min(oldText.length, newText.length); index += 1) {
      if (oldText[index] !== newText[index]) changed.push({ from: oldText[index].slice(0, 160), to: newText[index].slice(0, 160) });
    }
    const added = newText.filter((item) => !oldText.includes(item)).slice(0, 8).map((text) => text.slice(0, 160));
    const removed = oldText.filter((item) => !newText.includes(item)).slice(0, 8).map((text) => text.slice(0, 160));
    const sectionSignature = (item) => JSON.stringify([item.role, item.label, item.heading, item.parentSectionId]);
    const oldSections = (previous.sections || []).map(sectionSignature);
    const newSections = (current.sections || []).map(sectionSignature);
    const sectionsAppeared = newSections.filter((item) => !oldSections.includes(item)).slice(0, 8);
    const sectionsDisappeared = oldSections.filter((item) => !newSections.includes(item)).slice(0, 8);
    const stateChanged = JSON.stringify(previous.states || []) !== JSON.stringify(current.states || []);
    const structureSignature = (page) => JSON.stringify({
      sections: (page.sections || []).map((item) => [item.role, item.label, item.heading, item.parentSectionId]),
      lists: (page.lists || []).map((item) => [item.ordered, item.items.length]),
      tables: (page.tables || []).map((item) => item.rows.map((row) => row.length)),
      images: (page.images || []).map((item) => [item.decorative, Boolean(item.alt), Boolean(item.caption)]),
    });
    const structuralChanged = structureSignature(previous) !== structureSignature(current);
    return {
      fromGeneration: previous.contentGeneration,
      toGeneration: current.contentGeneration,
      changed: Boolean(added.length || removed.length || changed.length || sectionsAppeared.length || sectionsDisappeared.length || stateChanged || structuralChanged || previous.url !== current.url || previous.title !== current.title),
      textBlocks: { added, removed, changed: changed.slice(0, 8) },
      sections: { appeared: sectionsAppeared, disappeared: sectionsDisappeared },
      stateChanged,
      urlChanged: previous.url !== current.url,
      titleChanged: previous.title !== current.title,
      meaningfulStructuralChange: structuralChanged || sectionsAppeared.length > 0 || sectionsDisappeared.length > 0,
    };
  }

  let previousPage = null;

  function pageSummary() {
    const description = document.querySelector('meta[name="description"]')?.content || '';
    const sections = semanticSectionElements().map((element, index) => ({ element, id: `section-${index + 1}` }));
    const page = {
      schema: PAGE_SCHEMA,
      url: location.href,
      title: document.title || '',
      readyState: document.readyState,
      language: document.documentElement.lang || null,
      description: safeMetadata(description, 500),
      headings: collectHeadings(),
      buttons: collectButtons(),
      links: collectLinks(),
      fields: collectFields(),
      landmarks: collectLandmarks(),
      sections: collectSections(sections),
      textBlocks: collectTextBlocks(sections),
      lists: collectLists(sections),
      tables: collectTables(sections),
      images: collectImages(sections),
      states: collectStates(sections),
      capturedAt: new Date().toISOString(),
      observerVersion: CONTENT_SCRIPT_VERSION,
      visibilityState: document.visibilityState,
      documentFocused: document.hasFocus(),
      capturesInputValues: false,
      createsAuthority: false,
    };
    page.contentGeneration = digest(JSON.stringify({
      url: page.url,
      title: page.title,
      headings: page.headings,
      buttons: page.buttons,
      links: page.links,
      sections: page.sections,
      textBlocks: page.textBlocks,
      lists: page.lists,
      tables: page.tables,
      images: page.images,
      states: page.states,
    }));
    page.semanticDiff = semanticDiff(previousPage, page);
    previousPage = page;
    return page;
  }

  if (globalThis.__ERGASTERION_FACTORY_EYE_TEST__ === true) {
    globalThis.__ERGASTERION_FACTORY_EYE_PAGE_SUMMARY_TEST__ = pageSummary;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'ERGASTERION_OBSERVE_PAGE') return undefined;
    try {
      return Promise.resolve({ ok: true, page: pageSummary() });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: error?.message || 'PAGE_SUMMARY_FAILED',
      });
    }
  });

  const CONTENT_PULSE_MS = 8000;
  let pulseBusy = false;
  let lastPulseAt = 0;

  async function sendVisiblePulse(reason, { force = false } = {}) {
    if (pulseBusy || document.visibilityState !== 'visible') return;
    if (!['http:', 'https:'].includes(location.protocol)) return;

    const now = Date.now();
    if (!force && now - lastPulseAt < 2500) return;

    pulseBusy = true;
    lastPulseAt = now;
    try {
      await browser.runtime.sendMessage({
        type: 'ERGASTERION_FACTORY_EYE_CONTENT_PULSE',
        reason,
        contentScriptVersion: CONTENT_SCRIPT_VERSION,
        visible: true,
        focused: document.hasFocus(),
        page: pageSummary(),
      });
    } catch {
      // Background/event-page availability is best-effort; the next pulse retries.
    } finally {
      pulseBusy = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void sendVisiblePulse('visibilitychange', { force: true });
    }
  });

  window.addEventListener('pageshow', () => {
    void sendVisiblePulse('pageshow', { force: true });
  });

  window.addEventListener('focus', () => {
    void sendVisiblePulse('focus');
  });

  setInterval(() => {
    void sendVisiblePulse('foreground-keepalive');
  }, CONTENT_PULSE_MS);

  setTimeout(() => {
    void sendVisiblePulse('content-ready', { force: true });
  }, 250);
})();
