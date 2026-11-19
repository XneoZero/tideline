const beijingFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium'
});

export function beijingTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? beijingFormatter.format(date) + '（北京时间）' : '';
}

export function safeLogUrl(value) {
  return value.replace(/(https?:\/\/[^\s"'<>；，?#]+)[?#][^\s"'<>；，]*/gi, '$1');
}

export function runError(message) {
  return safeLogUrl(String(message ?? '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\s*Call log:[^；]*/g, ''))
    .replace(/page\.goto:\s*net::ERR_CONNECTION_CLOSED/g, '浏览器连接中断（ERR_CONNECTION_CLOSED）')
    .replace(/\bfetch failed\b/g, 'HTTP 请求失败')
    .trim();
}
