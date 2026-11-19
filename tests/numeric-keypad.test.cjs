const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../core/cmd/hongguotv/ui/numeric-keypad.js');
function fixture(){let changes=[],closes=[];return {changes,closes,pad:create({change:(kind,value)=>changes.push({kind,value}),close:r=>closes.push(r)})}}
test('three-column navigation retains its column and never wraps across edges',()=>{
  const {pad}=fixture();pad.open('phone','');pad.move('left');pad.move('up');assert.equal(pad.snapshot().index,0);
  pad.move('right');pad.move('right');pad.move('right');assert.equal(pad.snapshot().index,2);
  pad.move('down');pad.move('down');pad.move('down');pad.move('down');assert.equal(pad.snapshot().index,11);
  pad.move('up');assert.equal(pad.snapshot().index,8);pad.move('left');assert.equal(pad.snapshot().index,7);
});
test('phone digits are bounded and deletion can correct them before completion',()=>{
  const f=fixture();f.pad.open('phone','');
  for(const digit of '13800000000') f.pad.press(digit);
  f.pad.press('9');assert.equal(f.pad.snapshot().value,'13800000000');assert.ok(f.pad.snapshot().error);
  f.pad.press('delete');f.pad.press('1');f.pad.press('done');
  assert.deepEqual(f.closes,[{kind:'phone',value:'13800000001',reason:'complete'}]);assert.equal(f.pad.isOpen(),false);
});
test('phone policy changes length and validation for the selected region',()=>{
  const f=fixture(), hk={code:'+852',name:'中国香港',minLength:8,maxLength:8};
  f.pad.open('phone','',hk);
  for(const digit of '61234567') f.pad.press(digit);
  assert.equal(f.pad.snapshot().maxLength,8);assert.equal(f.pad.snapshot().countryCode,'+852');
  f.pad.press('8');assert.match(f.pad.snapshot().error,/最多8位/);
  f.pad.press('done');assert.deepEqual(f.closes,[{kind:'phone',value:'61234567',reason:'complete'}]);
});
test('invalid phone and too-short code keep the keyboard open without submitting',()=>{
  for(const [kind,value] of [['phone','123'],['phone','12800000000'],['code','012']]){
    const f=fixture();f.pad.open(kind,value);f.pad.press('done');assert.equal(f.pad.isOpen(),true);assert.ok(f.pad.snapshot().error);assert.equal(f.closes.length,0);
  }
});
test('code preserves leading zeros, permits 4 to 8 digits, and blocks overflow',()=>{
  for(const code of ['0123','012345','01234567']){
    const f=fixture();f.pad.open('code',code);if(code.length===8)f.pad.press('9');f.pad.press('done');assert.equal(f.closes[0].value,code);
  }
});
test('back preserves partial digits, clears keypad memory, and permits later re-entry',()=>{
  const f=fixture();f.pad.open('phone','138');f.pad.close('back');
  assert.equal(f.closes[0].value,'138');assert.equal(f.pad.snapshot().value,'');
  f.pad.open('phone',f.closes[0].value);assert.equal(f.pad.snapshot().value,'138');assert.equal(f.pad.snapshot().index,0);
});
test('context replacement and background close exactly once and do not complete the field',()=>{
  for(const reason of ['context','background','page']){
    const f=fixture();f.pad.open('code','012345');assert.equal(f.pad.open('phone','138'),false);
    f.pad.close(reason);f.pad.close('complete');assert.equal(f.closes.length,1);assert.equal(f.closes[0].reason,reason);
    assert.equal(f.pad.handleKey('1'),false);assert.equal(f.pad.press('1'),false);assert.equal(f.pad.snapshot().value,'');
  }
});
test('episode accepts 1..N digit numbers within the caller-supplied width',()=>{
  const f=fixture();assert.equal(f.pad.open('episode','',{maxLength:3}),true);
  assert.equal(f.pad.snapshot().minLength,1);assert.equal(f.pad.snapshot().maxLength,3);
  for(const digit of '200') f.pad.press(digit);
  f.pad.press('done');assert.deepEqual(f.closes,[{kind:'episode',value:'200',reason:'complete'}]);
});
test('episode keeps short numbers like 5 valid without padding to four digits',()=>{
  const f=fixture();f.pad.open('episode','',{maxLength:3});
  f.pad.press('5');f.pad.press('done');
  assert.deepEqual(f.closes,[{kind:'episode',value:'5',reason:'complete'}]);
});
test('episode rejects zero and empty input while keeping the keypad open',()=>{
  for(const value of ['0','']){
    const f=fixture();f.pad.open('episode',value,{maxLength:3});f.pad.press('done');
    assert.equal(f.pad.isOpen(),true);assert.ok(f.pad.snapshot().error);assert.equal(f.closes.length,0);
  }
});
test('episode blocks overflow past the total-episode width',()=>{
  const f=fixture();f.pad.open('episode','',{maxLength:2});
  f.pad.press('1');f.pad.press('2');f.pad.press('3');
  assert.equal(f.pad.snapshot().value,'12');assert.match(f.pad.snapshot().error,/最多 2 位/);
});
test('episode completeRemote validates the same range as the done key',()=>{
  const f=fixture();f.pad.open('episode','',{maxLength:3});
  assert.equal(f.pad.completeRemote('episode','0'),false);
  assert.equal(f.pad.completeRemote('episode','1234'),false);
  assert.equal(f.pad.completeRemote('episode','88'),true);
  assert.deepEqual(f.closes,[{kind:'episode',value:'88',reason:'complete'}]);
});
test('episode changes never leak into the account change callback',()=>{
  const f=fixture();f.pad.open('episode','',{maxLength:3});f.pad.press('7');
  assert.deepEqual(f.changes,[{kind:'episode',value:'7'}]);
});
