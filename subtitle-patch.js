'use strict';

const http = require('http');
console.log('[subtitle-patch] loaded: multiline editor + vertical subtitles');

const originalEnd = http.ServerResponse.prototype.end;

function patchEditor(html) {
  let changed = false;
  html = html.replace(/<input\b([^>]*\bname="subtitle"[^>]*)>/gi, (full, attrs) => {
    changed = true;
    const valueMatch = attrs.match(/\bvalue="([^"]*)"/i);
    const value = valueMatch ? valueMatch[1] : '';
    return `<textarea name="subtitle" class="subtitle-input" rows="5" placeholder="부제를 입력하세요. 여러 부제는 Enter 키로 줄을 나누세요.">${value}</textarea>`;
  });
  html = html.replace(/<div class="help">[^<]*(?:<[^>]+>[^<]*)*<\/div>/gi, m => {
    if (!/부제|띄어쓰기|청년불자/.test(m)) return m;
    return '<div class="help">부제가 여러 개면 Enter 키로 줄을 나누세요. 입력한 줄 순서 그대로 기사에서 세로로 표시됩니다.</div>';
  });
  if (changed) console.log('[subtitle-patch] editor transformed');
  return html;
}

function patchDisplay(html) {
  let changed = false;
  html = html.replace(/<div class="subheads">([\s\S]*?)<\/div>/gi, (_m, inner) => {
    const decoded = inner
      .replace(/<span>/gi, '')
      .replace(/<\/span>/gi, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n');
    const lines = decoded.split(/\r?\n+/).map(v => v.trim()).filter(Boolean);
    if (!lines.length) return '';
    changed = true;
    return `<div class="subheads vertical-subheads">${lines.map(v => `<span>${v}</span>`).join('')}</div>`;
  });
  if (changed) console.log('[subtitle-patch] article subtitles transformed');
  return html;
}

function injectStyles(html) {
  const style = `<style id="subtitle-vertical-patch">
  .field textarea.subtitle-input{display:block!important;width:100%!important;min-height:130px!important;height:130px!important;white-space:pre-wrap!important;resize:vertical!important;line-height:1.7!important;font-size:16px!important}
  .article .vertical-subheads,.article .subheads{display:block!important;margin:8px 0 20px!important;color:#475467!important;font-size:18px!important;line-height:1.75!important}
  .article .vertical-subheads span,.article .subheads span{display:block!important;width:100%!important;margin:0 0 2px!important}
  </style>`;
  return html.includes('subtitle-vertical-patch') ? html : html.replace('</head>', `${style}</head>`);
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
      chunk = wasBuffer ? Buffer.from(html, encoding || 'utf8') : html;
      this.removeHeader('content-length');
    }
  } catch (err) {
    console.error('[subtitle-patch] failed:', err.message);
  }
  return originalEnd.call(this, chunk, encoding, callback);
};
