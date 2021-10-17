# spicetify-marketplace
Download Extensions and Themes Directly from within [Spicetify](https://github.com/khanhas/spicetify-cli)

Based on the [reddit Custom App](https://github.com/khanhas/spicetify-cli/wiki/Custom-Apps#reddit)

## Basic functionality: 
1. On `index.js:pageLoad()`, calls `getAllExtensions()`, which queries the GitHub API for any repos with the "spicetify-extension" topic. We'll likely add our own tag in the future, like "spicetify-marketplace". 
2. The it loops through all the results and runs `fetchExtension()`, which fetches a `manifest.json` file from the repo's root folder. If it finds one, we generate a card based on the info. 

## manifest.json
In order to show up in the custom app, your repo needs to follow these requirements:
* Have the matching **GitHub topic tag** ("**spicetify-extension**" currently, will likely change)
* Have a **`manifest.json`** in the root folder
    * `name`: Your extension name
    * `description`: Description for your extension
    * `preview`: A path to your preview image. Must be relative to your project root
    * `main`: The filename for your extension's main js file. Must be relative to your project root
    
e.g. 
```json
{
    "name": "Spicetify-Hide-Podcasts",
    "description": "Spicetify extension to hide podcasts.",
    "preview": "screenshot.png",
    "main": "hidePodcasts.js"
}
```
If you have multiple extensions in the same repo (subfolder e.g.):
```json
[
  {
    "name": "extensionName(No .js included)",
    "description": "Spicetify extension to show how to make a manifest.",
    "preview": "filepathFromGitRepo/myExt.png",
    "main": "filepathFromGitRepo/myExt.js"
  },
  {
   "name": "extensionNameTwo(No .js included)",
   "description": "Another Spicetify extension to show how to make a manifest.",
   "preview": "filepathFromGitRepoTwo/myExtTwo.png",
   "main": "filepathFromGitRepoTwo/myExtTwo.js"
  },
]
```
_Please note that if all your extensions are in the root folder, you don't need to include a filepath._

## Styling + Build Process
- The stylesheet is built using Sass (scss) with the [Parcel](https://parceljs.org/) bundler
- The main stylesheet is style/style.scss, which builds all the components, and compiles into style.css
- For development, you can run `npm run watch` to live update the files as you save them
- For building, you can run `npm run build` to just build the style.css file once

## Notes: 
This is all still very hacky, injecting stuff into the reddit custom app, so there are a lot of leftovers that aren't needed. These will be adjusted/removed later. 
