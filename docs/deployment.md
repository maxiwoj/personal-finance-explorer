# Setup & Deployment Guide

This guide covers everything from configuring Google Cloud to deploying your own instance of the Personal Finance Explorer on Vercel.

---

## 1. Google Cloud Configuration

### Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `finance-explorer`).

### Enable APIs
1. Go to **APIs & Services > Library**.
2. Search for **Google Sheets API** and click **Enable**.
3. Search for **Google Picker API** and click **Enable**.

### Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Choose **External** and fill in required fields (app name, email).
3. Add scope: `https://www.googleapis.com/auth/drive.file`. It is non-sensitive and grants access only to files the user selects in the picker, so the app does not need restricted-scope verification.

### Create OAuth Client Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Choose **Web application**.
4. **Authorized JavaScript origins**: `http://localhost:3000`.
5. **Authorized redirect URIs**: `http://localhost:3000`.
6. Copy the **Client ID** and **Client Secret**.

### Create a Picker API Key
1. Go to **APIs & Services > Credentials** and click **Create Credentials > API key**.
2. Restrict it: **Application restrictions** → Websites (your app origins), **API restrictions** → Google Picker API.
3. Copy the key (`NEXT_PUBLIC_GOOGLE_API_KEY`).
4. Copy your **Project number** from the Cloud Console dashboard (`NEXT_PUBLIC_GOOGLE_APP_ID`). The picker needs it to tie file grants to your project.

---

## 2. Prepare Your Spreadsheet

1. Create a new Google Spreadsheet or use an existing one.
2. Ensure it has a sheet named (by default) `expenses`.
3. The expected column order (starting from A1) is:
    - Timestamp
    - What (description)
    - Category
    - Amount
    - Currency
    - AmountPLN
    - MonthYear
    - TransactionID
4. **Recommendation**: Connect a Google Form with fields "What, Category, Amount, Currency" and infer the rest automatically. Feel free to copy [this spreadsheet](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/edit?usp=sharing) as a template.

![Spreadsheet Example](./images/spreadsheet-example.png)

5. After signing in, select the spreadsheet with **Select from Google Drive**. The choice is remembered per Google account in your browser.
6. Optional: set `NEXT_PUBLIC_SPREADSHEET_ID` (from `https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit`) as the default. With the `drive.file` scope it still has to be selected in the picker once per account before the app can read it.

---

## 3. Deploy to Vercel (1-Click)

The fastest way to deploy is using the **Deploy with Vercel** button. This clones the repository to your account and sets up the environment variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fpersonal-finance-explorer-rs&env=NEXT_PUBLIC_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,NEXT_PUBLIC_GOOGLE_API_KEY,NEXT_PUBLIC_GOOGLE_APP_ID,NEXT_PUBLIC_REDIRECT_URI&envDescription=Required%20Google%20OAuth%20credentials%2C%20Picker%20API%20key%2C%20project%20number%2C%20and%20Redirect%20URI.&envLink=https%3A%2F%2Fgithub.com%2Fyour-username%2Fpersonal-finance-explorer-rs%2Fblob%2Fmain%2Fdocs%2Fsetup.md)

### Steps:
1. Click the button above.
2. Connect your Git provider.
3. Fill in the environment variables:
    - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
    - `NEXT_PUBLIC_GOOGLE_API_KEY`
    - `NEXT_PUBLIC_GOOGLE_APP_ID`
    - `NEXT_PUBLIC_SPREADSHEET_ID` (optional, add later in project settings)
    - `NEXT_PUBLIC_REDIRECT_URI` (Use your temporary Vercel URL, e.g., `https://your-app.vercel.app`)
    - `GOOGLE_CLIENT_SECRET`
4. Click **Deploy**.

---

## 4. Finalizing Redirect URIs

Once deployed, you **must** update your Google Cloud Console to allow the production URL:

1. Go to **APIs & Services > Credentials** in Google Cloud Console.
2. Edit your **OAuth 2.0 Client ID**.
3. Add your Vercel deployment URL to:
    - **Authorized JavaScript origins**: e.g., `https://your-app.vercel.app`
    - **Authorized redirect URIs**: e.g., `https://your-app.vercel.app`

---

## ❓ Troubleshooting

- **Invalid Redirect URI**: Ensure the URL in Google Cloud Console matches your Vercel URL exactly (including `https://`).
- **Permission Denied**: Select the spreadsheet via **Change spreadsheet** to grant the app access. Your account also needs at least **Viewer** access to it.
- **Picker fails to open**: Check that the Google Picker API is enabled and the API key allows your app's origin.
- **Token Expiration**: Verify `GOOGLE_CLIENT_SECRET` is correctly set in Vercel to allow token refreshing.
