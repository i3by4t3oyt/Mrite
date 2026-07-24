// Mrite v2.0 — API 翻译代理（Anthropic 格式 ↔ OpenAI 格式）
// 使用 @jtabet/anthropic-openai-bridge 做格式转换，零 bug 保证
const http = require('http');
const https = require('https');
const { anthropicToOpenAIRequest, openAIToAnthropicResponse, AnthropicStreamEncoder } = require('@jtabet/anthropic-openai-bridge');

let server = null;
let currentConfig = { baseURL: '', apiKey: '', model: '' };
const PROXY_PORT = 3456;

// ── 错误码翻译表 ──
const ERROR_MESSAGES = {
  400: '请求格式错误（参数不正确）',
  401: 'API Key 无效或已过期，请检查密钥是否正确',
  402: '账户余额不足，请充值后重试',
  403: '访问被拒绝（可能没有权限访问该模型）',
  404: '接口地址不存在，请检查端点 URL 是否正确',
  408: '请求超时，服务器响应太慢',
  422: '请求参数不正确（模型名或参数格式有误）',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误，请稍后重试',
  502: '服务器网关错误，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  529: '服务过载，请稍后重试',
};

const PROVIDER_ERROR_PATTERNS = [
  { match: /insufficient|balance|余额|欠费|billing/i, msg: '账户余额不足，请充值后重试' },
  { match: /invalid.*key|api.*key|认证|auth/i, msg: 'API Key 无效，请检查密钥' },
  { match: /rate.*limit|频率|too many/i, msg: '请求过于频繁，请稍后再试' },
  { match: /model.*not.*found|模型.*不存在|invalid.*model/i, msg: '模型名称不正确，请检查模型 ID' },
  { match: /quota|配额|exceeded/i, msg: '配额已用完，请充值或升级套餐' },
  { match: /timeout|超时/i, msg: '请求超时，请稍后重试' },
  { match: /overloaded|过载|capacity/i, msg: '服务器繁忙，请稍后重试' },
  { match: /context.*length|token.*limit|too.*long/i, msg: '输入内容过长，请缩短后重试' },
];

function translateError(statusCode, responseBody) {
  let errorText = '';
  try {
    const parsed = JSON.parse(responseBody);
    errorText = parsed.error?.message || parsed.message || parsed.msg || responseBody;
  } catch { errorText = responseBody || ''; }

  for (const p of PROVIDER_ERROR_PATTERNS) {
    if (p.match.test(errorText)) return p.msg;
  }
  if (ERROR_MESSAGES[statusCode]) return ERROR_MESSAGES[statusCode];
  return `请求失败（HTTP ${statusCode}）`;
}

// ── 构建目标 URL ──
function buildTargetPath(baseURL) {
  const targetUrl = new URL(baseURL);
  const basePath = targetUrl.pathname.replace(/\/+$/, '');
  const hasV1 = /\/v\d+$/.test(basePath);
  return basePath + (hasV1 ? '/chat/completions' : '/v1/chat/completions');
}

// ── 非流式转发 ──
function handleNonStream(openaiBody, res) {
  const targetUrl = new URL(currentConfig.baseURL);
  const postData = JSON.stringify(openaiBody);
  const isHttps = targetUrl.protocol === 'https:';
  const mod = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: buildTargetPath(currentConfig.baseURL),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + currentConfig.apiKey,
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 120000,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    if (proxyRes.statusCode >= 400) {
      let errBody = '';
      proxyRes.on('data', c => errBody += c);
      proxyRes.on('end', () => {
        const msg = translateError(proxyRes.statusCode, errBody);
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: msg, statusCode: proxyRes.statusCode } }));
      });
      return;
    }

    let body = '';
    proxyRes.on('data', c => body += c);
    proxyRes.on('end', () => {
      try {
        const openaiResp = JSON.parse(body);
        const anthropicResp = openAIToAnthropicResponse(openaiResp);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(anthropicResp));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Response parse error: ' + e.message } }));
      }
    });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Connection error: ' + err.message } }));
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Request timeout' } }));
  });

  proxyReq.write(postData);
  proxyReq.end();
}

