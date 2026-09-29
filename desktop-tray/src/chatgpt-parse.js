// Pure parser for visible usage cards. Unknown labels stay visible; no quota amounts are inferred.
function parseChatGptCards(cards) {
  const windows = [];
  for (const card of cards) {
    const text = (card.text || "").replace(/\s+/g, " ").trim();
    const heading = text.match(/(?:每周使用限额|weekly usage|每\s*\d+\s*小时(?:使用)?限额|\d+\s*hour(?:s)?(?: usage)?|每日(?:使用)?限额|daily usage)/i);
    if (!heading) continue;
    const label = heading[0].replace(/\s+/g, " ");
    const afterHeading = text.slice(heading.index + heading[0].length);
    const percent = card.percentText?.match(/^\s*(\d+(?:\.\d+)?)%\s*$/)
      || afterHeading.match(/(\d+(?:\.\d+)?)%\s*(?:剩余|remaining)/i)
      || afterHeading.match(/(?:剩余|remaining)\s*(\d+(?:\.\d+)?)%/i);
    const width = card.width?.match(/^(\d+(?:\.\d+)?)%$/);
    const value = Number((percent || width)?.[1]);
    if (!Number.isFinite(value) || !(percent || width) || value < 0 || value > 100) continue;
    const reset = afterHeading.match(/(?:重置时间|重置于|resets? (?:at|in|on)|reset time)[：:]?\s*([^。;|]+)/i);
    const resetText = reset?.[1]?.trim() || null;
    let resetAt = null;
    if (resetText) {
      const cn = resetText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
      if (cn) {
        const date = new Date(+cn[1], +cn[2] - 1, +cn[3], +cn[4], +cn[5]);
        if (date.getFullYear() === +cn[1] && date.getMonth() === +cn[2] - 1 && date.getDate() === +cn[3]) resetAt = date.getTime();
      } else if (/\d{4}-\d\d-\d\d/.test(resetText)) {
        const parsed = Date.parse(resetText);
        if (Number.isFinite(parsed)) resetAt = parsed;
      }
    }
    if (!windows.some(window => window.label.toLowerCase() === label.toLowerCase())) {
      windows.push({ label, remainingPercentage: value, resetAt, resetText });
    }
  }
  return windows;
}
if (typeof module !== "undefined") module.exports = { parseChatGptCards };
