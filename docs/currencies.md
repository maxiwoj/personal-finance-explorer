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

- **Add** writes a new pair after the last used column (the tab gets more columns if needed): the code, the two column numbers, and formula X or Y with its references pointing at the new columns. The start date is copied from the existing formulas (`DATE(2025, 11, 1)` if none is found). A standard code is three capital letters understood by Google Finance; a custom name uses capital letters, digits and underscores. Adding is refused if the target columns are not empty.
- **Change a multiplier** rewrites the custom currency's first cell. It applies to every date, so past transactions in that currency are converted again.
- **Remove** clears the pair's first four rows. The columns stay, as an empty gap, so later currencies keep the column numbers in row 2; new currencies are never written into a gap. The default currency, and any currency used by a transaction in `expenses`, cannot be removed.
- **Change the default** swaps two codes: B1 gets the chosen exchange-rate currency and that currency's pair gets the old default, so the old default stays convertible (its formula X now fetches its rate against the new default). Overwriting B1 alone would drop the old default from the tab. A multiplier cannot become the default. Every converted amount is recalculated in the new default, and the app warns about what changes silently:
  - **Transactions with an empty Currency cell** are in the default currency, so they are read as the new default. Transactions added from the app always set their currency.
  - **Multipliers** assume the amount is in the default currency, so their transactions are read as the new default too. Separating multipliers from currencies is tracked in [#49](https://github.com/maxiwoj/personal-finance-explorer-rs/issues/49).

The app does not rename a currency: that would change how existing transactions are converted. Do that in the spreadsheet.
