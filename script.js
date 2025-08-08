import { createApp, ref, nextTick, watch, onMounted, onUnmounted, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

    createApp({
      setup() {
        const newMessageText = ref('');
        const isLoading = computed(() => reportData.value.status === 'loading');
        const chatContainerRef = ref(null);

        // --- Ticker Carousel State ---
        const tickerList = ref([]);
        const activeTicker = ref('');
        const LS_TICKERS_KEY = 'stocksight_tickers_v1';

        // --- Report State Management ---
        const getInitialReportData = () => ({
            status: 'idle', // idle, loading, complete, error
            errorMessage: '',
            companyProfile: { name: '', ticker: '', sector: '', description: '' },
            valuation: { peRatio: null, psRatio: null, industryPe: null, industryPs: null },
            charts: [], // DYNAMIC: Array to hold all generated charts
            news: [],
            analystConsensus: { rating: '', priceTarget: '' },
            activeSteps: [
                { name: 'Profile', icon: 'business_center', status: 'pending', currentTool: null, sources: [] },
                // MERGED: Financials and Valuation are now one step
                { name: 'Key Metrics & Charts', icon: 'query_stats', status: 'pending', currentTool: null, sources: [] },
                { name: 'News', icon: 'feed', status: 'pending', currentTool: null, sources: [] },
                { name: 'Consensus', icon: 'groups', status: 'pending', currentTool: null, sources: [] },
                { name: 'Finalizing', icon: 'summarize', status: 'pending', currentTool: null, sources: [] },
            ],
        });
        const reportData = ref(getInitialReportData());

        // --- Accordion State ---
        const openAccordions = ref({});
        const toggleAccordion = (stepName) => {
            openAccordions.value[stepName] = !openAccordions.value[stepName];
        };
        const getRealUrl = (proxyUrl) => {
          try {
            const urlObj = new URL(proxyUrl);
            return urlObj.searchParams.get('url') || proxyUrl;
          } catch (e) {
            return proxyUrl;
          }
        };
        const formatUrl = (urlString) => {
            try {
                const urlObject = new URL(urlString);
                return urlObject.hostname.replace(/^www\./, '');
            } catch (e) {
                return urlString.length > 50 ? urlString.substring(0, 47) + '...' : urlString;
            }
        };

        // --- Icon Mapping ---
        const toolIconMap = {
            web_search: 'search',
            fetch_page_content: 'article',
            submit_company_profile: 'assignment_ind',
            submit_chart_data: 'add_chart', // DYNAMIC
            submit_valuation_metrics: 'balance',
            submit_recent_news: 'newspaper',
            submit_analyst_consensus: 'insights',
        };

        const stepStatusMap = computed(() => {
            const map = {};
            for (const step of reportData.value.activeSteps) {
                map[step.name] = { status: step.status, icon: step.icon, currentTool: step.currentTool, sources: step.sources };
            }
            return map;
        });

        const resetState = () => {
          // DYNAMIC: Destroy all active chart instances before resetting state
          Object.values(chartInstances.value).forEach(chart => chart.destroy());
          chartInstances.value = {};
          chartRefs.value = {};
          reportData.value = getInitialReportData();
          openAccordions.value = {};
        }

        // --- Settings State ---
        const apiKey = "AIzaSyCvtMPDKK4oT_-1RB0MBOYoDwPjme6akoY";
        const githubToken = ref("");
        const modelName = ref("gemini-2.5-flash-lite");
        const apiUrl = computed(() => `https://generativelanguage.googleapis.com/v1beta/models/${modelName.value}:generateContent?key=${apiKey.value}`);
        const showSettingsModal = ref(false);
        const settingsModel = ref('');
        const settingsApiKey = ref('');
        const settingsGithubToken = ref('');
        const LS_API_KEY_KEY = 'stocksight_gemini_api_key_v1';
        const LS_MODEL_NAME_KEY = 'stocksight_gemini_model_name_v1';
        const LS_GITHUB_TOKEN_KEY = 'stocksight_github_token_v1';

        const openSettingsModal = () => { settingsModel.value = modelName.value; settingsApiKey.value = apiKey.value; settingsGithubToken.value = githubToken.value; showSettingsModal.value = true; };
        const closeSettingsModal = () => { showSettingsModal.value = false; };
        const saveSettings = () => { if (!settingsApiKey.value || settingsApiKey.value.trim() === '') { alert("API Key cannot be empty."); return; } localStorage.setItem(LS_API_KEY_KEY, settingsApiKey.value); localStorage.setItem(LS_MODEL_NAME_KEY, settingsModel.value); if (settingsGithubToken.value.trim() !== '') { localStorage.setItem(LS_GITHUB_TOKEN_KEY, settingsGithubToken.value); } apiKey.value = settingsApiKey.value; modelName.value = settingsModel.value; githubToken.value = settingsGithubToken.value; closeSettingsModal(); };

        // --- DYNAMIC Chart Management ---
        const chartRefs = ref({}); // Holds the canvas elements
        const chartInstances = ref({}); // Holds the Chart.js instances

        const createChart = (canvasEl, chartConfig) => {
            if (!canvasEl) return null;
            const isDark = document.documentElement.classList.contains('dark');
            const tickColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
            const fontColor = isDark ? '#cbd5e1' : '#475569';
            return new Chart(canvasEl, {
                type: chartConfig.type || 'bar',
                data: {
                    labels: chartConfig.data.labels,
                    datasets: chartConfig.data.datasets.map(ds => ({
                        ...ds,
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.7)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: (chartConfig.data.datasets?.length > 1), labels: { color: fontColor } },
                        title: { display: true, text: chartConfig.title, color: fontColor, font: { size: 16 } }
                    },
                    scales: {
                        y: { ticks: { color: fontColor }, grid: { color: tickColor } },
                        x: { ticks: { color: fontColor }, grid: { color: 'transparent' } }
                    }
                }
            });
        };

        // Watch for new charts added by the AI and render them
        watch(() => reportData.value.charts, async (newCharts) => {
          if (newCharts.length > 0) {
            await nextTick(); // Wait for the DOM to update with the new canvas elements
            for (const chartConfig of newCharts) {
              if (!chartInstances.value[chartConfig.id] && chartRefs.value[chartConfig.id]) {
                const newChart = createChart(chartRefs.value[chartConfig.id], chartConfig);
                if (newChart) {
                  chartInstances.value[chartConfig.id] = newChart;
                }
              }
            }
          }
        }, { deep: true });

        // --- Core AI Logic & Tool Definitions (New Architecture) ---
        const toolDefinitions = {
            web_search: { name: "web_search", description: "Performs a web search.", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "The search query." } }, required: ["query"] } },
            fetch_page_content: { name: "fetch_page_content", description: "Fetches text content from a URL.", parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "The page URL." } }, required: ["url"] } },
            submit_company_profile: { name: "submit_company_profile", description: "Submits the company profile data.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, ticker: { type: "STRING" }, sector: { type: "STRING" }, description: { type: "STRING" } }, required: ["name", "ticker", "sector", "description"] } },
            // DYNAMIC: New flexible chart tool
            submit_chart_data: { name: "submit_chart_data", description: "Submits data for a single chart.", parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, chartType: { type: "STRING", description: "Type of chart, e.g., 'bar' or 'line'." }, labels: { type: "ARRAY", items: { type: "STRING" } }, datasetLabel: { type: "STRING" }, datasetData: { type: "ARRAY", items: { type: "NUMBER" } } }, required: ["title", "chartType", "labels", "datasetLabel", "datasetData"] } },
            submit_valuation_metrics: { name: "submit_valuation_metrics", description: "Submits key valuation metrics like P/E and P/S ratios.", parameters: { type: "OBJECT", properties: { peRatio: { type: "NUMBER" }, psRatio: { type: "NUMBER" }, industryPe: { type: "NUMBER" }, industryPs: { type: "NUMBER" } }, required: ["peRatio", "psRatio", "industryPe", "industryPs"] } },
            submit_recent_news: { name: "submit_recent_news", description: "Submits recent news articles.", parameters: { type: "OBJECT", properties: { news_data: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, href: { type: "STRING" }, snippet: { type: "STRING" } } } } }, required: ["news_data"] } },
            submit_analyst_consensus: { name: "submit_analyst_consensus", description: "Submits analyst consensus data.", parameters: { type: "OBJECT", properties: { rating: { type: "STRING" }, priceTarget: { type: "STRING" } }, required: ["rating", "priceTarget"] } },
        };

        const analysisStepsConfig = {
            'Profile': {
                prompt: (ticker, context) => `You are a financial analyst. Your current task is to find the company profile for the stock ticker "${ticker}". Use the provided tools to find the company's full name, its stock ticker symbol, its industry sector, and a concise business description. Once you have all this information, you MUST call the "submit_company_profile" function with the data.`,
                tools: ['web_search', 'fetch_page_content', 'submit_company_profile'],
                submitFunction: 'submit_company_profile'
            },
            // DYNAMIC: New combined step
            'Key Metrics & Charts': {
                prompt: (ticker, context) => `Your current task is to find key metrics and chartable data for ${context.companyProfile.name} (${ticker}).
                1. Find key valuation metrics: the company's P/E Ratio, P/S Ratio, and the average P/E and P/S ratios for its industry. Call the "submit_valuation_metrics" function with this data.
                2. Find at least two important time-series datasets to visualize, like annual Revenue, Net Income, or EPS for the last 3-5 years. For each dataset you find, you MUST make a separate call to the "submit_chart_data" function. Ensure data is in a reasonable unit (e.g., billions for revenue).
                You can perform multiple web searches to gather all the required information before calling the submission functions.`,
                tools: ['web_search', 'fetch_page_content', 'submit_valuation_metrics', 'submit_chart_data'],
                // This step is considered complete when the AI stops calling tools. We won't use a single submit function.
                submitFunction: null
            },
            'News': {
                prompt: (ticker, context) => `Your current task is to find 3 recent, significant news headlines for ${context.companyProfile.name} (${ticker}). For each, provide the title, a direct link (href), and a brief snippet. You MUST call the "submit_recent_news" function with the list of articles.`,
                tools: ['web_search', 'fetch_page_content', 'submit_recent_news'],
                submitFunction: 'submit_recent_news'
            },
            'Consensus': {
                prompt: (ticker, context) => `Your current task is to find the analyst consensus for ${context.companyProfile.name} (${ticker}). Find the overall rating (e.g., "Buy", "Hold", "Strong Buy") and the average analyst price target. You MUST call the "submit_analyst_consensus" function with this data.`,
                tools: ['web_search', 'fetch_page_content', 'submit_analyst_consensus'],
                submitFunction: 'submit_analyst_consensus'
            }
        };

        const proxy = 'https://api.allorigins.win/raw?url=';
        async function doSearch(q) { const r = await fetch(proxy + encodeURIComponent('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q))); if (!r.ok) throw new Error('Search fetch failed: ' + r.status); const t = await r.text(); const p = new DOMParser(); const d = p.parseFromString(t, 'text/html'); const l = [...d.querySelectorAll('a.result__a')].slice(0, 5); const s = [...d.querySelectorAll('a.result__snippet')].slice(0, 5); return l.map((a, i) => ({ title: a.textContent.trim(), href: a.href, snippet: s[i]?.textContent.trim() || '' })); }
        async function fetchPageText(url) { try { const r = await fetch(proxy + encodeURIComponent(url)); if (!r.ok) throw new Error('Page fetch failed: ' + r.status); const h = await r.text(); const p = new DOMParser(); const d = p.parseFromString(h, 'text/html'); [...d.querySelectorAll('script, style, noscript, iframe, meta, link, [hidden]')].forEach(el => el.remove()); return d.body.innerText.trim() || 'No visible text found.'; } catch (e) { return 'Error fetching page: ' + e.message; } }

        const handleToolCall = async (functionName, args) => {
            if (functionName === 'submit_company_profile') {
                reportData.value.companyProfile = { ...reportData.value.companyProfile, ...args };
                return { success: true };
            }
            // DYNAMIC: Handle the new chart tool
            if (functionName === 'submit_chart_data') {
                const newChart = {
                    id: `chart_${Date.now()}_${Math.random()}`,
                    title: args.title,
                    type: args.chartType,
                    data: {
                        labels: args.labels,
                        datasets: [{ label: args.datasetLabel, data: args.datasetData }]
                    }
                };
                reportData.value.charts.push(newChart);
                return { success: true, message: `Chart "${args.title}" created.`};
            }
            if (functionName === 'submit_valuation_metrics') {
                reportData.value.valuation = { ...reportData.value.valuation, ...args };
                return { success: true };
            }
            if (functionName === 'submit_recent_news') {
                reportData.value.news = args.news_data || [];
                return { success: true };
            }
            if (functionName === 'submit_analyst_consensus') {
                reportData.value.analystConsensus = { ...reportData.value.analystConsensus, ...args };
                return { success: true };
            }
            if (functionName === 'web_search') {
                try {
                    const searchResults = await doSearch(args.query);
                    return { success: true, data: { results: searchResults } };
                } catch (e) { return { success: false, message: e.message }; }
            }
            if (functionName === 'fetch_page_content') {
                const pageText = await fetchPageText(args.url);
                if (pageText.startsWith('Error')) return { success: false, message: pageText };
                return { success: true, data: { content: pageText.substring(0, 20000) } };
            }
            return { success: false, message: `Unknown function: ${functionName}` };
        };

        const startAnalysis = () => {
            if (activeTicker.value && !isLoading.value) {
                generateReportForTicker(activeTicker.value);
            }
        };

        const handleSendMessage = async () => {
          const txt = newMessageText.value.trim().toUpperCase();
          if (!txt || isLoading.value) return;

          if (!tickerList.value.includes(txt)) {
              tickerList.value.unshift(txt);
          }
          await selectTicker(txt, true);
          newMessageText.value = '';
        };

        async function executeStep(stepName, ticker, currentReportData) {
            const stepConfig = analysisStepsConfig[stepName];
            if (!stepConfig) throw new Error(`Config for step "${stepName}" not found.`);

            const stepRef = reportData.value.activeSteps.find(s => s.name === stepName);
            const promptText = stepConfig.prompt(ticker, currentReportData);
            const toolsForStep = { functionDeclarations: stepConfig.tools.map(name => toolDefinitions[name]) };

            let history = [{ role: 'user', parts: [{ text: promptText }] }];

            for (let i = 0; i < 10; i++) {
                if (stepRef) stepRef.currentTool = null; // AI is "thinking"

                const payload = { contents: history, tools: [toolsForStep] };
                const resp = await fetch(apiUrl.value, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!resp.ok) {
                    const errData = await resp.json().catch(() => ({ error: { message: "API error" } }));
                    throw new Error(errData.error?.message || `Error: ${resp.status}`);
                }
                const data = await resp.json();
                if (!data.candidates?.[0]?.content?.parts) {
                    // This can happen if the AI decides it's done. If the step has no single submit function, this is OK.
                    if (!stepConfig.submitFunction) return;
                    throw new Error("Invalid AI response structure.");
                }

                const parts = data.candidates[0].content.parts;
                const funcCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);

                if (funcCalls.length > 0) {
                    // For steps with a single, required submission function
                    if (stepConfig.submitFunction) {
                        const submissionCall = funcCalls.find(fc => fc.name === stepConfig.submitFunction);
                        if (submissionCall) {
                            if (stepRef) stepRef.currentTool = submissionCall.name;
                            await handleToolCall(submissionCall.name, submissionCall.args);
                            return; // Step successfully completed
                        }
                    }

                    // For all tool calls (including multi-call steps)
                    const toolResponses = [];
                    for (const funcCall of funcCalls) {
                        if (stepRef) stepRef.currentTool = funcCall.name;

                        if (funcCall.name === 'fetch_page_content' && funcCall.args.url) {
                            const fullProxyUrl = proxy + encodeURIComponent(funcCall.args.url);
                            if (stepRef && !stepRef.sources.includes(fullProxyUrl)) {
                                stepRef.sources.push(fullProxyUrl);
                            }
                        }

                        const funcRes = await handleToolCall(funcCall.name, funcCall.args);
                        toolResponses.push({ functionResponse: { name: funcCall.name, response: { name: funcCall.name, content: funcRes } } });
                    }
                    history.push({ role: 'model', parts: funcCalls.map(fc => ({ functionCall: fc })) });
                    history.push({ role: 'tool', parts: toolResponses });
                } else {
                    // AI responded with text instead of a tool call.
                    // If the step was expecting a submission, it's an error.
                    if (stepConfig.submitFunction) {
                        const textResponse = parts.map(p => p.text).join('').trim();
                        throw new Error(`The AI did not call function '${stepConfig.submitFunction}'. Response: "${textResponse || '[empty]'}"`);
                    } else {
                        // For multi-call steps, this means the AI is done with this step.
                        return;
                    }
                }
            }
            // If the loop finishes, it means the turn limit was hit.
            if(stepConfig.submitFunction) {
                throw new Error(`The AI failed to complete the task by calling '${stepConfig.submitFunction}' within the 10-turn limit.`);
            }
        }

        const generateReportForTicker = async (ticker) => {
          if (!ticker || isLoading.value) return;

          activeTicker.value = ticker;
          resetState();
          reportData.value.status = 'loading';
          reportData.value.companyProfile.ticker = ticker;
          await nextTick();
          chatContainerRef.value.scrollTop = 0;

          const stepsToRun = reportData.value.activeSteps.filter(s => s.name !== 'Finalizing');
          try {
            for (const step of stepsToRun) {
                const stepRef = reportData.value.activeSteps.find(s => s.name === step.name);
                if (stepRef) stepRef.status = 'running';

                await executeStep(step.name, ticker, reportData.value);

                if (stepRef) {
                  stepRef.status = 'success';
                  stepRef.currentTool = null;
                }
            }
            const finalizingStep = reportData.value.activeSteps.find(s => s.name === 'Finalizing');
            if (finalizingStep) finalizingStep.status = 'success';
            reportData.value.status = 'complete';

          } catch (err) {
            console.error('Analysis Error:', err);
            reportData.value.status = 'error';
            reportData.value.errorMessage = err.message;
            const runningStep = reportData.value.activeSteps.find(s => s.status === 'running');
            if(runningStep) {
              runningStep.status = 'error';
              runningStep.currentTool = null;
            }
          }
        };

        const loadReportFromGist = async (gistId) => {
            resetState();
            reportData.value.status = 'loading';
            try {
                const response = await fetch(`https://api.github.com/gists/${gistId}`);
                if (!response.ok) {
                    throw new Error(`Gist fetch failed: ${response.status}`);
                }
                const gistData = await response.json();
                const jsonFile = Object.values(gistData.files).find(f => f.filename.endsWith('_data.json'));
                if (!jsonFile) {
                    throw new Error('Could not find JSON data in Gist.');
                }
                const loadedReportData = JSON.parse(jsonFile.content);
                reportData.value = loadedReportData;
                reportData.value.status = 'complete';
            } catch (error) {
                console.error('Failed to load from Gist:', error);
                reportData.value.status = 'error';
                reportData.value.errorMessage = `Failed to load from Gist: ${error.message}`;
            }
        };

        // --- Ticker Management Functions ---
        const addTicker = () => {
          const newTicker = prompt("Enter a stock ticker to add:");
          if (newTicker) {
            const formattedTicker = newTicker.trim().toUpperCase();
            if (formattedTicker && !tickerList.value.includes(formattedTicker)) {
              tickerList.value.unshift(formattedTicker);
              selectTicker(formattedTicker);
            } else if (tickerList.value.includes(formattedTicker)) {
              selectTicker(formattedTicker);
            }
          }
        };
        const removeTicker = (tickerToRemove) => {
          tickerList.value = tickerList.value.filter(t => t !== tickerToRemove);
          if (activeTicker.value === tickerToRemove) {
            if (tickerList.value.length > 0) {
              selectTicker(tickerList.value[0]);
            } else {
              activeTicker.value = '';
              resetState();
            }
          }
          // Also remove from gists
          if (gistLinks.value[tickerToRemove]) {
              delete gistLinks.value[tickerToRemove];
              localStorage.setItem(LS_GISTS_KEY, JSON.stringify(gistLinks.value));
          }
        };
        const selectTicker = (ticker, startNow = false) => {
            if (isLoading.value) return;

            activeTicker.value = ticker;
            const gistId = gistLinks.value[ticker];

            if (gistId) {
                loadReportFromGist(gistId);
            } else {
                resetState();
                if (startNow) {
                    generateReportForTicker(ticker);
                }
            }
        };

        const LS_GISTS_KEY = 'stocksight_gists_v1';
        const gistLinks = ref({});

        const generateReportText = () => {
            const { companyProfile, valuation, news, analystConsensus } = reportData.value;
            let text = `Stock Analysis for ${companyProfile.name} (${companyProfile.ticker})\n\n`;
            text += `Sector: ${companyProfile.sector}\n\n`;
            text += `== Company Overview ==\n${companyProfile.description}\n\n`;
            text += `== Key Valuation Metrics ==\n`;
            text += `P/E Ratio: ${valuation.peRatio}\n`;
            text += `Industry P/E: ${valuation.industryPe}\n`;
            text += `P/S Ratio: ${valuation.psRatio}\n`;
            text += `Industry P/S: ${valuation.industryPs}\n\n`;
            text += `== Recent News ==\n`;
            news.forEach(item => {
                text += `- ${item.title}\n  ${item.href}\n`;
            });
            text += `\n== Analyst Consensus ==\n`;
            text += `Rating: ${analystConsensus.rating}\n`;
            text += `Price Target: ${analystConsensus.priceTarget}\n`;
            return text;
        };

        const downloadAsTxt = () => {
            const text = generateReportText();
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activeTicker.value}_analysis.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        const saveAsGist = async () => {
            if (!githubToken.value) {
                alert('Please set your GitHub token in the settings.');
                return;
            }
            const reportText = generateReportText();
            const reportJson = JSON.stringify(reportData.value, null, 2);

            try {
                const response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${githubToken.value}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        description: `Stock Analysis for ${activeTicker.value}`,
                        public: false,
                        files: {
                            [`${activeTicker.value}_analysis.md`]: {
                                content: reportText
                            },
                            [`${activeTicker.value}_data.json`]: {
                                content: reportJson
                            }
                        }
                    })
                });
                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status}`);
                }
                const data = await response.json();
                gistLinks.value[activeTicker.value] = data.id;
                localStorage.setItem(LS_GISTS_KEY, JSON.stringify(gistLinks.value));
                alert(`Gist saved successfully! URL: ${data.html_url}`);
            } catch (error) {
                alert(`Failed to save Gist: ${error.message}`);
            }
        };

        onMounted(() => {
            const savedKey = localStorage.getItem(LS_API_KEY_KEY);
            const savedModel = localStorage.getItem(LS_MODEL_NAME_KEY);
            const savedToken = localStorage.getItem(LS_GITHUB_TOKEN_KEY);

            if (savedKey) apiKey.value = savedKey;
            if (savedModel) modelName.value = savedModel;
            if (savedToken) githubToken.value = savedToken;

            if (!apiKey.value) openSettingsModal();

            const savedTickers = localStorage.getItem(LS_TICKERS_KEY);
            if (savedTickers) {
                tickerList.value = JSON.parse(savedTickers);
            } else {
                tickerList.value = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];
            }

            const savedGists = localStorage.getItem(LS_GISTS_KEY);
            if (savedGists) {
                gistLinks.value = JSON.parse(savedGists);
            }

            if (tickerList.value.length > 0) {
                selectTicker(tickerList.value[0]);
            }
        });

        onUnmounted(() => {
          Object.values(chartInstances.value).forEach(chart => chart.destroy());
        });

        watch(tickerList, (newVal) => {
            localStorage.setItem(LS_TICKERS_KEY, JSON.stringify(newVal));
        }, { deep: true });

        return {
            reportData, isLoading, newMessageText, chatContainerRef, handleSendMessage, resetState, startAnalysis,
            stepStatusMap, toolIconMap,
            showSettingsModal, settingsModel, settingsApiKey, settingsGithubToken, openSettingsModal, closeSettingsModal, saveSettings,
            chartRefs,
            tickerList, activeTicker, addTicker, removeTicker, selectTicker,
            openAccordions, toggleAccordion, getRealUrl, formatUrl,
            downloadAsTxt, saveAsGist
        };
      }
    }).mount('#app');
