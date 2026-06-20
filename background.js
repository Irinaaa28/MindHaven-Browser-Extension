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
        sendBrowserActivity(currentTabUrl, "DETERMINED_BY_BACKEND", durationSeconds, scrollCount);
    }
    currentTabUrl = tab.url;
    startTime = now;
    scrollCount = 0;
    console.log("Active URL:", currentTabUrl);
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

// Funcție helper pentru izolarea domeniului pur (ex: youtube.com)
function extractDomain(rawUrl) {
    try {
        const urlObj = new URL(rawUrl);
        let hostname = urlObj.hostname.toLowerCase();
        
        // Eliminăm prefixul standard www. pentru a se potrivi cu baza de date
        if (hostname.startsWith("www.")) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        return null;
    }
}

// Folosim onBeforeNavigate: se declanșează fix când utilizatorul apasă Enter sau dă click pe link
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // 1. Ignorăm sub-frame-urile (iframe-uri din pagină, reclame etc.) ca să nu blocăm redundant
    if (details.frameId !== 0) return;

    const url = details.url;

    // 2. IMPORTANT: Prevenim bucla infinită. Dacă URL-ul este deja pagina noastră locală de blocare, nu facem nimic
    if (url.startsWith('chrome-extension:')) return;

    const domain = extractDomain(url);
    if (!domain) return;

    try {
        // 3. Preluăm UUID-ul stocat local în extensie
        const userUuid = currentUserUuid;

        if (!userUuid) {
            console.warn("MindHaven: UUID-ul nu a fost găsit în storage. Trecere permisă.");
            return;
        }

        console.log(`[PRE-NAVIGATE] Interceptat URL: ${url}. Verificăm domeniul: ${domain}`);

        // 4. Trimitem cererea asincronă către backend (Spring Boot)
        // Înainte ca această promisiune să fie rezolvată, browserul va încerca să încarce, 
        // dar prin apelul rapid de mai jos vom suprascrie tabul înainte de randare.
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

        if (!response.ok) throw new Error("Eroare la comunicarea cu serverul.");

        const decision = await response.json();

        // 5. Evaluăm decizia. Dacă este BLOCAT, schimbăm instant destinația tabului curent
        if (decision.blocked) {
            console.log(`[BLOCAT] Redirecționare instantanee pentru tabul ${details.tabId} -> ${decision.reason}`);
            
            // Această comandă suprascrie navigarea aflată în curs de desfășurare în browser
            chrome.tabs.update(details.tabId, {
                url: chrome.runtime.getURL("blocked.html?reason=" + encodeURIComponent(decision.reason))
            });
        }
    } catch (error) {
        console.error("Eroare în fluxul de pre-navigare:", error);
    }
});