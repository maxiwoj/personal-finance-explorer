# Architecture Overview

This document describes the high-level architecture of the Personal Finance Explorer.

## Data Flow

1.  **Authentication**: The user logs in via Google OAuth 2.0. The frontend receives an authorization code and sends it to the backend (`/api/auth/login`).
2.  **Token Management**: The backend exchanges the code for access and refresh tokens. The refresh token is stored in a secure, HttpOnly cookie.
3.  **Spreadsheet Selection**: The user picks a spreadsheet with Google Picker (`lib/google-picker.ts`). With the `drive.file` scope, picking is what grants the app access to that file. The selection is stored in `localStorage` per Google user (`contexts/spreadsheet-context.tsx`), falling back to `NEXT_PUBLIC_SPREADSHEET_ID`.
4.  **Data Fetching**: When the app needs data, it calls the Google Sheets API for the selected spreadsheet using the user's access token.
    - If the access token is expired, the backend uses the refresh token to get a new one (`/api/auth/refresh`).
5.  **Parsing & Normalization**: Raw rows from Google Sheets are parsed into a consistent `Transaction` type in `lib/sheets.ts`. This includes handling various date formats and currency/amount parsing.
6.  **State Management**: Financial data is managed using **TanStack Query** for caching and background updates. The `DataProvider` context provides this data to the entire component tree.
7.  **Writing**: Adding and editing also call the Sheets API from the browser (`lib/sheets.ts`). A new transaction is appended to the `expenses` tab: the input columns A–E plus a generated TransactionID (H) and, for a return, ReturnOf (J); the sheet's formulas derive AmountPLN and MonthYear. A sheet that still derives TransactionID with a formula gets columns A–E only (see [Stable transaction IDs](./migrations/stable-transaction-ids.md)). An edit finds the row by TransactionID, re-reads it to make sure it still matches, and writes only the changed cells; it refuses to overwrite an amount that is a formula. A delete checks the row the same way and removes it; it is refused for a purchase that still has returns, and for sheets whose IDs are row numbers. Both caches are then invalidated.
8.  **Returns**: A return is a row with a negative amount whose ReturnOf holds the purchase's TransactionID. `linkReturns` (`lib/returns.ts`) folds returns into their purchase when transactions are read, so analytics see the purchase at its net amount in its own month and category.
9.  **Categories**: The optional `categories` tab is read once per session (`useCategories`). It sets the order of category buttons on the Add page and seeds `lib/colors.ts` so each category keeps the same color everywhere.
10. **Currencies**: The optional `currencyDates` tab is read once per session (`useCurrencies`, `lib/currencies.ts`). Its B1 is the default currency every amount is shown in; its column pairs are the currencies offered on the Add page. The Currencies page writes new pairs (code, column numbers and a formula generated for the pair's columns), changes a custom currency's multiplier, and clears unused pairs. See [Currencies](./currencies.md).
11. **Filtering**: The `FilterContext` manages the global filter state (date range, categories, etc.), which is used by hooks like `useTransactions` to provide filtered views of the data.

## Tech Stack

-   **Framework**: [Next.js](https://nextjs.org) (App Router)
-   **Language**: TypeScript
-   **Styling**: [Tailwind CSS](https://tailwindcss.com) & [Radix UI](https://www.radix-ui.com)
-   **Charts**: [ECharts](https://echarts.apache.org) & [Recharts](https://recharts.org)
-   **State Management**: [TanStack Query](https://tanstack.com/query)
-   **API**: Google Sheets API (REST, from the browser) and Google Picker; `googleapis` for OAuth on the server

## Key Components

### Frontend (Next.js App Router)
-   **Contexts**: `DataProvider`, `FilterContext`, `AuthContext`.
-   **Hooks**: `useTransactions`, `useAnalytics`.
-   **Charts**: Custom wrappers around ECharts and Recharts for responsive, interactive visualizations.

### Backend (Next.js Route Handlers)
-   **Auth Routes**: `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`.
-   **Server Libs**: `lib/auth-server.ts` handles Google OAuth client interactions.

## Storage & Privacy

-   **Google Sheets**: All your financial data stays in your own Google Spreadsheet. The app writes only when you add, edit, return or delete a transaction, create the categories tab, or manage currencies.
-   **Cookies**: The app stores a secure refresh token in your browser to keep you logged in.
-   **localStorage**: The selected spreadsheet (ID and name) per Google account, plus the short-lived access token.
-   **IndexedDB**: The app uses IndexedDB (via `idb` library) for client-side caching to improve performance on subsequent loads.

## Performance Optimizations

-   **Incremental Loading**: The app first fetches "Recent" transactions for a quick initial view, then optionally fetches the "Full" history in the background.
-   **Memoized Filtering**: Complex filtering logic is memoized to prevent unnecessary re-computations during UI interactions.
-   **Optimistic UI**: Filter changes are reflected instantly in the UI while data might be refreshing in the background.
