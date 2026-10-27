# Template spreadsheet maintenance

The [template spreadsheet](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/copy) holds sample transactions so a fresh copy works as a demo straight away. This page is for the template's owner.

## Recent sample dates

The sample timestamps in `expenses!A` are plain values, not formulas. A formula that generated them (such as an `ARRAYFORMULA` over `TODAY()`) broke as soon as the app edited or added a transaction: writing to column A collides with the formula's output and every date disappears.

To keep the sample data recent, a [standalone Apps Script](https://script.google.com/d/1LDb7sMRhSAXnWfvzm0s3pfUlRbg-aEMBQxGYHTW1zxEt6SZxKCyCIf3O/edit?usp=sharing) runs once a day. It moves every timestamp forward by whole days so the newest transaction lands on today, keeping times of day and the gaps between transactions. Copies get the dates as of the last run and stay unchanged afterwards.

The script is standalone (created at [script.google.com](https://script.google.com), not from the sheet), so the template has no script attached and copying it shows no Apps Script warning.

### Rules

- Never open **Extensions → Apps Script** or **Extensions → Macros** on the template. Doing so attaches a script project to it, and every copy then warns about it. If the warning comes back, delete the attached project from the [Apps Script dashboard](https://script.google.com/home).
- Keep `expenses!A` as values. Paste new sample rows as values, in the `DD/MM/YYYY HH:MM:SS` format.
- Don't add sample rows dated after today: the script only moves dates forward, from the newest one.
- The shifted dates must stay within the `currencyDates` range (from `DATE(2025, 11, 1)`, see [Currencies](./currencies.md)), or `AmountPLN` can't convert the oldest rows.

### Setup

1. At [script.google.com](https://script.google.com), click **New project** and paste the script below into `Code.gs`. Set `TEMPLATE_ID` to the template's ID (the part of its URL between `/d/` and `/edit`).
2. In **Project Settings**, set the time zone to the spreadsheet's (**File → Settings** in the sheet).
3. Pick `shiftDemoDates` in the toolbar and click **Run**. Authorize with the template owner's account; for a personal script Google shows "Google hasn't verified this app": click **Advanced → Go to (project name) → Allow**. The log should end with `Shifted … rows`.
4. Under **Triggers** (alarm clock icon), click **Add Trigger**: function `shiftDemoDates`, event source **Time-driven**, type **Day timer**, any night-time hour. Google emails the owner when a run fails; past runs are listed under **Executions**.

If `AmountPLN` shows `#N/A` for the newest rows, today's exchange rate isn't loaded yet: set `DAYS_BEFORE_TODAY` to `1`.

### Script

```js
const TEMPLATE_ID = 'PUT_SHEET_ID_HERE';
const SHEET_NAME = 'expenses';
const DAY_MS = 86400000;
// 0 = newest transaction lands on today; 1 = yesterday (use if AmountPLN shows #N/A for the newest rows)
const DAYS_BEFORE_TODAY = 0;

// getValues() dates fail `instanceof Date` in Apps Script, so check the type tag instead
const isDate = v => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v);

// DD/MM/YYYY HH:MM:SS, the app's timestamp format
function parseText(s) {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  return m ? new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
}

function formatText(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Shifts all sample timestamps so the newest one lands on the target day, keeping times of day
function shiftDemoDates() {
  const sheet = SpreadsheetApp.openById(TEMPLATE_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`No tab named "${SHEET_NAME}"`);

  const last = sheet.getLastRow();
  if (last < 2) {
    Logger.log('No data rows');
    return;
  }

  const range = sheet.getRange(2, 1, last - 1, 1);
  const a1 = sheet.getRange('A1').getFormula();
  const formulas = range.getFormulas().flat().filter(f => f);
  if (a1 || formulas.length) {
    throw new Error(`Column A has formulas (A1: "${a1}", ${formulas.length} in rows). Paste column A as values first.`);
  }

  const values = range.getValues().map(([v]) => v);
  const parsed = values.map(v => isDate(v) ? v : parseText(v));
  const dates = parsed.filter(d => d);
  const realDates = values.filter(isDate).length;
  Logger.log(`Rows: ${values.length}, real dates: ${realDates}, text dates: ${dates.length - realDates}`);
  if (!dates.length) {
    throw new Error(`No dates recognised in column A. First values: ${JSON.stringify(values.slice(0, 3))}`);
  }

  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const target = day(new Date(Date.now() - DAYS_BEFORE_TODAY * DAY_MS));
  const newest = new Date(Math.max(...dates.map(d => d.getTime())));
  const shift = Math.round((target - day(newest)) / DAY_MS);
  Logger.log(`Newest: ${newest}, shift: ${shift} days`);
  if (shift <= 0) return;

  range.setValues(values.map((v, i) => {
    const d = parsed[i];
    if (!d) return [v];
    const moved = new Date(d.getTime());
    moved.setDate(moved.getDate() + shift); // calendar days, so DST doesn't move the time
    return [isDate(v) ? moved : formatText(moved)]; // keep each cell's original type
  }));
  Logger.log(`Shifted ${dates.length} rows`);
}
```
