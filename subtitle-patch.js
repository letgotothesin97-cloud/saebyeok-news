'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const SITE = (process.env.SITE_URL || 'https://saebyeok-news.onrender.com').replace(/\/$/, '');
const SOCIAL_PATH = '/kakao-preview-20260827-v3.png';
console.log('[site-patch] loaded: subtitles + hardened Kakao social preview');

const originalCreateServer = http.createServer;
const originalEnd = http.ServerResponse.prototype.end;

http.createServer = function patchedCreateServer(...args) {
  const listenerIndex = args.findIndex(v => typeof v === 'function');
  if (listenerIndex >= 0) {
    const listener = args[listenerIndex];
    args[listenerIndex] = function wrappedListener(req, res) {
      res.__sbRequestPath = req.url || '/';
      const pathname = String(req.url || '').split('?')[0];
      if (pathname === SOCIAL_PATH || pathname === '/social-card.png') {
        const file = path.join(process.cwd(), 'social-card.png');
        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(404, {'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
            return res.end('Not found');
          }
          res.writeHead(200, {
            'content-type':'image/png',
            'content-length':data.length,
            'cache-control':'public, max-age=31536000, immutable',
            'x-content-type-options':'nosniff',
            'access-control-allow-origin':'*'
          });
          if (req.method === 'HEAD') return res.end();
          return res.end(data);
        });
        return;
      }
      return listener(req, res);
    };
  }
  return originalCreateServer.apply(http, args);
};

function patchEditor(html) {
  html = html.replace(/<input\b([^>]*\bname="subtitle"[^>]*)>/gi, (full, attrs) => {
    const valueMatch = attrs.match(/\bvalue="([^"]*)"/i);
    const value = valueMatch ? valueMatch[1] : '';
    return `<textarea name="subtitle" class="subtitle-input" rows="5" placeholder="부제를 입력하세요. 여러 부제는 Enter 키로 줄을 나누세요.">${value}</textarea>`;
  });
  html = html.replace(/<div class="help">[^<]*(?:<[^>]+>[^<]*)*<\/div>/gi, m => {
    if (!/부제|띄어쓰기|청년불자/.test(m)) return m;
    return '<div class="help">부제가 여러 개면 Enter 키로 줄을 나누세요. 입력한 줄 순서 그대로 기사에서 세로로 표시됩니다.</div>';
  });
  return html;
}

function patchDisplay(html) {
  return html.replace(/<div class="subheads">([\s\S]*?)<\/div>/gi, (_m, inner) => {
    const decoded = inner.replace(/<span>/gi, '').replace(/<\/span>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n');
    const lines = decoded.split(/\r?\n+/).map(v => v.trim()).filter(Boolean);
    if (!lines.length) return '';
    return `<div class="subheads vertical-subheads">${lines.map(v => `<span>${v}</span>`).join('')}</div>`;
  });
}

function injectStyles(html) {
  const style = `<style id="subtitle-vertical-patch">
  .field textarea.subtitle-input{display:block!important;width:100%!important;min-height:130px!important;height:130px!important;white-space:pre-wrap!important;resize:vertical!important;line-height:1.7!important;font-size:16px!important}
  .article .vertical-subheads,.article .subheads{display:block!important;margin:8px 0 20px!important;color:#475467!important;font-size:18px!important;line-height:1.75!important}
  .article .vertical-subheads span,.article .subheads span{display:block!important;width:100%!important;margin:0 0 2px!important}
  </style>`;
  return html.includes('subtitle-vertical-patch') ? html : html.replace('</head>', `${style}</head>`);
}

function stripExistingSocialMeta(html) {
  return html
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="image_src"[^>]*>\s*/gi, '');
}

function injectSocialMeta(html, requestPath='/') {
  html = stripExistingSocialMeta(html);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '새벽신문';
  if (/^홈\s*\|\s*새벽신문$/.test(title)) title = '새벽신문';
  const description = '사실을 깊게, 세상을 바르게. 새벽신문';
  const image = `${SITE}${SOCIAL_PATH}`;
  const cleanPath = String(requestPath || '/').split('?')[0].split('#')[0];
  const url = `${SITE}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
  const meta = `<meta property="og:type" content="website">
<meta property="og:site_name" content="새벽신문">
<meta property="og:title" content="${title.replace(/"/g,'&quot;')}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url.replace(/"/g,'%22')}">
<meta property="og:image" content="${image}">
<meta property="og:image:url" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="새벽신문 로고">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title.replace(/"/g,'&quot;')}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<link rel="image_src" href="${image}">
`;
  return html.replace(/<head>/i, `<head>\n${meta}`);
}

http.ServerResponse.prototype.end = function patchedEnd(chunk, encoding, callback) {
  try {
    const type = String(this.getHeader('content-type') || '');
    if (chunk && type.includes('text/html')) {
      const wasBuffer = Buffer.isBuffer(chunk);
      let html = wasBuffer ? chunk.toString(encoding || 'utf8') : String(chunk);
      html = patchEditor(html);
      html = patchDisplay(html);
      html = injectStyles(html);
      html = injectSocialMeta(html, this.__sbRequestPath || '/');
      chunk = wasBuffer ? Buffer.from(html, encoding || 'utf8') : html;
      this.removeHeader('content-length');
      this.setHeader('cache-control','no-store, no-cache, must-revalidate');
    }
  } catch (err) {
    console.error('[site-patch] failed:', err.message);
  }
  return originalEnd.call(this, chunk, encoding, callback);
};
