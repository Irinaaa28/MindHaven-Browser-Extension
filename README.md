# MindHaven Browser Extension

This is the browser extension of the MindHaven App.  
The link for the MindHaven repo is here: https://github.com/Irinaaa28/MindHaven

## Overview
MindHaven is a digital behavior management platform designed to help users control and monitor their online activity. The system allows users to define rules that restrict access to certain domains, categories, or time intervals, while also monitoring activity and generating behavioral insights.  

In order to track the online activity from browsers, MindHaven has its own browser extension, available for Chrome and Edge.

## Components
The main components of MindHaven Browser extension are:
* manifest.json
* background.js
* content.js
  
It also has popup.html, popup.js and styles.css for UI.

### manifest.json
This is main file, the blueprint of the extension. It defines permissions which allow the extension to read URLs and tabs and to detect the active tab for all the sites.

### background.js
It runs permanently in browser, monitoring tab switching, URL changes and active tab. It also sends data to backend for the behavioral engine. The browser notifies the extension when the user changes the tab.

### content.js
It is injected in tabs, monitoring scrolls, clicks and user activity.

## Technology Stack
* Manifest v3
* HTML
* CSS
* JavaScript
