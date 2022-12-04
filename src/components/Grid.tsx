import React from "react";
import { withTranslation } from "react-i18next";
import semver from "semver";
import { Option } from "react-dropdown";

import { CardItem, CardType, Config, SchemeIni, Snippet, TabItemConfig } from "../types/marketplace-types";
import { getLocalStorageDataFromKey, generateSchemesOptions, injectColourScheme, generateKey } from "../logic/Utils";
import { LOCALSTORAGE_KEYS, ITEMS_PER_REQUEST, MARKETPLACE_VERSION, LATEST_RELEASE } from "../constants";
import { openModal } from "../logic/LaunchModals";
import {
  getTaggedRepos,
  fetchExtensionManifest, fetchThemeManifest, fetchAppManifest,
  fetchCssSnippets, getBlacklist,
} from "../logic/FetchRemotes";
import LoadMoreIcon from "./Icons/LoadMoreIcon";
import LoadingIcon from "./Icons/LoadingIcon";
import SettingsIcon from "./Icons/SettingsIcon";
import ThemeDeveloperToolsIcon from "./Icons/ThemeDeveloperToolsIcon";
import SortBox from "./Sortbox";
import { TopBarContent } from "./TabBar";
import Card from "./Card/Card";
import Button from "./Button";
import DownloadIcon from "./Icons/DownloadIcon";
import Changelog from "./Modals/Changelog";