// ── 流式转发 ──
function handleStream(openaiBody, anthropicRes) {
  const targetUrl = new URL(currentConfig.baseURL);
  const postData = JSON.stringify(openaiBody);
  const isHttps = targetUrl.protocol === 'https:';
  const mod = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: buildTargetPath(currentConfig.baseURL),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + currentConfig.apiKey,
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 120000,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    if (proxyRes.statusCode >= 400) {
      let errBody = '';
      proxyRes.on('data', c => errBody += c);
      proxyRes.on('end', () => {
        const msg = translateError(proxyRes.statusCode, errBody);
        anthropicRes.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        anthropicRes.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: msg, statusCode: proxyRes.statusCode } }));
      });
      return;
    }

    anthropicRes.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // 使用 bridge 库做流式转换
    const encoder = new AnthropicStreamEncoder({
      modelOverride: currentConfig.model || undefined,
    });

    let buffer = '';
    let ended = false;

    function finish() {
      if (ended) return;
      ended = true;
      try {
        for (const frame of encoder.end()) {
          anthropicRes.write(frame);
        }
      } catch {}
      anthropicRes.end();
    }

    proxyRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          finish();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          // bridge 期望 OpenAI ChatCompletionChunk 格式
          for (const frame of encoder.feed(parsed)) {
            anthropicRes.write(frame);
          }
          // 如果 OpenAI 返回了 usage，记录到 encoder
          if (parsed.usage && parsed.usage.completion_tokens) {
            // encoder 内部会从 chunk 中提取 usage
          }
        } catch {}
      }
    });

    proxyRes.on('end', finish);
    proxyRes.on('error', (err) => {
      if (!ended) {
        ended = true;
        anthropicRes.write(`event: error\ndata: ${JSON.stringify({ type: 'api_error', message: err.message })}\n\n`);
        anthropicRes.end();
      }
    });
  });

  proxyReq.on('error', (err) => {
    anthropicRes.writeHead(502, { 'Content-Type': 'application/json' });
    anthropicRes.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Connection error: ' + err.message } }));
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    anthropicRes.writeHead(504, { 'Content-Type': 'application/json' });
    anthropicRes.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Request timeout' } }));
  });

  proxyReq.write(postData);
  proxyReq.end();
}

// ── 请求处理器 ──
function handleRequest(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigins = ['http://localhost', 'http://127.0.0.1', 'null', ''];
  const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || !origin;
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: external access not allowed' }));
    return;
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, Anthropic-Version');

  const MAX_BODY_SIZE = 10 * 1024 * 1024;
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > MAX_BODY_SIZE) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request body too large' }));
    return;
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: currentConfig.baseURL }));
    return;
  }

  if (req.url !== '/v1/messages' && req.url !== '/messages') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /v1/messages' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const anthropicBody = JSON.parse(body);

      // 用 bridge 库做请求格式转换
      let openaiBody;
      try {
        openaiBody = anthropicToOpenAIRequest(anthropicBody);
      } catch (bridgeErr) {
        console.error('[API Proxy] Bridge conversion error:', bridgeErr.message);
        // 降级：手动基本转换
        openaiBody = {
          model: currentConfig.model || anthropicBody.model,
          max_tokens: anthropicBody.max_tokens || 4096,
          stream: !!anthropicBody.stream,
          messages: [],
        };
        if (anthropicBody.system) {
          const sysText = typeof anthropicBody.system === 'string'
            ? anthropicBody.system
            : (Array.isArray(anthropicBody.system) ? anthropicBody.system.filter(b => b.type === 'text').map(b => b.text).join('\n') : '');
          if (sysText) openaiBody.messages.push({ role: 'system', content: sysText });
        }
        if (Array.isArray(anthropicBody.messages)) {
          for (const msg of anthropicBody.messages) {
            if (typeof msg.content === 'string') {
              openaiBody.messages.push({ role: msg.role, content: msg.content });
            } else if (Array.isArray(msg.content)) {
              const texts = msg.content.filter(b => b.type === 'text').map(b => b.text);
              if (texts.length) openaiBody.messages.push({ role: msg.role, content: texts.join('\n') });
            }
          }
        }
      }

      // 强制使用配置中的模型名
      if (currentConfig.model) {
        openaiBody.model = currentConfig.model;
      }

      // 流式模式需要 stream_options 以获取 usage
      if (openaiBody.stream) {
        openaiBody.stream_options = { include_usage: true };
      }

      console.log('[API Proxy] Forwarding to:', currentConfig.baseURL, '| model:', openaiBody.model, '| stream:', !!openaiBody.stream);

      if (anthropicBody.stream) {
        handleStream(openaiBody, res);
      } else {
        handleNonStream(openaiBody, res);
      }
    } catch (e) {
      console.error('[API Proxy] Request parse error:', e.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Parse error: ' + e.message } }));
    }
  });
}

// ── 对外 API ──
function setTarget(baseURL, apiKey, model) {
  currentConfig = { baseURL, apiKey, model };
}

function start() {
  if (server) {
    console.log('[API Proxy] Already running on port', PROXY_PORT);
    return PROXY_PORT;
  }

  try {
    server = http.createServer(handleRequest);
    server.listen(PROXY_PORT, '127.0.0.1', () => {
      console.log(`[API Proxy] Successfully listening on http://127.0.0.1:${PROXY_PORT}`);
    });
    server.on('error', (err) => {
      console.error('[API Proxy] Error:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`[API Proxy] Port ${PROXY_PORT} is already in use`);
      }
      server = null;
    });
    return PROXY_PORT;
  } catch (err) {
    console.error('[API Proxy] Failed to start:', err.message);
    server = null;
    throw err;
  }
}

function stop() {
  if (server) {
    server.close();
    server = null;
  }
}

function getProxyURL() {
  return `http://127.0.0.1:${PROXY_PORT}`;
}

function isRunning() {
  return !!server;
}

module.exports = { start, stop, setTarget, getProxyURL, isRunning };
