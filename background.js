const API_URL = "http://localhost:8080/api/browser";
let currentTabUrl = null;
let currentCategory = null;
let startTime = null;
let scrollCount = 0;
let currentUserUuid = null;

console.log("MindHaven extension started");

async function loadUserUuid() {
    try {
        const response = await fetch("http://localhost:8765/session");
        const data = await response.json();
        currentUserUuid = data.userUuid;
        console.log("UUID loaded:", currentUserUuid);
    } catch(error) {
        console.error("Cannot load UUID", error);
    }
}

loadUserUuid();

chrome.tabs.onActivated.addListener(
    async (activeInfo) => {
        try {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            handleTabChange(tab);
        }
        catch(error) {
            console.error(error);
        }
    }
);

chrome.tabs.onUpdated.addListener(
    async (tabId, changeInfo, tab) => {
        if(changeInfo.status === "complete" && tab.active)
        {
            handleTabChange(tab);
        }
    }
);

let accumulatedSeconds = 0;

function handleTabChange(tab)
{
    if(!tab.url)
        return;
    const blockedPageUrl = chrome.runtime.getURL("blocked.html");
    if (tab.url.startsWith(blockedPageUrl)) {
        return; 
    }
    if(currentTabUrl !== null && accumulatedSeconds > 0)
    {
        // send data to backend
        sendBrowserActivity(currentTabUrl, "DETERMINED_BY_BACKEND", accumulatedSeconds, scrollCount);
    }
    currentTabUrl = tab.url;
    startTime = Date.now();
    scrollCount = 0;
    accumulatedSeconds = 0;
    console.log("Active URL:", currentTabUrl);
}

setInterval(async () => {
    if (!currentUserUuid || currentTabUrl === null) return;
    const blockedPageUrl = chrome.runtime.getURL("blocked.html");
    if (currentTabUrl.startsWith(blockedPageUrl)) return;
    const now = Date.now();
    const deltaSeconds = Math.floor((now - startTime) / 1000);
    if (deltaSeconds > 0) {
        accumulatedSeconds += deltaSeconds;
        startTime = now; 
    }
    if (accumulatedSeconds >= 30) {
        console.log(`[Full Buffer] 30 seconds reached on ${currentTabUrl}. Sending data to backend.`);
        sendBrowserActivity(currentTabUrl, "DETERMINED_BY_BACKEND", accumulatedSeconds, scrollCount);
        accumulatedSeconds = 0;
        scrollCount = 0;
    }
}, 10000);

chrome.runtime.onMessage.addListener(
    (message) => {
        if(message.type === "SCROLL_EVENT")
        {
            scrollCount += message.scrollDelta;
            console.log("Scroll count:", scrollCount);
        }
    }
);

async function sendBrowserActivity(url, category, durationSeconds, scrollCountValue)
{
    try {
        const body = {
            userUuid: currentUserUuid,
            url: url,
            category: category,
            durationSeconds: durationSeconds,
            scrollCount: scrollCountValue
        };
        console.log("Sending activity:", body);
        const response =
            await fetch(
                API_URL,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                }
            );
        console.log("Backend status:", response.status);
        const text = await response.text();
        console.log("Backend response:", text);
    }
    catch(error)
    {
        console.error("Error sending activity:", error);
    }
}

function extractDomain(rawUrl) {
    try {
        const urlObj = new URL(rawUrl);
        let hostname = urlObj.hostname.toLowerCase();
        
        if (hostname.startsWith("www.")) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        return null;
    }
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    const url = details.url;
    if (url.startsWith('chrome-extension:')) return;
    const domain = extractDomain(url);
    if (!domain) return;

    try {
        const userUuid = currentUserUuid;

        if (!userUuid) {
            console.warn("MindHaven: UUID not loaded yet. Skipping backend evaluation.");
            return;
        }

        console.log(`[PRE-NAVIGATE] Intercepted URL: ${url}. Verifying domain: ${domain}`);

        const response = await fetch(`http://localhost:8080/rules/evaluate/${userUuid}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userUuid: userUuid,
                domain: domain,
                category: "DETERMINED_BY_BACKEND",
                currentTime: new Date().toTimeString().split(' ')[0], // Format HH:mm:ss
                currentDate: new Date().toISOString().split('T')[0]   // Format YYYY-MM-DD
            })
        });

        if (!response.ok) throw new Error("Error communicating with the server.");

        const decision = await response.json();

        if (decision.blocked) {
            console.log(`[BLOCKED] Instant redirect for tab ${details.tabId} -> ${decision.reason}`);
            chrome.tabs.update(details.tabId, {
                url: chrome.runtime.getURL("blocked.html?reason=" + encodeURIComponent(decision.reason))
            });
        }
    } catch (error) {
        console.error("Error in pre-navigate flow:", error);
    }
});

chrome.alarms.create("checkActiveTabRule", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "checkActiveTabRule" && currentUserUuid) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!activeTab || !activeTab.url) return;

        const blockedPageUrl = chrome.runtime.getURL("blocked.html");
        if (activeTab.url.startsWith(blockedPageUrl)) return;

        try {
            const urlObj = new URL(activeTab.url);
            const domain = urlObj.hostname;

            const response = await fetch(`http://localhost:8080/rules/evaluate/${currentUserUuid}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userUuid: currentUserUuid,
                    domain: domain,
                    category: "DETERMINED_BY_BACKEND",
                    currentTime: new Date().toTimeString().split(' ')[0],
                    currentDate: new Date().toISOString().split('T')[0]
                })
            });

            if (response.ok) {
                const decision = await response.json();
                if (decision.blocked) {
                    console.log(`[Time Window] End time reached for ${domain}. Redirecting...`);
                    chrome.tabs.update(activeTab.id, {
                        url: chrome.runtime.getURL("blocked.html?reason=" + encodeURIComponent(decision.reason))
                    });
                }
            }
        } catch (error) {
            console.error("Error checking time window rule:", error);
        }
    }
});