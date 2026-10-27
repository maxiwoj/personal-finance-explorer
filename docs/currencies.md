# Currencies

The `currencyDates` tab converts every transaction to one default currency. Each currency takes a pair of columns.

| Row | Standard currency (e.g. EUR in C:D) | Custom multiplier (e.g. JOINED_ACCOUNT in G:H) |
| --- | --- | --- |
| 1 | C1 empty, D1 `EUR` | G1 the multiplier (`0.5`), H1 `JOINED_ACCOUNT` |
| 2 | `3`, `4`: the columns' numbers | `7`, `8` |
| 3 | C3 formula X: spills `Date`/`Close` and the daily rates | `Date`, `Value` |
| 4+ | (spilled rates) | G4 formula Y: repeats G1 for every date |

The first pair is the default currency: A1 reads `DEFAULT`, **B1 holds the default currency**. The app shows every converted amount in it; without the tab it assumes PLN.

Formula X (shown for C3; the default pair's A3 uses `B1`):

```
=IF(ISBLANK(D1), "", IF(EXACT($B1, D1), VSTACK({"Date", "Close"}, HSTACK(SEQUENCE(TODAY() - DATE(2025, 11, 1) + 1, 1, DATE(2025, 11, 1)), MAKEARRAY(TODAY() - DATE(2025, 11, 1) + 1, 1, LAMBDA(r, c, 1)))), GOOGLEFINANCE("CURRENCY:" & $B1 & D1, "price", DATE(2025, 11, 1), TODAY(), 1)))
```

Formula Y (shown for G4):

```
={ARRAYFORMULA(DATE(2025,11,1) + SEQUENCE(TODAY() - DATE(2025,11,1) + 1, 1, 0)), ARRAYFORMULA(IF(ROW(INDIRECT("A1:A" & TODAY()-DATE(2025,11,1)+1)), G1))}
```

## Managing currencies in the app

Open **Currencies** from the account menu.

- **Add** writes a new pair into the first pair of columns left empty by a removed currency, else after the last used column (the tab gets more columns if needed): the code, the two column numbers, and formula X or Y with its references pointing at the new columns. The start date is copied from the existing formulas (see [The start date](#the-start-date)). Nothing is added past column ZZ, the last one the expenses formula looks up. A standard code is three capital letters understood by Google Finance; a custom name uses capital letters, digits and underscores. Adding is refused if the target columns are not empty.
- **Change a multiplier** rewrites the custom currency's first cell. It applies to every date, so past transactions in that currency are converted again.
- **Remove** clears the pair's first four rows. The columns stay, as an empty gap, so later currencies keep the column numbers in row 2; the next currency added fills the gap. The default currency, and any currency used by a transaction in `expenses`, cannot be removed.
- **Change the default** swaps two codes: B1 gets the chosen exchange-rate currency and that currency's pair gets the old default, so the old default stays convertible (its formula X now fetches its rate against the new default). Overwriting B1 alone would drop the old default from the tab. A multiplier cannot become the default. Every converted amount is recalculated in the new default, and the app warns about what changes silently:
  - **Transactions with an empty Currency cell** are in the default currency, so they are read as the new default. Transactions added from the app always set their currency.
  - **Multipliers** assume the amount is in the default currency, so their transactions are read as the new default too. Separating multipliers from currencies is tracked in [#49](https://github.com/maxiwoj/personal-finance-explorer-rs/issues/49).

The app does not rename a currency: that would change how existing transactions are converted. Do that in the spreadsheet.

## Converting transactions

The template's `expenses` tab converts each amount with (F1):

```
=ArrayFormula(IFS(ROW(D:D)=1, "Amount Default", E:E = "", D:D, TRUE, D:D * VLOOKUP(A:A, CurrencyDates!A:ZZ, HLOOKUP(E:E, CurrencyDates!A1:ZZ2, 2, FALSE))))
```

An empty Currency keeps the amount as is (the default currency). Otherwise `HLOOKUP` finds the currency's column number in row 2 and `VLOOKUP` finds the transaction's day in column A, reading the rate from the same row. Two consequences:

- Both ranges must reach the last used column (`ZZ` above; the app adds nothing beyond ZZ).
- Every pair must start on the same date with one row per day, or rates are read from the wrong day. See [The start date](#the-start-date).

## The start date

The rate tables start on a date **hardcoded in the spreadsheet**: every currency formula (A3, each standard pair's row-3 formula X, each custom pair's row-4 formula Y) contains it as `DATE(2025, 11, 1)`, four times in formula X and three times in formula Y. A transaction dated before it gets `#N/A` in the expenses tab.

### Extending it from the app

**Currencies** shows `Rates start DD/MM/YYYY · earliest transaction DD/MM/YYYY`. When the earliest transaction is before the start, **Extend rates to <date>** moves the start back to that day. Editing a transaction to a date before the start keeps the save and offers the same action. The app never extends on its own.

- The start only ever moves earlier. Moving it later gains nothing and would drop rates that existing transactions use.
- The `DATE(...)` literals are replaced inside the existing formulas, keeping their separators (`,` or `;`) and spacing, so customised formulas survive. All formulas are written in one request, so no pair is left on the old start.
- It is refused when the formulas start on different dates or one has no readable `DATE(...)`, like adding a currency.
- The earliest date is read from `expenses!A:A` at that moment, not from the app's cache. If it changed since the confirmation was shown, nothing is written.
- Google Finance may have no rates that far back for some currencies, and the whole pair then shows an error. After writing, the app waits up to about 15 seconds for Google Finance (while a cell shows `Loading...`), then lists the currencies that did not fail before but now do: their formula shows an error (`#N/A`, `#REF!`, ...), or their rates in row 4 start on a later day than the new start. Google Finance can return only the days it has, which would put the rates on other days' rows without any error. It offers to **revert** every formula to the previous start: all pairs must share one start. A revert is refused if the start changed in the meantime. A currency still loading when the app stops waiting is named too, so check it in the spreadsheet.

### Changing it by hand

To change it by hand, e.g. to a date of your choice:

1. In `currencyDates`, open **Edit → Find and replace**, tick **Also search within formulas**, and replace `DATE(2025, 11, 1)` with the new date, e.g. `DATE(2024, 1, 1)`. Do the same for `DATE(2025,11,1)` (formula Y has no spaces). In a spreadsheet whose locale uses semicolons, the formulas read `DATE(2025; 11; 1)`; replace that form instead.
2. Check that every Date column (A, C, E, ...) starts on the new date in row 4. A pair that still starts on the old date has its rates read from the wrong rows, without any error.

Use a fixed date. A start computed from the transactions (e.g. `MIN(expenses!A:A)`) changes whenever they do and makes GOOGLEFINANCE fetch again; with frequently changing dates it returned no data.

The app reads the start date from the existing formulas and writes new currencies with the same one (`DATE(2025, 11, 1)` if there are no formulas yet). It refuses to add a currency if the formulas start on different dates, or if a formula has no `DATE(...)` it can read, and names the formula to fix.
