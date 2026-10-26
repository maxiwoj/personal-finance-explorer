# Stable transaction IDs, notes and returns

Spreadsheets copied from the template before this change derive `TransactionID` (column H) from the row number:

```
=ARRAYFORMULA(IF(ROW(H:H)=1, "TransactionID", IF(B:B="", "", ROW(H:H))))
```

Those IDs shift when a row is deleted, inserted or the tab is sorted. Returns link to their purchase by ID, so they need IDs that never change. After this update, column H holds stored values: existing IDs keep their current numbers, and the app writes a new unique ID for every row it adds.

## What changes in the `expenses` tab

| Column | Header | Content |
| --- | --- | --- |
| H | `TransactionID` | Stored values instead of a formula |
| I | `Notes` | Optional free-form note, editable from the transaction details |
| J | `ReturnOf` | On a return, the `TransactionID` of the purchase it returns; empty otherwise |

## Steps

1. **Freeze the IDs.** In the `expenses` tab, select column H, copy it and paste it back with **Edit → Paste special → Values only** (Ctrl+Shift+V). The ARRAYFORMULA in H1 is replaced by its current values, so H1 reads `TransactionID` and every row keeps its ID.
2. **Add the headers.** Put `Notes` in I1 if it is not there yet, and `ReturnOf` in J1.
3. **Update the `expenses2` tab** so it includes columns I and J, e.g. by extending the range of its formula to `J`.
4. **Rows added outside the app** need a unique value in column H, for example the next unused number.

## Without the update

The app keeps working: adding a transaction writes the input columns only and leaves the ID formula intact. Recording a return and deleting a transaction are refused until column H holds stored values, since deleting a row would shift every row-number ID after it.

## How returns are counted

A return is its own row with a negative amount, in the purchase's currency, linked through `ReturnOf`. Reverting a return deletes its row. A purchase can only be deleted once its returns are removed. The app counts a return towards the purchase: the purchase is shown at its net amount in its own month and category, with the original amount and each return in its details. If the purchase is not in the loaded data (e.g. it is older than the `expenses2` tab), the return is shown as a row of its own.
