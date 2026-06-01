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

function handleTabChange(tab)
{
    if(!tab.url)
        return;
    const now = Date.now();
    if(currentTabUrl !== null)
    {
        const durationSeconds = Math.floor((now - startTime)/1000);
        // send data to backend
        sendBrowserActivity(currentTabUrl, currentCategory, durationSeconds, scrollCount);
    }
    currentTabUrl = tab.url;
    currentCategory = classifyUrl(tab.url);
    startTime = now;
    scrollCount = 0;
    console.log("Active URL:", currentTabUrl);
    console.log("Category:", currentCategory);
}

function classifyUrl(url)
{
    if(!url)
        return "OTHER";
    url = url.toLowerCase();

    if(url.includes("youtube"))
        return "VIDEO";

    if(url.includes("facebook") || url.includes("instagram") || url.includes("reddit") || url.includes("twitter") || url.includes("tiktok"))
        return "SOCIAL";

    if(url.includes("github") || url.includes("stackoverflow"))
        return "PRODUCTIVITY";

    if(url.includes("netflix") || url.includes("twitch"))
        return "ENTERTAINMENT";

    if(url.includes("udemy") || url.includes("coursera"))
        return "EDUCATION";

    return "OTHER";
}

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