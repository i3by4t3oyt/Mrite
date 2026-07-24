// Mrite v2.0 — API 配置
const path = require('path');
const fs = require('fs');
const os = require('os');

function loadApiConfig() {
  const config = {
    baseURL: process.env.ANTHROPIC_BASE_URL || '',
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || '',
  };
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const env = settings.env || {};
      if (!config.apiKey && env.ANTHROPIC_AUTH_TOKEN) config.apiKey = env.ANTHROPIC_AUTH_TOKEN;
      if (!config.model && env.ANTHROPIC_MODEL) config.model = env.ANTHROPIC_MODEL;
      if (!config.baseURL && env.ANTHROPIC_BASE_URL) {
        config.baseURL = env.ANTHROPIC_BASE_URL;
      }
    }
  } catch {}
  return config;
}

module.exports = { loadApiConfig };
