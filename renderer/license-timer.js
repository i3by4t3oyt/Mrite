// Mrite v2.0 — 许可证计时系统（基于到期时间戳，自然时间倒计时）
// 核心原理：激活时从服务器获取 expiresAt，本地只判断 Date.now() > expiresAt
window.Mrite = window.Mrite || {};

(function() {
  var LS_KEY = 'mrite-license-expiry';
  var CHECK_INTERVAL = 60000; // 每60秒检查一次

  var _timer = null;
  var _expiresAt = 0;       // 到期时间戳（毫秒）
  var _isExpired = false;
  var _onExpire = null;

  // ── 持久化 ──
  function save(expiresAt) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ expiresAt: expiresAt || _expiresAt }));
    } catch(e) {}
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  // ── 检查是否过期 ──
  function checkExpired() {
    if (_expiresAt <= 0) return _isExpired;
    if (Date.now() >= _expiresAt && !_isExpired) {
      _isExpired = true;
      if (_onExpire) _onExpire();
      return true;
    }
    return _isExpired;
  }

  // ── 剩余时间 ──
  function getRemainingMs() {
    if (_expiresAt <= 0) return 0;
    return Math.max(0, _expiresAt - Date.now());
  }

  function fmtRemaining(ms) {
    if (ms <= 0) return '已过期';
    var sec = Math.floor(ms / 1000);
    var min = Math.floor(sec / 60);
    var hr = Math.floor(min / 60);
    var day = Math.floor(hr / 24);
    if (day > 0) return day + '天' + (hr % 24) + '时';
    if (hr > 0) return hr + '时' + (min % 60) + '分';
    return min + '分' + (sec % 60) + '秒';
  }

  // ── 定时检查 ──
  function startCheck() {
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function() {
      checkExpired();
    }, CHECK_INTERVAL);
  }

  // ── 对外API ──
  Mrite._licenseTimer = {
    /**
     * 初始化许可证计时器
     * @param {number} expiresAt - 到期时间戳（毫秒），来自服务器
     * @param {function} onExpire - 过期时的回调
     */
    init: function(expiresAt, onExpire) {
      // 计时器已禁用
    },

    getRemainingMs: function() {
      return getRemainingMs();
    },

    getRemainingText: function() {
      return fmtRemaining(getRemainingMs());
    },

    isExpired: function() {
      return false;
    },

    getExpiresAt: function() {
      return _expiresAt;
    },

    destroy: function() {
      if (_timer) { clearInterval(_timer); _timer = null; }
    }
  };

  // 每次打开应用，从 localStorage 恢复并立即检查
  var saved = load();
  if (saved && saved.expiresAt) {
    _expiresAt = saved.expiresAt;
    if (Date.now() >= _expiresAt) {
      _isExpired = true;
    } else {
      startCheck();
    }
  }
})();
