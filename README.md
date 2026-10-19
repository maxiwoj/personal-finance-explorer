# Personal Finance Explorer

<p align="center">
  <img src="./public/logo.png" alt="Personal Finance Explorer Logo" width="120" height="120" />
</p>

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaxiwoj%2Fpersonal-finance-explorer-rs&env=NEXT_PUBLIC_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,NEXT_PUBLIC_GOOGLE_API_KEY,NEXT_PUBLIC_GOOGLE_APP_ID,NEXT_PUBLIC_REDIRECT_URI&envDescription=Required%20Google%20OAuth%20credentials%2C%20Picker%20API%20key%2C%20project%20number%2C%20and%20Redirect%20URI.%20See%20the%20Deployment%20Guide%20for%20setup%20instructions.&envLink=https%3A%2F%2Fgithub.com%2Fmaxiwoj%2Fpersonal-finance-explorer-rs%2Fblob%2Fmain%2Fdocs%2Fdeployment.md)

A powerful, privacy-focused personal finance dashboard that turns your Google Sheets into a rich, interactive explorer. Built with Next.js, Google OAuth 2.0, and high-performance charting.

[![Live Demo](https://img.shields.io/badge/Demo-Live%20Preview-3b82f6?style=for-the-badge&labelColor=10b981)](https://v0-personal-finance-dashboard-eta-seven.vercel.app/)

![Dashboard Overview](./docs/images/dashboard.png)

## Try the Live Demo

Want to see the app in action? Visit the [live demo](https://v0-personal-finance-dashboard-eta-seven.vercel.app/) to experience the full functionality with sample data.

**Note**: The demo is deployed with sample data for demonstration purposes. To use your own data, sign in with Google, make a copy of the [template spreadsheet](https://docs.google.com/spreadsheets/d/1KTNJ1fwJbM3uFzJzz3Duc2MP88Ybx2OiXrYa51cooKo/copy), and select it with the built-in Google Drive picker. The app can only access the file you select.

## Features

- **Google Sheets Integration**: Directly syncs with your Google Spreadsheet. The app does not store any of your data on its servers.
- **Interactive Dashboard**: Get a high-level overview of your spending, income, and net flow with dynamic charts.
- **Detailed Transaction Explorer**: Search, filter, and drill down into every transaction.
- **Multi-dimensional Filtering**: Filter by date range, month/year, and categories.
- **Privacy First**: Authenticate with Google OAuth and keep your data in your own spreadsheet.

## Screenshots

### Transactions Explorer
![Transactions Explorer](./docs/images/transactions.png)

### Finance Analysis
#### Categories
![Categories](./docs/images/categories.png)

#### Category Deep Dive
![Category Deep Dive](./docs/images/category-detail.png)

## Development getting started

### Prerequisites

- Node.js 18.x or later
- A Google Cloud Project with the Google Sheets API and Google Picker API enabled
- A Google Spreadsheet with your financial data

### Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/personal-finance-explorer-rs.git
   cd personal-finance-explorer-rs
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the root directory and add the following:
   ```env
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
   NEXT_PUBLIC_GOOGLE_API_KEY=your_picker_api_key
   NEXT_PUBLIC_GOOGLE_APP_ID=your_cloud_project_number
   # Optional: spreadsheet tried before asking the user to pick one
   NEXT_PUBLIC_SPREADSHEET_ID=your_spreadsheet_id
   NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```
   *For detailed setup instructions, see the [Deployment Guide](./docs/deployment.md).*

4. **Run the development server:**
   ```bash
   set -a; source .env.local; set +a
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to see the application.

## 📖 Documentation

- [Architecture Overview](./docs/architecture.md) - Deep dive into how the app works.
- [Setup & Deployment](./docs/deployment.md) - Comprehensive guide from Google OAuth to Vercel.

## 🚀 Quick Deployment

### One-Click Vercel Deployment
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaxiwoj%2Fpersonal-finance-explorer-rs&env=NEXT_PUBLIC_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,NEXT_PUBLIC_GOOGLE_API_KEY,NEXT_PUBLIC_GOOGLE_APP_ID,NEXT_PUBLIC_REDIRECT_URI&envDescription=Required%20Google%20OAuth%20credentials%2C%20Picker%20API%20key%2C%20project%20number%2C%20and%20Redirect%20URI.%20See%20the%20Deployment%20Guide%20for%20setup%20instructions.&envLink=https%3A%2F%2Fgithub.com%2Fmaxiwoj%2Fpersonal-finance-explorer-rs%2Fblob%2Fmain%2Fdocs%2Fdeployment.md)

Deploy your own instance of this app with just one click! Simply click the "Deploy with Vercel" button above, and follow these steps:

1. Sign in to your Vercel account (or create one if you don't have it)
2. Connect your GitHub account when prompted
3. Fill in the required environment variables:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
   - `NEXT_PUBLIC_GOOGLE_API_KEY`: API key for the Google Picker
   - `NEXT_PUBLIC_GOOGLE_APP_ID`: Your Google Cloud project number
   - `NEXT_PUBLIC_SPREADSHEET_ID` (optional): Default spreadsheet ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
   - `NEXT_PUBLIC_REDIRECT_URI`: Your Vercel deployment URL (will be auto-filled)
4. Click "Deploy" and your app will be live in minutes!

For detailed setup instructions, see the [Setup & Deployment Guide](./docs/deployment.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
