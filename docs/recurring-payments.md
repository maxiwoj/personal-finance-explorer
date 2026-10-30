# Recurring payments

Payments that repeat, such as rent or a subscription, are kept in the `recurring` tab. When one is due, it shows as a draft transaction to approve or remove; nothing is added to `expenses` without your approval.

## Managing recurring payments

Open **Recurring payments** from the account menu. It lists every payment with its schedule and next date, marked **Due** when a draft is waiting or **Ended** after its end date.

- **Add** takes the same fields as a transaction (amount, category, what, currency) plus how often it repeats (every N days, weeks, months or years), the date of the first payment and an optional end date. The first payment creates the `recurring` tab.
- **Edit** changes any field. Payments already approved or removed stay handled: the new schedule continues from the old next date, or from the new first payment when that is later.
- **Delete** removes the payment's row. Transactions it already added stay.

## Drafts

A payment is due once its next date is today or earlier. The **Transactions** page then shows it under **Draft transactions**, one draft per payment, with how many later dates are also due (e.g. after a few months away).

- **Approve** adds the transaction to `expenses`, dated on the draft's day, and moves the payment to its next date. The next draft then shows if that date is due too.
- **Remove** moves the payment to its next date without adding a transaction.

Both need a connection. Before writing, the app re-reads the payment's row and refuses if it changed in the sheet (e.g. approved on another device); reload and try again.

With [stored transaction IDs](./migrations/stable-transaction-ids.md), an approved transaction's ID is the payment's ID plus the date (`<id>-YYYY-MM-DD`). If approving fails after the transaction was added, approving again finds it and only moves the payment on, so it is never added twice. Sheets with formula IDs get no such check.

## Dates

A monthly or yearly payment keeps the day of its first payment: one starting on the 31st falls on the 30th in April, the 28th or 29th in February, and the 31st again in May.

Drafts are worked out on the device from today's date; the sheet holds no formula for them.

## The `recurring` tab

| Column | Header | Value |
| --- | --- | --- |
| A | ID | A generated ID |
| B | What | Description |
| C | Category | Category |
| D | Amount | Amount, in the payment's currency |
| E | Currency | Currency code, as in `expenses` |
| F | Every | Whole number, 1 or more |
| G | Unit | `day`, `week`, `month` or `year` |
| H | Start | The first payment's date |
| I | Next | The first date not yet approved or removed |
| J | End | The last day a payment can fall on; empty repeats forever |

The app writes dates as `YYYY-MM-DD`, which Sheets turns into dates in every locale, and reads them as date values. You can also edit the tab by hand; a date typed as text is read as `YYYY-MM-DD` or `DD/MM/YYYY`. Rows the app cannot read (a missing field, an unknown unit, an unreadable date) are left out rather than guessed, so they never produce drafts.
