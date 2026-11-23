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

A fresh copy of the [template](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/copy) is full of sample transactions. **Clear sample data** in the account menu, and a hint on the dashboard while sample transactions show, remove them, also after you've started adding your own.

Sample rows are the ones whose ID starts with `sample-`: TransactionID (`expenses!H`) for transactions, ID (`recurring!A`) for recurring payments. IDs the app writes are UUIDs, so your own rows never match.

It's offered while `config` has `templateSample` set to `TRUE` and you're online and signed in with Google (not in demo mode). A sheet without the marker, which is every sheet not copied from the template, can never be cleared from the app. When you confirm, the sheet is read again and:

- Every sample row in `expenses` and `recurring` is deleted. Your own transactions and recurring payments stay and close up; headers and formula columns stay.
- `categories` is emptied (below its header) only when none of your own transactions or recurring payments remain; otherwise it stays, since your transactions use it.
- The `templateSample` row in `config` is emptied, so it's never offered again for that sheet.

All of it is one Sheets request, applied all or nothing.

It's refused while one of your transactions points at a sample row: a return of a sample purchase (ReturnOf, `expenses!J`) or a payment approved from a sample recurring payment (Recurring, `expenses!K`). Deleting the sample row would leave it pointing at nothing, so the dialog lists those rows to change or delete in the sheet first.

`currencyDates` and the rest of `config` stay. The confirmation shows what goes and what stays and asks you to type `DELETE`. It can't be undone from the app; use **File → Version history** in Google Sheets to get the data back.

## Template setup

The template's owner sets this up once in the template:

1. Add a tab named `config` with `Key | Value | Note` in row 1 and `templateSample | TRUE | Sample data: the app offers to clear it` in row 2.
2. Give every sample transaction a TransactionID (`expenses!H`) starting with `sample-`, e.g. `sample-001`, `sample-002`. Update any `expenses!J` (ReturnOf) that points at a renamed ID.
3. Give every sample recurring payment an ID (`recurring!A`) starting with `sample-`, e.g. `sample-rent`. Update the `expenses!K` links that name it (`<payment ID>@<date>`).
4. Copy the template and check that **Clear sample data** shows in the account menu.

The daily [date-shifting script](./template-spreadsheet.md) only edits dates, so it leaves the marker and the IDs alone.
