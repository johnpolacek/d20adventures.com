/** Where the reader's choice of light or dark for the Updates pages is kept. */
export const UPDATE_THEME_KEY = "update-theme"

/**
 * Sets `data-update-theme` on <html> before the first paint: the reader's saved choice, or their system's.
 * Only the Updates pages have a light and a dark look (app/updates/updates.css).
 */
export const updateThemeScript = `(function(){var t;try{t=localStorage.getItem("${UPDATE_THEME_KEY}")}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-update-theme",t)})()`
