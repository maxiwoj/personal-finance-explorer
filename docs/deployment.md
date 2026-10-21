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
2. Click the key and restrict it:
    - **Application restrictions** → **Websites**, add every origin the app runs on, e.g. `http://localhost:3000/*`, `https://your-app.vercel.app/*` and, for Vercel previews, `https://*-your-team.vercel.app/*`.
    - **API restrictions** → **Restrict key** → **Google Picker API**.
3. Save (changes can take a few minutes to apply) and copy the key (`NEXT_PUBLIC_GOOGLE_API_KEY`).

The key is visible in the browser, which is expected for the Picker; the restrictions are what protect it.

### Find the Project Number
`NEXT_PUBLIC_GOOGLE_APP_ID` is the numeric **project number** (not the project ID). The picker needs it to tie file grants to your project; a wrong value makes every read of a picked sheet fail.
- It is the numeric prefix of your OAuth client ID: `123456789012-abc.apps.googleusercontent.com` → `123456789012`.
- Or: **IAM & Admin > Settings > Project number**.
- Or: `gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'`.

---

## 2. Prepare Your Spreadsheet

Each user brings their own spreadsheet and selects it in the app after signing in. The app can only access files selected in the picker.

The easiest start is to [make a copy of the template](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/copy) (also linked from the app's setup screen). It contains sample transactions: delete them from the `expenses` tab before adding your own. The copy does not include the template's Google Form; add transactions directly in the sheet or link your own form.

To build a spreadsheet by hand instead:

1. Create a new Google Spreadsheet or use an existing one.
2. Ensure it has a sheet named `expenses` (full history) and a sheet named `expenses2` (recent transactions, e.g. a formula over `expenses`).
3. The expected column order (starting from A1) is:
    - Timestamp
    - What (description)
    - Category
    - Amount
    - Currency
    - AmountPLN
    - MonthYear
    - TransactionID
4. **Recommendation**: Connect a Google Form with fields "What, Category, Amount, Currency" and infer the rest automatically.

![Spreadsheet Example](./images/spreadsheet-example.png)

5. After signing in, select the spreadsheet with **Select from Google Drive**. The choice is remembered per Google account in your browser. To switch later, use **Change spreadsheet** in the account menu (top right).
6. Optional: set `NEXT_PUBLIC_SPREADSHEET_ID` (from `https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit`) as the default. With the `drive.file` scope it only works for an account that has selected that sheet in the picker at least once; everyone else sees the setup screen.

---

## 3. Deploy to Vercel (1-Click)

The fastest way to deploy is using the **Deploy with Vercel** button. This clones the repository to your account and sets up the environment variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fpersonal-finance-explorer-rs&env=NEXT_PUBLIC_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,NEXT_PUBLIC_GOOGLE_API_KEY,NEXT_PUBLIC_GOOGLE_APP_ID,NEXT_PUBLIC_REDIRECT_URI&envDescription=Required%20Google%20OAuth%20credentials%2C%20Picker%20API%20key%2C%20project%20number%2C%20and%20Redirect%20URI.&envLink=https%3A%2F%2Fgithub.com%2Fyour-username%2Fpersonal-finance-explorer-rs%2Fblob%2Fmain%2Fdocs%2Fdeployment.md)

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

`NEXT_PUBLIC_*` variables are embedded at build time: after changing one, redeploy. Set them for the **Preview** environment too if you test preview deployments.

---

## 4. Finalizing Redirect URIs

Once deployed, you **must** update your Google Cloud Console to allow the production URL:

1. Go to **APIs & Services > Credentials** in Google Cloud Console.
2. Edit your **OAuth 2.0 Client ID**.
3. Add your Vercel deployment URL to:
    - **Authorized JavaScript origins**: e.g., `https://your-app.vercel.app`
    - **Authorized redirect URIs**: e.g., `https://your-app.vercel.app`
4. Edit your **Picker API key** and make sure the same URL is in its **Website restrictions**.

OAuth origins do not support wildcards, so each preview URL you want to sign in on must be added explicitly.

---

## ❓ Troubleshooting

- **Invalid Redirect URI**: Ensure the URL in Google Cloud Console matches your Vercel URL exactly (including `https://`).
- **"This app cannot access the spreadsheet"**: Select the spreadsheet again in the picker to grant access. Your account also needs at least **Viewer** access to it. If it persists right after picking, `NEXT_PUBLIC_GOOGLE_APP_ID` is not the project number of the project that owns the OAuth client.
- **"The API developer key is invalid"** in the picker: The Google Picker API is not enabled, the key belongs to another project, the key's website restrictions do not include the current origin, or the app was not redeployed after setting `NEXT_PUBLIC_GOOGLE_API_KEY`.
- **"Google Drive file access is required"** on sign-in: The Drive file permission was unticked on the consent screen. Sign in again and allow it.
- **"The spreadsheet does not match the template"**: The selected file lacks the `expenses` and `expenses2` tabs.
- **Token Expiration**: Verify `GOOGLE_CLIENT_SECRET` is correctly set in Vercel to allow token refreshing.
