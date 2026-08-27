'use strict';

const http = require('http');

const originalEnd = http.ServerResponse.prototype.end;

function patchSubtitleEditor(html) {
  return html.replace(
    /<input class="subtitle-input" name="subtitle" value="([\s\S]*?)" placeholder="[^"]*">/g,
    (_m, value) => `<textarea class="subtitle-input" name="subtitle" rows="4" placeholder="부제를 입력하세요. 부제가 여러 개면 엔터키로 줄을 나누세요.">${value}</textarea>`
  ).replace(
    /<div class="help">예: 청년불자 300명 동참[\s\S]*?<\/div>/g,
    '<div class="help">부제가 여러 개면 엔터키를 눌러 한 줄씩 입력하세요. 입력한 줄바꿈이 기사 화면에도 그대로 반영됩니다.</div>'
  );
}

function patchSubtitleDisplay(html) {
  return html.replace(/<div class="subheads">([\s\S]*?)<\/div>/g, (_m, inner) => {
    const plain = inner.replace(/^<span>/, '').replace(/<\/span>$/, '');
    if (!/[\r\n]/.test(plain)) return `<div class="subheads">${inner}</div>`;
    const lines = plain.split(/\r?\n+/).map(v => v.trim()).filter(Boolean);
    return `<div class="subheads">${lines.map(v => `<span>${v}</span>`).join('')}</div>`;
  });
}

function injectStyles(html) {
  const style = `<style id="subtitle-multiline-patch">
  .field textarea.subtitle-input{min-height:112px!important;height:auto!important;white-space:pre-wrap!important;resize:vertical!important;line-height:1.65!important}
  .article .subheads{display:block!important;margin:6px 0 18px!important;font-size:18px!important;line-height:1.65!important}
  .article .subheads span{display:block!important;margin:1px 0!important}
  </style>`;
  return html.includes('subtitle-multiline-patch') ? html : html.replace('</head>', `${style}</head>`);
}

http.ServerResponse.prototype.end = function patchedEnd(chunk, encoding, callback) {
  try {
    const type = String(this.getHeader('content-type') || '');
    if (chunk && type.includes('text/html')) {
      const wasBuffer = Buffer.isBuffer(chunk);
      let html = wasBuffer ? chunk.toString(encoding || 'utf8') : String(chunk);
      html = patchSubtitleEditor(html);
      html = patchSubtitleDisplay(html);
      html = injectStyles(html);
      chunk = wasBuffer ? Buffer.from(html, encoding || 'utf8') : html;
      this.removeHeader('content-length');
    }
  } catch (err) {
    console.error('subtitle patch failed:', err.message);
  }
  return originalEnd.call(this, chunk, encoding, callback);
};
