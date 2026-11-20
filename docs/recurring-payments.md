# Recurring payments

Payments that repeat, such as rent or a subscription, are kept in the `recurring` tab. When one is due, it shows as a draft transaction to approve or remove; nothing is added to `expenses` without your approval.

## Managing recurring payments

Open **Recurring payments** from the account menu. It lists every payment with its schedule and next date, marked **Due** when a draft is waiting or **Ended** after its end date.

- **Add** takes the same fields as a transaction (amount, category, what, currency) plus how often it repeats (every N days, weeks, months or years), the date of the first payment and an optional end date. The first payment creates the `recurring` tab.
- **Edit** changes any field. Payments already approved or removed stay handled: the new schedule continues from the old next date, or from the new first payment when that is later.
- **End** stops new drafts from the next date on, by setting the end date to the day before it. The payment stays in the list as **Ended** (listed last), and its transactions keep showing which payment they belong to. To resume, edit it and clear or move the end date: it continues from today, skipping the dates it was ended for. End is offered once at least one date has been handled.
- **Delete** removes the payment's row. Transactions it already added stay, but no longer show which payment they belonged to ("since deleted"), so prefer **End** for a payment you used. Delete suits one added by mistake.

## From a transaction

A payment you just made can become a recurring one, so you don't enter it twice:

- **On the Add page**, tick **Repeats** and choose how often (every N days, weeks, months or years). Saving sets up the recurring payment first, then adds the transaction. The transaction is the payment's first date, already paid, so drafts start with the next date. An end date can be set later on the Recurring payments page. The box needs a connection: offline, the transaction still saves, just not as recurring.
- **From a transaction's details**, the **Make recurring** button (↻) opens the recurring payment form filled in from the transaction, starting on its date. That transaction and any dates up to today count as paid, so no drafts show for the months in between; the form shows the first draft's date.

## Linked transactions

Every transaction that belongs to a recurring payment (approved from a draft, saved with **Repeats**, or set up with **Make recurring**) has `<payment ID>@YYYY-MM-DD` in column K (`Recurring`) of `expenses`: the payment and which of its dates it is. Such a transaction shows ↻ in lists, and its details name the payment instead of offering **Make recurring**. Editing or deleting the transaction leaves the payment unchanged; deleting the payment leaves its transactions and their column K as they are. Setting up the column: [Recurring column](./migrations/recurring-column.md).

## Drafts

A payment is due once its next date is today or earlier. It then shows as a draft, one per payment, marked **Draft**: first in **Recent Activity** and at the top of **Recent Transactions** on the dashboard (tap one to approve or remove it), and under **Draft transactions** on the **Transactions** page, which also says how many later dates are due (e.g. after a few months away). Drafts don't count towards the dashboard's totals.

- **Approve** adds the transaction to `expenses` and moves the payment to its next date. The next draft then shows if that date is due too. Approved on its due day, the transaction gets the current time, so it is the newest one, like any you just added; approved later, it gets 23:59:59 on its due day, the last transaction of that day.
- **Remove** moves the payment to its next date without adding a transaction.

Drafts are refreshed with the rest of the data: **Refresh recent data** / **Reload all data** also re-read the `recurring` tab, so changes made in the sheet show at once. Otherwise it is re-read when a page needs it and the last read is more than 10 minutes old.

Both need a connection. Before writing, the app re-reads the payment's row and refuses if it changed in the sheet (e.g. approved on another device); reload and try again.

Approving first checks column K for that payment's date. If approving failed after the transaction was added, approving again finds it and only moves the payment on, so it is never added twice.

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
