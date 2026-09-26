"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next', 'ride-map-native.mjs')).href;

test('Ride map native bridge is unavailable on web without inventing a fallback map', async () => {
  const { resolveRideMapPlugin, readRideMapNativeStatus } = await import(moduleUrl);
  const capacitor = { isNativePlatform:()=>false, registerPlugin(){ throw new Error('should not register'); } };
  assert.equal(resolveRideMapPlugin(capacitor), null);
  assert.deepEqual(await readRideMapNativeStatus({ capacitor }), { available:false, packageState:'UNAVAILABLE' });
});

test('Ride map bridge forwards only current Ride job geography to native plugin', async () => {
  const { openRideMap } = await import(moduleUrl);
  const calls = [];
  const plugin = { async openMap(value) { calls.push(value); return { status:'OPENED' }; } };
  const capacitor = {
    isNativePlatform:()=>true,
    isPluginAvailable:name=>name==='LighthouseRideMap',
    Plugins:{ LighthouseRideMap:plugin },
  };
  const result = await openRideMap({
    capacitor,
    job:{
      recordId:'J-1',
      pickup:{lat:'13.8732',lng:'100.5961',label:'รับ',address:'บางเขน'},
      dropoff:{lat:13.7563,lng:100.5018,label:'ส่ง'},
    },
  });
  assert.equal(result.status, 'OPENED');
  assert.deepEqual(calls, [{
    jobId:'J-1',
    pickup:{lat:13.8732,lng:100.5961,label:'รับ',address:'บางเขน'},
    dropoff:{lat:13.7563,lng:100.5018,label:'ส่ง'},
  }]);
});

test('Ride map bridge opens local map without job geography so rider can use current location', async () => {
  const { openRideMap } = await import(moduleUrl);
  const calls = [];
  const capacitor = {
    isNativePlatform:()=>true,
    isPluginAvailable:()=>true,
    Plugins:{ LighthouseRideMap:{ async openMap(value){ calls.push(value); return {status:'OPENED'}; } } },
  };
  const result = await openRideMap({ capacitor, job:{recordId:'OLD'} });
  assert.equal(result.status, 'OPENED');
  assert.deepEqual(calls, [{jobId:'OLD',pickup:null,dropoff:null}]);
});


test('Ride navigation handoff sends only validated owner coordinates to native intent bridge', async () => {
  const { openRideNavigation } = await import(moduleUrl);
  const calls = [];
  const capacitor = {
    isNativePlatform:()=>true,
    isPluginAvailable:()=>true,
    Plugins:{ LighthouseRideMap:{ async navigate(value){ calls.push(value); return {status:'OPENED'}; } } },
  };
  const result = await openRideNavigation({ capacitor, destination:{lat:'13.87',lng:'100.59',label:'รับ'} });
  assert.equal(result.status, 'OPENED');
  assert.deepEqual(calls, [{destination:{lat:13.87,lng:100.59,label:'รับ'}}]);
});
