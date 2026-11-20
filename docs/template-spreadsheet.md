# Template spreadsheet maintenance

The [template spreadsheet](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/copy) holds sample transactions so a fresh copy works as a demo straight away. This page is for the template's owner.

## Recent sample dates

The sample timestamps in `expenses!A` are plain values, not formulas. A formula that generated them (such as an `ARRAYFORMULA` over `TODAY()`) broke as soon as the app edited or added a transaction: writing to column A collides with the formula's output and every date disappears.

To keep the sample data recent, a [standalone Apps Script](https://script.google.com/d/1LDb7sMRhSAXnWfvzm0s3pfUlRbg-aEMBQxGYHTW1zxEt6SZxKCyCIf3O/edit?usp=sharing) runs once a day. It moves every timestamp forward by whole days so the newest transaction lands on today, keeping times of day and the gaps between transactions. The sample [recurring payments](./recurring-payments.md) are moved so each is due today, so every copy shows drafts to approve. Copies get the dates as of the last run and stay unchanged afterwards.

The script is standalone (created at [script.google.com](https://script.google.com), not from the sheet), so the template has no script attached and copying it shows no Apps Script warning.

### Rules

- Never open **Extensions → Apps Script** or **Extensions → Macros** on the template. Doing so attaches a script project to it, and every copy then warns about it. If the warning comes back, delete the attached project from the [Apps Script dashboard](https://script.google.com/home).
- Keep `expenses!A` as values. Paste new sample rows as values, in the `DD/MM/YYYY HH:MM:SS` format.
- Don't add sample rows dated after today: the script only moves dates forward, from the newest one.
- Every run moves each active recurring sample so its `Next` (`recurring!I`) is today (ended ones are left as they are), so every copy shows its drafts due today, also after the owner approves one in the template. `Start` and `End` (H:J) and the dates in that payment's `expenses!K` links move by the same days. Sample transactions linked to a payment must be on its earlier dates, never on `Next`: `Next` is the first date not yet handled, and approving it would skip a date that already has a linked row.
- `expenses2` must include column K (its formula's range extended to `K`), and `expenses!K1` reads `Recurring`; see [Recurring column](./migrations/recurring-column.md).
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
const RECURRING_SHEET_NAME = 'recurring';
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

const pad = n => String(n).padStart(2, '0');

function formatText(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// YYYY-MM-DD, the app's format for recurring dates and expenses!K links
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addDays(d, days) {
  const moved = new Date(d.getTime());
  moved.setDate(moved.getDate() + days); // calendar days, so DST doesn't move the time
  return moved;
}

// A recurring date cell: a date, or text as YYYY-MM-DD or DD/MM/YYYY
function parseDay(v) {
  if (isDate(v)) return v;
  const iso = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? new Date(+iso[1], iso[2] - 1, +iso[3]) : parseText(v);
}

// Moves each active recurring payment so its Next is today: a draft due today in every copy.
// Ended ones (End set and before Next) stay as they are. Start and
// End (H:J) move by the same days, and so do the dates in that payment's expenses!K links
// ("<payment ID>@YYYY-MM-DD"), so its Next never lands on a date that already has a linked row.
function moveRecurringToToday(spreadsheet, expenses, today) {
  const recurring = spreadsheet.getSheetByName(RECURRING_SHEET_NAME);
  if (!recurring || recurring.getLastRow() < 2) return;

  const rows = recurring.getRange(2, 1, recurring.getLastRow() - 1, 10).getValues();
  const shifts = {}; // payment ID -> days moved
  const moved = rows.map(row => {
    const dates = row.slice(7, 10);
    const next = parseDay(dates[1]);
    const end = dates[2] === '' ? null : parseDay(dates[2]);
    const ended = next && end && end < next;
    const shift = next && !ended ? Math.round((today - new Date(next.getFullYear(), next.getMonth(), next.getDate())) / DAY_MS) : 0;
    if (!shift) return dates;
    shifts[String(row[0]).trim()] = shift;
    return dates.map(v => {
      const d = v === '' ? null : parseDay(v);
      if (!d) return v;
      const m = addDays(d, shift);
      // keep each cell's original type and format
      return isDate(v) ? m : /^\d{4}-/.test(String(v).trim()) ? isoDay(m) : formatText(m).slice(0, 10);
    });
  });
  recurring.getRange(2, 8, rows.length, 3).setValues(moved);
  Logger.log(`Moved ${Object.keys(shifts).length} recurring payments to today`);

  if (!Object.keys(shifts).length || expenses.getMaxColumns() < 11 || expenses.getLastRow() < 2) return;
  const links = expenses.getRange(2, 11, expenses.getLastRow() - 1, 1);
  links.setValues(links.getValues().map(([v]) => {
    const m = String(v).trim().match(/^(.+)@(\d{4})-(\d{2})-(\d{2})$/);
    const shift = m && shifts[m[1]];
    return [shift ? `${m[1]}@${isoDay(addDays(new Date(+m[2], m[3] - 1, +m[4]), shift))}` : v];
  }));
}

// Shifts all sample timestamps so the newest one lands on the target day, keeping times of day
function shiftDemoDates() {
  const spreadsheet = SpreadsheetApp.openById(TEMPLATE_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
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
  // Every run, whether or not the transactions move
  moveRecurringToToday(spreadsheet, sheet, day(new Date()));
  if (shift <= 0) return;

  range.setValues(values.map((v, i) => {
    const d = parsed[i];
    if (!d) return [v];
    const moved = addDays(d, shift);
    return [isDate(v) ? moved : formatText(moved)]; // keep each cell's original type
  }));
  Logger.log(`Shifted ${dates.length} rows`);
}
```
