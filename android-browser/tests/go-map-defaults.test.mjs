import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = name => readFileSync(new URL(`../app/src/main/java/com/big/gobrowser/outsideview/${name}.kt`, import.meta.url), 'utf8');

test('map reload preserves existing online default and forwards explicit mode to style factory', () => {
  const renderer = source('MapLibreOutsideRenderer');
  assert.match(renderer, /fun reloadStyle\(online:Boolean=true\)/);
  assert.match(renderer, /MapStyleFactory\.style\(packageStore\?\.active\(\),online\)/);
});

test('foreground location retains GPS and network provider fallback filtered by availability', () => {
  assert.match(source('ForegroundLocationController'), /listOf\(LocationManager\.GPS_PROVIDER,LocationManager\.NETWORK_PROVIDER\)\.filter \{manager\.isProviderEnabled\(it\)\}/);
});

test('GPS recenter requires an explicit confirmation before changing online viewport', () => {
  const activity = source('OutsideViewActivity');
  assert.match(activity, /location\.onCenter=\{point->[\s\S]*?AlertDialog\.Builder/);
  assert.match(activity, /setNegativeButton\("ยกเลิก",null\)/);
  assert.match(activity, /setPositiveButton\("เลื่อนไปตำแหน่งฉัน"\)\{_,_->[\s\S]*?else if\(!renderer\.centerOnLocation\(point\)\)/);
});

test('GeoJSON transaction runs on existing worker before main-thread presentation', () => {
  const activity=source('OutsideViewActivity');
  const start=activity.indexOf('private fun importGeoJson(');
  const end=activity.indexOf('private fun exportGeoJson(',start);
  const flow=activity.slice(start,end);
  assert.ok(flow.indexOf('importing=true;busy=true') < flow.indexOf('worker.execute'));
  assert.ok(flow.indexOf('worker.execute') < flow.indexOf('store.receiveFile(batch,correlation)'));
  assert.ok(flow.indexOf('store.receiveFile(batch,correlation)') < flow.indexOf('handler.post'));
  assert.ok(flow.indexOf('handler.post') < flow.indexOf('GeoJsonImport.present'));
  assert.doesNotMatch(flow,/store\.load\(/);
  assert.match(activity,/if\(storageUnavailable\|\|importing\|\|busy\|\|commands\.isEmpty\(\)/);
  assert.match(activity,/renderer\.onReady=ready@\{\s*if\(destroyed \|\| importing\)return@ready/);
});


test('Activity recreation uses shared journal transaction and lets accepted work finish safely', () => {
  const activity=source('OutsideViewActivity');
  assert.match(activity,/store\.prepareScreen\(\)/);
  assert.doesNotMatch(activity,/synchronized\(store\)/);
  assert.match(activity,/@Volatile private var destroyed=false/);
  assert.match(activity,/handler\.post \{\s*if\(destroyed\)return@post/);
  assert.match(activity,/worker\.shutdown\(\)/);
  assert.doesNotMatch(activity,/worker\.shutdownNow\(\)/);
});

test('GOVIEW export uses Android document creation and field verification requires owner checkbox', () => {
  const activity=source('OutsideViewActivity');
  assert.match(activity,/Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(activity,/store\.selectedSnapshot\(/);
  assert.match(activity,/CheckBox\(this\)/);
  assert.match(activity,/store\.editOwnerPin\(id,name,point,confirmed,journal\.state\.revision,group\)/);
  assert.match(activity,/showUpdateReceipts\(\)/);
});

test('field confirmation starts unchecked and coordinates invalidate the current explicit confirmation', () => {
  const activity=source('OutsideViewActivity');
  assert.match(activity,/CheckBox\(this\).*isChecked=false/);
  assert.doesNotMatch(activity,/isChecked=pin\.evidence\.source/);
  assert.match(activity,/onTextChanged[^\n]*field\.isChecked=false/);
  assert.match(activity,/longitude\.addTextChangedListener\(changed\);latitude\.addTextChangedListener\(changed\)/);
});


test('map exchange requires selection and preview approval, with guarded storage reads', () => {
 const activity=source('OutsideViewActivity');
 assert.match(activity,/BooleanArray\(pins.size\)/);
 assert.match(activity,/store\.previewUpdate\(batch,correlation\)/);
 assert.match(activity,/setPositiveButton\("อนุมัติ Update"\)/);
 assert.match(activity,/store\.approveUpdate\(preview\)/);
 assert.doesNotMatch(activity,/mapShare\.captureOnce\(/);
 assert.equal((activity.match(/store\.load\(/g)||[]).length,1);
 assert.match(activity,/private fun readJournal\(\).*catch\(error:Exception\)\{storageFailure\(\);null\}/);
});
