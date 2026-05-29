let lastScrollY = window.scrollY;

window.addEventListener(
    "scroll",
    () => {
        const currentScrollY = window.scrollY;
        const delta = Math.abs(currentScrollY - lastScrollY);
        lastScrollY = currentScrollY;
        chrome.runtime.sendMessage({
            type: "SCROLL_EVENT",
            scrollDelta: delta
        });
    }
);

console.log("MindHaven content script loaded");

console.log("chrome =", chrome);

console.log("chrome.runtime =", chrome.runtime);