class Grid extends React.Component<
{
  title: string,
  CONFIG: Config,
  updateAppConfig: (CONFIG: Config) => void,
  // TODO: there's probably a better way to make TS not complain about the withTranslation HOC
  t: (key: string) => string,
},
{
  version: string,
  newUpdate: boolean,
  searchValue: string,
  cards: Card[],
  tabs: TabItemConfig[],
  rest: boolean,
  endOfList: boolean,
  activeThemeKey?: string,
  schemes: SchemeIni,
  activeScheme?: string | null,
}
> {
  constructor(props) {
    super(props);
    Object.assign(this, props);
    this.updateAppConfig = props.updateAppConfig.bind(this);

    // Fetches the sorting options, fetched from SortBox.js
    this.sortConfig = {
      by: getLocalStorageDataFromKey(LOCALSTORAGE_KEYS.sortBy, "top"),
    };

    this.state = {
      version: MARKETPLACE_VERSION,
      newUpdate: false,
      searchValue: "",
      cards: [],
      tabs: props.CONFIG.tabs,
      rest: true,
      endOfList: false,
      schemes: props.CONFIG.theme.schemes,
      activeScheme: props.CONFIG.theme.activeScheme,
      activeThemeKey: props.CONFIG.theme.activeThemeKey,
    };
  }

  searchRequested: boolean;
  endOfList = false;
  lastScroll = 0;
  requestQueue: never[][] = [];
  requestPage = 0;
  cardList: Card[] = [];
  sortConfig: { by: string };
  // TODO: why are these set up funny
  // To get to the other side
  gridUpdateTabs: (() => void) | null;
  gridUpdatePostsVisual: (() => void) | null;
  checkScroll: (e: Event) => void;
  CONFIG: Config;
  updateAppConfig: (CONFIG: Config) => void;
  BLACKLIST: string[] | undefined;

  // TODO: should I put this in Grid state?
  getInstalledTheme() {
    const installedThemeKey = localStorage.getItem(LOCALSTORAGE_KEYS.themeInstalled);
    if (!installedThemeKey) return null;

    const installedThemeDataStr = localStorage.getItem(installedThemeKey);
    if (!installedThemeDataStr) return null;

    const installedTheme = JSON.parse(installedThemeDataStr);
    return installedTheme;
  }

  newRequest(amount: number | undefined, query?: string) {
    this.cardList = [];
    const queue = [];
    this.requestQueue.unshift(queue);
    this.loadAmount(queue, amount, query);
  }

  /**
   * @param {CardItem} item
   * @param type The type of card
   */
  appendCard(item: CardItem | Snippet, type: CardType) {
    const card = <Card
      item={item}
      // Set key prop so items don't get stuck when switching tabs
      key={`${this.props.CONFIG.activeTab}:${item.title}`}
      CONFIG={this.CONFIG}
      visual={this.props.CONFIG.visual}
      type={type}
      // This isn't used other than to trigger a re-render
      activeThemeKey={this.state.activeThemeKey}
      // Pass along the functions to update Grid state on apply
      updateColourSchemes={this.updateColourSchemes.bind(this)}
      updateActiveTheme={this.setActiveTheme.bind(this)}
    />;

    this.cardList.push(card as unknown as Card);
    this.setState({ cards: this.cardList });
  }

  // TODO: this isn't currently used, but it will be used for sorting (based on the SortBox component)
  updateSort(sortByValue) {
    if (sortByValue) {
      this.sortConfig.by = sortByValue;
      localStorage.setItem(LOCALSTORAGE_KEYS.sortBy, sortByValue);
    }

    // this.requestPage = null;
    this.requestPage = 0;
    this.cardList = [];
    this.setState({
      cards: [],
      rest: false,
      endOfList: false,
    });
    this.endOfList = false;

    this.newRequest(ITEMS_PER_REQUEST);
  }

  updateTabs() {
    this.setState({
      tabs: [...this.props.CONFIG.tabs],
    });
  }

  updatePostsVisual() {
    this.cardList = this.cardList.map((card, index) => {
      return <Card {...card.props}
        key={index.toString()} CONFIG={this.CONFIG} />;
    }) as unknown as Card[];
    this.setState({ cards: [...this.cardList] });
  }

  switchTo(option: Option) {
    this.CONFIG.activeTab = option.value;
    localStorage.setItem(LOCALSTORAGE_KEYS.activeTab, option.value);
    this.cardList = [];
    // this.requestPage = null;
    this.requestPage = 0;
    this.setState({
      cards: [],
      rest: false,
      endOfList: false,
    });
    this.endOfList = false;

    this.newRequest(ITEMS_PER_REQUEST);
  }

  // This is called from loadAmount in a loop until it has the requested amount of cards or runs out of results
  // Returns the next page number to fetch, or null if at end
  // TODO: maybe we should rename `loadPage()`, since it's slightly confusing when we have github pages as well
  async loadPage(queue: never[], query?: string) {
    switch (this.CONFIG.activeTab) {
    case "Extensions": {
      const pageOfRepos = await getTaggedRepos("spicetify-extensions", this.requestPage, this.BLACKLIST, query);
      for (const repo of pageOfRepos.items) {
        const extensions = await fetchExtensionManifest(
          repo.contents_url,
          repo.default_branch,
          repo.stargazers_count,
          this.CONFIG.visual.hideInstalled,
        );

        // I believe this stops the requests when switching tabs?
        if (this.requestQueue.length > 1 && queue !== this.requestQueue[0]) {
          // Stop this queue from continuing to fetch and append to cards list
          return -1;
        }

        if (extensions && extensions.length) {
          // console.log(`${repo.name} has ${extensions.length} extensions:`, extensions);
          extensions.forEach((extension) => {
            Object.assign(extension, { lastUpdated: repo.pushed_at });
            this.appendCard(extension, "extension");
          });
        }
      }

      // First result is null or -1 so it coerces to 1
      const currentPage = this.requestPage > -1 && this.requestPage ? this.requestPage : 1;
      // Sets the amount of items that have thus been fetched
      const soFarResults = ITEMS_PER_REQUEST * (currentPage - 1) + pageOfRepos.page_count;
      const remainingResults = pageOfRepos.total_count - soFarResults;

      // If still have more results, return next page number to fetch
      console.log(`Parsed ${soFarResults}/${pageOfRepos.total_count} extensions`);
      if (remainingResults > 0) return currentPage + 1;
      else console.log("No more extension results");
      break;
    } case "Installed": {
      const installedStuff = {
        theme: getLocalStorageDataFromKey(LOCALSTORAGE_KEYS.installedThemes, []),
        extension: getLocalStorageDataFromKey(LOCALSTORAGE_KEYS.installedExtensions, []),
        snippet: getLocalStorageDataFromKey(LOCALSTORAGE_KEYS.installedSnippets, []),
      };

      for (const type in installedStuff) {
        if (installedStuff[type].length) {
          installedStuff[type].forEach(async (itemKey) => {
            // TODO: err handling
            const extension = getLocalStorageDataFromKey(itemKey);
            // I believe this stops the requests when switching tabs?
            if (this.requestQueue.length > 1 && queue !== this.requestQueue[0]) {
              // Stop this queue from continuing to fetch and append to cards list
              return -1;
            }

            this.appendCard(extension, type as CardType);
          });
        }
      }
      break;

      // Don't need to return a page number because
      // installed extension do them all in one go, since it's local
    } case "Themes": {
      const pageOfRepos = await getTaggedRepos("spicetify-themes", this.requestPage, this.BLACKLIST, query);
      for (const repo of pageOfRepos.items) {

        const themes = await fetchThemeManifest(
          repo.contents_url,
          repo.default_branch,
          repo.stargazers_count,
        );
        // I believe this stops the requests when switching tabs?
        if (this.requestQueue.length > 1 && queue !== this.requestQueue[0]) {
          // Stop this queue from continuing to fetch and append to cards list
          return -1;
        }

        if (themes && themes.length) {
          themes.forEach((theme) => {
            Object.assign(theme, { lastUpdated: repo.pushed_at });
            this.appendCard(theme, "theme");
          });
        }
      }

      // First request is null, so coerces to 1
      const currentPage = this.requestPage > -1 && this.requestPage ? this.requestPage : 1;
      // -1 because the page number is 1-indexed
      const soFarResults = ITEMS_PER_REQUEST * (currentPage - 1) + pageOfRepos.page_count;
      const remainingResults = pageOfRepos.total_count - soFarResults;

      console.log(`Parsed ${soFarResults}/${pageOfRepos.total_count} themes`);
      if (remainingResults > 0) return currentPage + 1;
      else console.log("No more theme results");
      break;
    } case "Apps": {
      const pageOfRepos = await getTaggedRepos("spicetify-apps", this.requestPage, this.BLACKLIST, query);
      for (const repo of pageOfRepos.items) {

        const apps = await fetchAppManifest(
          repo.contents_url,
          repo.default_branch,
          repo.stargazers_count,
        );
        // I believe this stops the requests when switching tabs?
        if (this.requestQueue.length > 1 && queue !== this.requestQueue[0]) {
          // Stop this queue from continuing to fetch and append to cards list
          return -1;
        }

        if (apps && apps.length) {
          apps.forEach((app) => {
            Object.assign(app, { lastUpdated: repo.pushed_at });
            this.appendCard(app, "app");
          });
        }
      }

      // First request is null, so coerces to 1
      const currentPage = this.requestPage > -1 && this.requestPage ? this.requestPage : 1;
      // -1 because the page number is 1-indexed
      const soFarResults = ITEMS_PER_REQUEST * (currentPage - 1) + pageOfRepos.page_count;
      const remainingResults = pageOfRepos.total_count - soFarResults;

      console.log(`Parsed ${soFarResults}/${pageOfRepos.total_count} apps`);
      if (remainingResults > 0) return currentPage + 1;
      else console.log("No more app results");
      break;
    } case "Snippets": {
      const snippets = await fetchCssSnippets();

      if (this.requestQueue.length > 1 && queue !== this.requestQueue[0]) {
        // Stop this queue from continuing to fetch and append to cards list
        return -1;
      }
      if (snippets && snippets.length) {
        snippets.forEach((snippet) => this.appendCard(snippet, "snippet"));
      }
    }}

    this.setState({ rest: true, endOfList: true });
    this.endOfList = true;

    return 0;
  }
  /**
   * Load a new set of extensions
   * @param {any} queue An array of the extensions to be loaded
   * @param {number} [quantity] Amount of extensions to be loaded per page. (Defaults to ITEMS_PER_REQUEST constant)
   */
  async loadAmount(queue: never[], quantity: number = ITEMS_PER_REQUEST, query?: string) {
    this.setState({ rest: false });
    quantity += this.cardList.length;

    this.requestPage = await this.loadPage(queue, query);

    while (
      this.requestPage &&
      this.requestPage !== -1 &&
      this.cardList.length < quantity &&
      !this.state.endOfList
    ) {
      this.requestPage = await this.loadPage(queue, query);
    }

    if (this.requestPage === -1) {
      this.requestQueue = this.requestQueue.filter(a => a !== queue);
      return;
    }

    // Remove this queue from queue list
    this.requestQueue.shift();
    this.setState({ rest: true });
  }

  /**
   * Load more items if there are more items to load.
   * @returns {void}
   */
  loadMore() {
    if (this.state.rest && !this.endOfList) {
      this.loadAmount(this.requestQueue[0], ITEMS_PER_REQUEST);
    }
  }

  /**
   * Update the colour schemes in the state + dropdown, and inject the active one
   * @param schemes Object with the colour schemes
   * @param activeScheme The name of the active colour scheme (a key in the schemes object)
   */
  updateColourSchemes(schemes: SchemeIni, activeScheme: string | null) {
    console.log("updateColourSchemes", schemes, activeScheme);
    this.CONFIG.theme.schemes = schemes;
    this.CONFIG.theme.activeScheme = activeScheme;
    if (activeScheme) Spicetify.Config.color_scheme = activeScheme;

    if (schemes && activeScheme && schemes[activeScheme]) {
      injectColourScheme(this.CONFIG.theme.schemes[activeScheme]);
    } else {
      // Reset schemes if none sent
      injectColourScheme(null);
    }

    // Save to localstorage
    const installedThemeKey = getLocalStorageDataFromKey(LOCALSTORAGE_KEYS.themeInstalled);
    const installedThemeData = getLocalStorageDataFromKey(installedThemeKey);
    if (installedThemeData) {
      installedThemeData.activeScheme = activeScheme;
      console.log(installedThemeData);
      localStorage.setItem(installedThemeKey, JSON.stringify(installedThemeData));
    } else {
      console.log("No installed theme data");
    }

    this.setState({
      schemes,
      activeScheme,
    });
  }

  /**
   * The componentDidMount() method is called when the component is first loaded.
   * It checks if the cardList is already loaded. If it is, it checks if the lastScroll value is
   greater than 0.
  * If it is, it scrolls to the lastScroll value. If it isn't, it scrolls to the top of the page.
  * If the cardList isn't loaded, it loads the cardList.
  */
  async componentDidMount() {
    // Checks for new Marketplace updates
    fetch(LATEST_RELEASE).then(res => res.json()).then(
      result => {
        this.setState({
          version: result[0].name,
        });

        try {
          this.setState({ newUpdate: semver.gt(this.state.version, MARKETPLACE_VERSION) });
        } catch (err) {
          console.error(err);
        }
      },
      error => {
        console.error("Failed to check for updates", error);
      },
    );

    Changelog();

    this.gridUpdateTabs = this.updateTabs.bind(this);
    this.gridUpdatePostsVisual = this.updatePostsVisual.bind(this);

    const viewPort = document.querySelector(".os-viewport");
    this.checkScroll = this.isScrolledBottom.bind(this);
    if (viewPort) {
      viewPort.addEventListener("scroll", this.checkScroll);
      if (this.cardList.length) { // Already loaded
        if (this.lastScroll > 0) {
          viewPort.scrollTo(0, this.lastScroll);
        }
        return;
      }
    }

    // Load blacklist
    this.BLACKLIST = await getBlacklist();
    this.newRequest(ITEMS_PER_REQUEST);
  }

  /**
   * When the component is unmounted, remove the scroll event listener.
   * @returns {void}
   */
  componentWillUnmount(): void {
    this.gridUpdateTabs = this.gridUpdatePostsVisual = null;
    const viewPort = document.querySelector(".os-viewport");
    if (viewPort) {
      this.lastScroll = viewPort.scrollTop;
      viewPort.removeEventListener("scroll", this.checkScroll);
    }
  }

  /**
   * If the user has scrolled to the bottom of the page, load more posts.
   * @param event - The event object that is passed to the callback function.
   */
  // Add scroll event listener with type
  isScrolledBottom(event: Event): void {
    const viewPort = event.target as HTMLElement;
    if ((viewPort.scrollTop + viewPort.clientHeight) >= viewPort.scrollHeight) {
      // At bottom, load more posts
      this.loadMore();
    }
  }

  setActiveTheme(themeKey: string) {
    this.CONFIG.theme.activeThemeKey = themeKey;
    this.setState({ activeThemeKey: themeKey });
  }

  // TODO: clean this up. It worked when I was using state, but state seems like pointless overhead.
  getActiveScheme() {
    return this.state.activeScheme;
  }

  handleSearch(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      this.setState({ endOfList: false });
      this.newRequest(ITEMS_PER_REQUEST, this.state.searchValue.trim().toLowerCase());
      this.searchRequested = true;
    } else if ( // Refreshes result when user deletes all queries
      ((event.key === "Backspace") || (event.key === "Delete")) &&
        this.searchRequested &&
        this.state.searchValue.trim() === "") {
      this.setState({ endOfList: false });
      this.newRequest(ITEMS_PER_REQUEST, this.state.searchValue.trim().toLowerCase());
      this.searchRequested = false;
    }
  }

  render() {
    const { t } = this.props;
    return (
      <section className="contentSpacing">
        <div className="marketplace-header">
          <div className="marketplace-header__left">
            <h1>{this.props.title}</h1>
            {this.state.newUpdate
              ? <button type="button" title={t("grid.newUpdate")} className="marketplace-header-icon-button" id="marketplace-update"
                onClick={() => window.location.href = "https://github.com/spicetify/spicetify-marketplace"}
              >
                <DownloadIcon />
                &nbsp;{this.state.version}
              </button>
              : null}
          </div>
          <div className="marketplace-header__right">
            {/* Show theme developer tools button if themeDevTools is enabled */}
            {this.CONFIG.visual.themeDevTools
              ? <button type="button" title={t("devTools.title")} className="marketplace-header-icon-button"
                onClick={() => openModal("THEME_DEV_TOOLS")}><ThemeDeveloperToolsIcon/></button>
              : null}
            {/* Show colour scheme dropdown if there is a theme with schemes installed */}
            {this.state.activeScheme ? <SortBox
              onChange={(value) => this.updateColourSchemes(this.state.schemes, value)}
              // TODO: Make this compatible with the changes to the theme install process: need to create a method to update the scheme options without a full reload.
              sortBoxOptions={generateSchemesOptions(this.state.schemes)}
              // It doesn't work when I directly use CONFIG.theme.activeScheme in the sortBySelectedFn
              // because it hardcodes the value into the fn
              sortBySelectedFn={(a) => a.key === this.getActiveScheme()} /> : null}
            <div className="searchbar--bar__wrapper">
              <input
                className="searchbar-bar"
                type="text"
                placeholder={`${t("grid.search")} ${t(`tabs.${this.CONFIG.activeTab}`)}...`}
                value={this.state.searchValue}
                onChange={(event) => {
                  this.setState({ searchValue: event.target.value });
                }}
                onKeyDown={this.handleSearch.bind(this)} />
            </div>
            <button type="button" title={t("settings.title")} className="marketplace-header-icon-button" id="marketplace-settings-button"
              onClick={() => openModal("SETTINGS", this.CONFIG, this.updateAppConfig)}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
        {/* Add a header and grid for each card type if it has any cards */}
        {[
          { handle: "extension", name: "Extensions" },
          { handle: "theme", name: "Themes" },
          { handle: "snippet", name: "Snippets" },
          { handle: "app", name: "Apps" },
        ].map((cardType) => {
          const cardsOfType = this.cardList.filter((card) => card.props.type === cardType.handle)
            .filter((card) => {
              const { searchValue } = this.state;
              const { title, user } = card.props.item;

              if (searchValue.trim() === "" ||
                title.toLowerCase().includes(searchValue.trim().toLowerCase()) ||
                user?.toLowerCase().includes(searchValue.trim().toLowerCase()))
                return card;
            })
            .map((card) => {
              // Clone the cards and update the prop to trigger re-render
              return React.cloneElement(card, {
                activeThemeKey: this.state.activeThemeKey,
                key: generateKey(card.props),
              });
            });

          if (cardsOfType.length) {
            return (
              // Add a header for the card type
              <>
                {/* Add a header for the card type */}
                <h2 className="marketplace-card-type-heading">{t(`tabs.${cardType.name}`)}</h2>
                {/* Add the grid and cards */}
                <div className="marketplace-grid main-gridContainer-gridContainer main-gridContainer-fixedWidth"
                  data-tab={this.CONFIG.activeTab}
                  data-card-type={t(`tabs.${cardType.name}`)} // This is used for the "no installed x" in css
                >
                  {cardsOfType}
                </div>
              </>
            );
          }
          return null;
        })}
        {/* Add snippets button if on snippets tab */}
        {this.CONFIG.activeTab === "Snippets"
          ? <Button classes={["marketplace-add-snippet-btn"]} onClick={() => openModal("ADD_SNIPPET")}>+ {t("grid.addCSS")}</Button>
          : null}
        <footer className="marketplace-footer">
          {!this.state.endOfList && (this.state.rest ? <LoadMoreIcon onClick={this.loadMore.bind(this)} /> : <LoadingIcon />)}
        </footer>
        <TopBarContent
          switchCallback={this.switchTo.bind(this)}
          links={this.CONFIG.tabs}
          activeLink={this.CONFIG.activeTab} />
      </section>
    );
  }
}

export default withTranslation()(Grid);
