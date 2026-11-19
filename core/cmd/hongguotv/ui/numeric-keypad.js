(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HongguoNumericKeypad = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function t(key, fallback, params) {
    var i18n = typeof window !== 'undefined' && window.HongguoI18n;
    if (i18n && i18n.t) return i18n.t(key, params, fallback);
    return String(fallback === undefined ? key : fallback).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, name) {
      return params && params[name] !== undefined && params[name] !== null ? String(params[name]) : '';
    });
  }
  function countryName(policy) {
    var i18n = typeof window !== 'undefined' && window.HongguoI18n;
    return policy && policy.localeKey && i18n && i18n.t ? i18n.t(policy.localeKey) : policy && (policy.name || policy.code) || '';
  }
  var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'done'];
  function create(options) {
    var active = false, kind = '', value = '', error = '', index = 0;
    var phonePolicy = { code: '+86', localeKey: 'country.mainlandChina', minLength: 11, maxLength: 11 };
    var episodePolicy = { minLength: 1, maxLength: 4 };
    function phoneValid(digits) {
      if (!phonePolicy || digits.length < phonePolicy.minLength || digits.length > phonePolicy.maxLength || !/^[0-9]+$/.test(digits)) return false;
      return phonePolicy.code !== '+86' || /^1[3-9][0-9]{9}$/.test(digits);
    }
    // Episode numbers are plain positive integers within a configurable width
    // (the caller passes the drama's total-episode digit count as maxLength).
    function episodeValid(digits) {
      if (!episodePolicy || !/^[0-9]+$/.test(digits)) return false;
      if (digits.length < episodePolicy.minLength || digits.length > episodePolicy.maxLength) return false;
      return Number(digits) >= 1;
    }
    function fieldLimit() {
      if (kind === 'phone') return phonePolicy ? phonePolicy.maxLength : 11;
      if (kind === 'episode') return episodePolicy ? episodePolicy.maxLength : 4;
      return 8;
    }
    function snapshot() { return { open: active, kind: kind, value: value, error: error, index: index,
      minLength: kind === 'phone' ? phonePolicy.minLength : kind === 'episode' ? episodePolicy.minLength : 4,
      maxLength: fieldLimit(),
      countryCode: kind === 'phone' ? phonePolicy.code : '', countryName: kind === 'phone' ? countryName(phonePolicy) : '' }; }
    function render() { if (options.render) options.render(snapshot()); }
    function open(field, initial, policy) {
      if (active || (field !== 'phone' && field !== 'code' && field !== 'episode')) return false;
      if (field === 'phone' && policy) phonePolicy = policy;
      if (field === 'episode' && policy) {
        var max = Number(policy.maxLength);
        episodePolicy = { minLength: 1, maxLength: max > 0 && isFinite(max) ? Math.max(1, Math.floor(max)) : 4 };
      } else if (field === 'episode') episodePolicy = { minLength: 1, maxLength: 4 };
      active = true; kind = field; value = String(initial || '').replace(/[^0-9]/g, '').slice(0, fieldLimit()); error = ''; index = 0;
      render(); return true;
    }
    function close(reason) {
      if (!active) return false;
      var result = { kind: kind, value: value, reason: reason || 'back' };
      active = false; kind = value = error = ''; index = 0; render();
      if (options.close) options.close(result);
      return true;
    }
    function choose(position) {
      if (!active || position < 0 || position >= keys.length) return;
      index = position; render();
    }
    function move(direction) {
      if (!active) return;
      var row = Math.floor(index / 3), column = index % 3;
      if (direction === 'left') column = Math.max(0, column - 1);
      if (direction === 'right') column = Math.min(2, column + 1);
      if (direction === 'up') row = Math.max(0, row - 1);
      if (direction === 'down') row = Math.min(3, row + 1);
      choose(row * 3 + column);
    }
    function press(key) {
      if (!active) return false;
      if (key === 'done') {
        var valid = kind === 'phone' ? phoneValid(value) : kind === 'episode' ? episodeValid(value) : /^[0-9]{4,8}$/.test(value);
        if (!valid) {
          if (kind === 'episode') error = t('content.episodeJumpInvalid', '请输入 1 至 {max} 之间的集数', { max: episodePolicy.maxLength });
          else error = kind === 'phone' ? t('content.phoneInvalid', '请输入正确的{country}手机号', { country: countryName(phonePolicy) }) : t('content.codeInvalid', '请输入4至8位验证码');
          render(); return true;
        }
        return close('complete');
      }
      if (key === 'delete') value = value.slice(0, -1);
      else if (/^[0-9]$/.test(key)) {
        if (value.length >= fieldLimit()) {
          if (kind === 'episode') error = t('content.episodeJumpMax', '集数最多 {max} 位', { max: episodePolicy.maxLength });
          else error = kind === 'phone' ? t('content.phoneMax', '手机号最多{count}位', { count: phonePolicy.maxLength }) : t('content.codeMax', '验证码最多8位');
          render(); return true;
        }
        value += key;
      } else return false;
      error = '';
      if (options.change) options.change(kind, value);
      render(); return true;
    }
    function handleKey(key, repeat) {
      if (!active) return false;
      var direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[key];
      if (direction) move(direction);
      else if (key === 'Enter') { if (!repeat) press(keys[index]); }
      else if (key === 'Escape') { if (!repeat) close('back'); }
      else if (key === 'Backspace' || key === 'Delete') press('delete');
      else if (/^[0-9]$/.test(key)) press(key);
      else if (key === 'Tab') choose((index + 1) % keys.length);
      // Other page shortcuts cannot escape this focus surface.
      return true;
    }
    function completeRemote(field, digits) {
      if (!active || field !== kind || typeof digits !== 'string') return false;
      var valid = kind === 'phone' ? phoneValid(digits) : kind === 'episode' ? episodeValid(digits) : /^[0-9]{4,8}$/.test(digits);
      if (!valid) return false;
      value = digits;
      if (options.change) options.change(kind, value);
      return close('complete');
    }
    return { open: open, close: close, move: move, choose: choose, press: press, handleKey: handleKey, completeRemote: completeRemote, snapshot: snapshot, isOpen: function () { return active; } };
  }
  return { create: create, keys: keys };
}));
