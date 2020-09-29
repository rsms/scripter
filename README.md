# Scripter

A Figma plugin that runs scrips directly in Figma.

[Install in Figma...](https://figma.com/c/plugin/757836922707087381/)


## Local development

- You'll need a recent release of [Nodejs](https://nodejs.org/) installed (Homebrew: `brew install nodejs`)
- First time setup: `npm install`
- Build it all and run local dev server: `./misc/dev.sh`

Notes:
- `./misc/serve.js` can be used to serve up the current "release" build in `./docs`
- `./misc/build-plugin.sh` builds the figma plugin in release mode
- `./misc/build-app.sh` builds the app in release mode into `./docs`


## Q&A


> Where are scripts stored?

Scripter stores its scripts locally on your computer, in the browser's—or Figma desktop app's—local storage, specifically IndexedDB.


> How do I download a copy of my scripts?

To download a zip archive of all your scripts, scroll to the bottom of the sidebar menu and select "Export all scripts".


> Help! My scripts are gone

Scripter stores its scripts in the browser's local storage, so if you are using a different browser you may want to open the one you used before and download your scripts to transfer them. Another possibility is that you manually deleted your browser's local storage, for example by using Chrome's "Clear Browsing Data" function.

If you are using the Figma desktop app and you didn't do any of the above, it may be a bug in Figma. If so, please reach out to Figma customer support using the "(?)" icon in the bottom right of the screen inside Figma (or email `support@figma.com`)


> Help! I can't access Scripter in Figma

If you are unable to access Figma to launch Scripter, you can visit
[`https://scripter.rsms.me/`](https://scripter.rsms.me/)
where you can browse and download your scripts. Remember to visit this website using the web browser that you used in the past for Scripter. If that was the Figma desktop app and you are unable to sign into Figma, open the desktop app's developer tools (Help → Toggle developer tools). In the "Console" enter `document.body.innerHTML="<iframe style='width:100vw;height:100vh' src='https://scripter.rsms.me/'></iframe>"` and press RETURN to load that website in Figma.
