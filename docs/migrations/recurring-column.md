# Recurring column

Recurring payments (see [Recurring payments](../recurring-payments.md)) mark the transactions that belong to them in column K of the `expenses` tab.

| Column | Header | Content |
| --- | --- | --- |
| K | `Recurring` | `<payment ID>@YYYY-MM-DD`: the recurring payment and which of its dates the transaction is; empty otherwise |

## Steps

1. **The header**: the app writes `Recurring` to K1 the first time it links a transaction, if K1 is empty. You can also add it yourself.
2. **Update the `expenses2` tab** so it includes column K, e.g. by extending the range of its formula from `J` to `K`. Without this step, the dashboard can't tell which recent transactions are recurring; the Transactions page reads `expenses` and still shows them.

Nothing else changes, and sheets with formula IDs get the column too. Don't edit the values by hand: approving a draft checks column K to make sure it never adds the same date twice.
