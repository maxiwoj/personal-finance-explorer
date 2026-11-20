# Spreadsheet config

The optional `config` tab holds settings that belong to the spreadsheet, not to one browser, so they apply on every device that opens it. Edit it directly in the sheet; the app has no settings page for it yet.

## Layout

One setting per row: the key in column A, the value in column B, an optional note in column C. A first row of `Key | Value | Note` is treated as a header. Keys are case-sensitive; if a key appears twice, the first row wins. A missing tab is the same as an empty one: every setting has a default.

| Key | Value | Meaning |
|---|---|---|
| `templateSample` | `TRUE` | The sheet still holds the template's sample data, so the app offers to clear it (see below). Removed when the data is cleared. |
| `schemaVersion` | number | Reserved for spreadsheet migrations; not read yet. |

`TRUE`, `yes` and `1` count as true (a checkbox works too); anything else is false.

The app reads the tab in the background and caches it with the rest of the data, so it shows at once on launch, also offline, and refreshes within 10 minutes of a change. Anything that acts on a setting irreversibly reads it from the sheet again first.

### schemaVersion

Meant to replace probing the sheet's columns for each migration (e.g. whether TransactionID is a formula, or whether `expenses!K1` reads `Recurring`). Rules for when it's used:

- A missing value means the version is unknown, not 0: the app then keeps detecting the layout from the columns, as today.
- One number for the whole layout, not a flag per migration. Each migration states the version it needs and the one it produces.
- The app writes it only once a migration is confirmed done.

## Clearing the template's sample data

A fresh copy of the [template](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/copy) is full of sample transactions. **Clear sample data** in the account menu, and a hint on the dashboard, remove them so you can start with your own.

It is offered only when all of these hold, and checked again against the sheet before anything is deleted:

- `config` has `templateSample` set to `TRUE`. A sheet without it, which is every sheet not copied from the template, can never be cleared from the app.
- Every transaction in `expenses` has a sample TransactionID (starting with `sample-`), and so does every payment in `recurring`. IDs the app writes are UUIDs, so one transaction or recurring payment you added blocks it; delete the sample rows in the sheet instead.
- You're online and signed in with Google (not in demo mode).

It clears:

- `expenses`: the input columns (A:E and H:K) below the header. The header and the formula columns (AmountPLN, MonthYear) stay.
- `recurring`: every payment below the header.
- `categories`: every category below the header.
- The `templateSample` row in `config`, so it's never offered again for that sheet.

`currencyDates` and the rest of `config` stay. The confirmation shows how many rows each tab loses and asks you to type `DELETE`. It can't be undone from the app; use **File → Version history** in Google Sheets to get the data back.

## Template setup

The template's owner sets this up once in the template:

1. Add a tab named `config` with `Key | Value | Note` in row 1 and `templateSample | TRUE | Sample data: the app offers to clear it` in row 2.
2. Give every sample transaction a TransactionID (`expenses!H`) starting with `sample-`, e.g. `sample-001`, `sample-002`. Update any `expenses!J` (ReturnOf) that points at a renamed ID.
3. Give every sample recurring payment an ID (`recurring!A`) starting with `sample-`, e.g. `sample-rent`. Update the `expenses!K` links that name it (`<payment ID>@<date>`).
4. Copy the template and check that **Clear sample data** shows in the account menu.

The daily [date-shifting script](./template-spreadsheet.md) only edits dates, so it leaves the marker and the IDs alone.
