"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flowPath = 'ui/go-client-flow.mjs';
const providerPath = 'master-input/go-client-interpreter-provider.mjs';
const appPath = 'ui/go-client.mjs';
const htmlPath = 'index.html';
const stylePath = 'go-client.css';

const flowReady = fs.existsSync(flowPath);

test('GO Client flow kernel exists inside the existing app', () => {
  assert.ok(flowReady, `missing ${flowPath}`);
});

if (flowReady) {
  test('package estimate follows published page thresholds and never invents page count', async () => {
    const { estimatePackage } = await import('../ui/go-client-flow.mjs');
    assert.deepEqual(estimatePackage({ pageCount:5 }), { package:'STARTER', priceBaht:490, pageCount:5, extraPages:0 });
    assert.deepEqual(estimatePackage({ pageCount:10 }), { package:'STANDARD', priceBaht:790, pageCount:10, extraPages:0 });
    assert.deepEqual(estimatePackage({ pageCount:20 }), { package:'BUSINESS', priceBaht:1390, pageCount:20, extraPages:0 });
    assert.deepEqual(estimatePackage({ pageCount:23 }), { package:'BUSINESS', priceBaht:1600, pageCount:23, extraPages:3 });
    assert.equal(estimatePackage({ pageCount:null }), null);
  });

  test('local sales router catches cheap obvious intents before API fallback', async () => {
    const { detectLocalIntent } = await import('../ui/go-client-flow.mjs');
    assert.equal(detectLocalIntent('ราคาเท่าไรครับ').intent, 'PRICE');
    assert.equal(detectLocalIntent('แก้งานได้กี่รอบ').intent, 'REVISION');
    assert.equal(detectLocalIntent('ขอให้ GO ช่วยดู').intent, 'HELP');
    assert.equal(detectLocalIntent('สนใจทำ Company Profile ครับ').intent, 'START');
    assert.equal(detectLocalIntent('ประโยคแปลกมากที่ยังไม่รู้จะพาไปไหน').intent, 'UNKNOWN');
  });

  test('checklists are fixed per supported job type with a general fallback', async () => {
    const { getChecklist } = await import('../ui/go-client-flow.mjs');
    const company = getChecklist('COMPANY_PROFILE');
    assert.equal(company.jobType, 'COMPANY_PROFILE');
    assert.ok(company.items.some(item => item.id === 'company_info' && item.required));
    assert.ok(company.items.some(item => item.id === 'logo_visuals'));

    const fallback = getChecklist('OTHER');
    assert.equal(fallback.jobType, 'OTHER');
    assert.ok(fallback.items.some(item => item.id === 'primary_content' && item.required));
  });

  test('filename/type mapping can satisfy multiple checklist items without reading file content', async () => {
    const { getChecklist, mapMaterialToChecklist } = await import('../ui/go-client-flow.mjs');
    const checklist = getChecklist('COMPANY_PROFILE');
    const result = mapMaterialToChecklist({ name:'company_services_contact.docx', type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, checklist);
    assert.ok(result.matchedItemIds.includes('company_info'));
    assert.ok(result.matchedItemIds.includes('services'));
    assert.ok(result.matchedItemIds.includes('contact'));
  });

  test('client complete-as-provided stops repeated asking but does not fake readiness', async () => {
    const { getChecklist, evaluateChecklist } = await import('../ui/go-client-flow.mjs');
    const checklist = getChecklist('PROPOSAL');
    const state = {
      receivedItemIds:new Set(['visuals']),
      clientConfirmedComplete:true,
    };
    const result = evaluateChecklist(checklist, state);
    assert.equal(result.completeAsProvided, true);
    assert.equal(result.ready, false);
    assert.ok(result.blockingMissing.length > 0);
    assert.equal(result.shouldAskForMissing, false);
  });

  test('manager packet is compact and keeps only operational context', async () => {
    const { buildManagerPacket } = await import('../ui/go-client-flow.mjs');
    const packet = buildManagerPacket({
      stage:'ESTIMATE',
      lastClientMessage:'พี่ครับ ราคานี้แรงไปนิด',
      jobType:'COMPANY_PROFILE',
      package:'STANDARD',
      estimate:{ priceBaht:790, pageCount:10, turnaroundDays:'4-5' },
      checklistSummary:{ received:4, waiting:1, verify:0 },
      recentMessages:Array.from({length:12}, (_,i)=>({role:i%2?'assistant':'user', text:`m${i}`})),
      giantInternalState:'SHOULD_NOT_LEAK',
    }, 'PRICE', 'CLIENT');
    assert.equal(packet.source, 'CLIENT');
    assert.equal(packet.reason, 'PRICE');
    assert.equal(packet.stage, 'ESTIMATE');
    assert.equal(packet.recentContext.length <= 4, true);
    assert.equal('giantInternalState' in packet, false);
  });
}

// Later tasks intentionally extend this file with API and same-app browser-surface contracts.
