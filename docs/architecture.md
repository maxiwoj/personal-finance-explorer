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
7.  **Filtering**: The `FilterContext` manages the global filter state (date range, categories, etc.), which is used by hooks like `useTransactions` to provide filtered views of the data.

## Tech Stack

-   **Framework**: [Next.js](https://nextjs.org) (App Router)
-   **Language**: TypeScript
-   **Styling**: [Tailwind CSS](https://tailwindcss.com) & [Radix UI](https://www.radix-ui.com)
-   **Charts**: [ECharts](https://echarts.apache.org) & [Recharts](https://recharts.org)
-   **State Management**: [TanStack Query](https://tanstack.com/query)
-   **API**: Google Sheets API via `googleapis`

## Key Components

### Frontend (Next.js App Router)
-   **Contexts**: `DataProvider`, `FilterContext`, `AuthContext`.
-   **Hooks**: `useTransactions`, `useAnalytics`.
-   **Charts**: Custom wrappers around ECharts and Recharts for responsive, interactive visualizations.

### Backend (Next.js Route Handlers)
-   **Auth Routes**: `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`.
-   **Server Libs**: `lib/auth-server.ts` handles Google OAuth client interactions.

## Storage & Privacy

-   **Google Sheets**: All your financial data stays in your own Google Spreadsheet.
-   **Cookies**: The app stores a secure refresh token in your browser to keep you logged in.
-   **IndexedDB**: The app uses IndexedDB (via `idb` library) for client-side caching to improve performance on subsequent loads.

## Performance Optimizations

-   **Incremental Loading**: The app first fetches "Recent" transactions for a quick initial view, then optionally fetches the "Full" history in the background.
-   **Memoized Filtering**: Complex filtering logic is memoized to prevent unnecessary re-computations during UI interactions.
-   **Optimistic UI**: Filter changes are reflected instantly in the UI while data might be refreshing in the background.
