# StockSight AI

This is a single-page web application that uses a large language model to generate stock analysis reports.

## Features

-   **AI-Powered Analysis:** Enter a stock ticker and get a detailed report covering company overview, key metrics, charts, recent news, and analyst consensus.
-   **Dynamic Charting:** Visualizes financial data with dynamically generated charts.
-   **Interactive UI:** Built with Vue.js and TailwindCSS for a modern and responsive user experience.
-   **Customizable:** Configure the AI model and API keys through a settings modal.
-   **Local History:** Your analyzed tickers are saved locally for quick access.

## How to Use

1.  **Open `index.html` in your browser.**
2.  **Enter your API Keys:**
    *   Click the settings icon in the top right.
    *   Enter your Gemini API Key (from Google AI Studio).
    *   (Coming soon) Enter your GitHub API Token (for saving to Gist).
    *   Save the settings.
3.  **Analyze a Ticker:**
    *   Enter a stock ticker in the input box at the bottom and press enter.
    *   Or, click on one of the suggested tickers at the top.
    *   Click the "Generate Report" button to start the analysis.
4.  **View and Save the Report:**
    *   The report will be generated section by section.
    *   (Coming soon) Once complete, you'll have options to download the report as a `.txt` file or save it to a GitHub Gist.
