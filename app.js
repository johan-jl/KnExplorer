/**
 * Random Knowledge Explorer - Main JavaScript Application
 * A Wikipedia article explorer with search, categories, favorites, and sharing
 */

// ===== CONFIGURATION & CONSTANTS =====
const CONFIG = {
  WIKIPEDIA_API_BASE: 'https://en.wikipedia.org/api/rest_v1',
  WIKIPEDIA_SEARCH_API: 'https://en.wikipedia.org/w/api.php',
  STORAGE_KEYS: {
    FAVORITES: 'rke_favorites',
    THEME: 'rke_theme',
    LAST_ARTICLE: 'rke_lastArticle',
    AUTO_FETCH: 'rke_autoFetch',
    VISIT_COUNT: 'rke_visitCount'
  },
  CATEGORIES: {
    history: ['history', 'historical', 'ancient', 'medieval', 'war', 'empire', 'civilization'],
    science: ['science', 'physics', 'chemistry', 'biology', 'research', 'discovery', 'theory'],
    technology: ['technology', 'computer', 'software', 'engineering', 'innovation', 'digital'],
    art: ['art', 'painting', 'sculpture', 'artist', 'museum', 'culture', 'creative'],
    geography: ['geography', 'country', 'city', 'mountain', 'river', 'continent', 'location']
  },
  RATE_LIMIT_DELAY: 1000,
  AUTO_FETCH_INTERVAL: 30000
};

// ===== APPLICATION STATE =====
class AppState {
  constructor() {
    this.currentArticle = null;
    this.favorites = this.loadFavorites();
    this.theme = this.loadTheme();
    this.isLoading = false;
    this.autoFetchEnabled = this.loadAutoFetch();
    this.autoFetchTimer = null;
    this.visitCount = this.loadVisitCount();
    this.selectedCategory = null; // Track the currently selected category
  }

  loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVORITES)) || [];
    } catch {
      return [];
    }
  }

  saveFavorites() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.FAVORITES, JSON.stringify(this.favorites));
  }

  loadTheme() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || 'light';
  }

  saveTheme() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, this.theme);
  }

  loadAutoFetch() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.AUTO_FETCH) === 'true';
  }

  saveAutoFetch() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.AUTO_FETCH, this.autoFetchEnabled);
  }

  loadVisitCount() {
    const count = parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.VISIT_COUNT)) || 0;
    const newCount = count + 1;
    localStorage.setItem(CONFIG.STORAGE_KEYS.VISIT_COUNT, newCount);
    return newCount;
  }

  saveLastArticle() {
    if (this.currentArticle) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_ARTICLE, JSON.stringify(this.currentArticle));
    }
  }

  loadLastArticle() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_ARTICLE));
    } catch {
      return null;
    }
  }
}

// ===== WIKIPEDIA API SERVICE =====
class WikipediaService {
  static async fetchRandomArticle() {
    try {
      const response = await fetch(`${CONFIG.WIKIPEDIA_API_BASE}/page/random/summary`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return this.normalizeArticleData(data);
    } catch (error) {
      console.error('Error fetching random article:', error);
      throw new Error('Failed to fetch random article');
    }
  }

  static async fetchArticleByTitle(title) {
    try {
      const encodedTitle = encodeURIComponent(title);
      const response = await fetch(`${CONFIG.WIKIPEDIA_API_BASE}/page/summary/${encodedTitle}`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return this.normalizeArticleData(data);
    } catch (error) {
      console.error('Error fetching article by title:', error);
      throw new Error('Failed to fetch article');
    }
  }

  static async searchArticles(query, limit = 10) {
    try {
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        list: 'search',
        srsearch: query,
        srlimit: limit,
        utf8: 1,
        origin: '*'
      });

      const response = await fetch(`${CONFIG.WIKIPEDIA_SEARCH_API}?${params}`);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.query?.search || [];
    } catch (error) {
      console.error('Error searching articles:', error);
      throw new Error('Failed to search articles');
    }
  }

  static async fetchCategoryArticle(category) {
    try {
      const keywords = CONFIG.CATEGORIES[category] || [category];
      const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
      
      const searchResults = await this.searchArticles(randomKeyword, 20);
      
      if (searchResults.length === 0) {
        throw new Error('No articles found for this category');
      }

      const randomResult = searchResults[Math.floor(Math.random() * Math.min(5, searchResults.length))];
      return await this.fetchArticleByTitle(randomResult.title);
    } catch (error) {
      console.error('Error fetching category article:', error);
      throw new Error('Failed to fetch category article');
    }
  }

  static normalizeArticleData(data) {
    return {
      title: data.title || 'Unknown Title',
      summary: data.extract || 'No summary available.',
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
      image: data.thumbnail?.source || data.originalimage?.source || null,
      imageAlt: `Image related to ${data.title}`,
      pageId: data.pageid,
      timestamp: new Date().toISOString(),
      wordCount: this.estimateWordCount(data.extract || ''),
      readingTime: this.estimateReadingTime(data.extract || '')
    };
  }

  static estimateWordCount(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  static estimateReadingTime(text) {
    const wordsPerMinute = 200;
    const words = this.estimateWordCount(text);
    const minutes = Math.ceil(words / wordsPerMinute);
    return minutes;
  }
}

// ===== UI CONTROLLER =====
class UIController {
  constructor(appState) {
    this.state = appState;
    this.elements = this.getElements();
    this.initializeUI();
    this.bindEvents();
  }

  getElements() {
    return {
      // Theme
      themeToggle: document.querySelector('.theme-toggle'),
      
      // Search
      searchForm: document.querySelector('.search-form'),
      searchInput: document.querySelector('.search-input'),
      
      // Categories
      categoryButtons: document.querySelectorAll('.category-btn'),
      
      // Article display
      articleSkeleton: document.querySelector('.article-skeleton'),
      articleCard: document.querySelector('.article-card'),
      articleTitle: document.querySelector('.article-title'),
      articleSummary: document.querySelector('.article-summary'),
      articleImage: document.querySelector('.article-image'),
      articleImageContainer: document.querySelector('.article-image-container'),
      readMoreLink: document.querySelector('.read-more-link'),
      readingTime: document.querySelector('.reading-time'),
      articleLength: document.querySelector('.article-length'),
      
      // Controls
      nextBtn: document.querySelector('.next-btn'),
      favoriteBtn: document.querySelector('.favorite-btn'),
      favoriteText: document.querySelector('.favorite-text'),
      shareBtn: document.querySelector('.share-btn'),
      
      // Favorites
      favoritesToggle: document.querySelector('.favorites-toggle'),
      favoritesCount: document.querySelector('.favorites-count'),
      favoritesModal: document.querySelector('.favorites-modal'),
      modalClose: document.querySelector('.modal-close'),
      favoritesList: document.querySelector('.favorites-list'),
      
      // Error state
      errorState: document.querySelector('.error-state'),
      retryBtn: document.querySelector('.retry-btn'),
      
      // Status
      statusMessage: document.querySelector('.status-message'),
      
      // Auto-fetch
      autoFetchToggle: document.querySelector('.auto-fetch-toggle')
    };
  }

  initializeUI() {
    // Set initial theme
    document.documentElement.setAttribute('data-theme', this.state.theme);
    
    // Update favorites count
    this.updateFavoritesCount();
    
    // Set auto-fetch state
    this.elements.autoFetchToggle.setAttribute('aria-pressed', this.state.autoFetchEnabled);
    this.elements.autoFetchToggle.textContent = `Auto-fetch: ${this.state.autoFetchEnabled ? 'ON' : 'OFF'}`;
    
    // Show skeleton initially
    this.showSkeleton();
    
    // Load last article if offline
    if (!navigator.onLine) {
      const lastArticle = this.state.loadLastArticle();
      if (lastArticle) {
        this.displayArticle(lastArticle);
        this.showStatus('Showing cached article (offline)', 'info');
      }
    }
  }

  bindEvents() {
    // Theme toggle
    this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
    
    // Logo click to reset to random mode
    document.querySelector('.logo-wrapper').addEventListener('click', () => {
      this.clearCategorySelection();
      this.showStatus('Switched to random mode');
    });
    
    // Search
    this.elements.searchForm.addEventListener('submit', (e) => this.handleSearch(e));
    
    // Categories
    this.elements.categoryButtons.forEach(btn => {
      btn.addEventListener('click', () => this.handleCategoryClick(btn.dataset.category));
    });
    
    // Article controls
    this.elements.nextBtn.addEventListener('click', () => this.fetchRandomArticle());
    this.elements.favoriteBtn.addEventListener('click', () => this.toggleFavorite());
    this.elements.shareBtn.addEventListener('click', () => this.shareArticle());
    
    // Favorites
    this.elements.favoritesToggle.addEventListener('click', () => this.toggleFavoritesModal());
    this.elements.modalClose.addEventListener('click', () => this.closeFavoritesModal());
    this.elements.favoritesModal.addEventListener('click', (e) => {
      if (e.target === this.elements.favoritesModal) this.closeFavoritesModal();
    });
    
    // Error retry
    this.elements.retryBtn.addEventListener('click', () => this.fetchRandomArticle());
    
    // Auto-fetch toggle
    this.elements.autoFetchToggle.addEventListener('click', () => this.toggleAutoFetch());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    
    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFavoritesModal();
    });
  }

  toggleTheme() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.state.theme);
    this.state.saveTheme();
    this.showStatus(`Switched to ${this.state.theme} theme`);
  }

  clearCategorySelection() {
    this.state.selectedCategory = null;
    // Remove active state from all category buttons
    this.elements.categoryButtons.forEach(btn => btn.classList.remove('active'));
  }

  async handleSearch(e) {
    e.preventDefault();
    const query = this.elements.searchInput.value.trim();
    
    if (!query) return;
    
    try {
      // Clear selected category when searching
      this.clearCategorySelection();
      
      this.showSkeleton();
      this.showStatus('Searching Wikipedia...');
      
      const searchResults = await WikipediaService.searchArticles(query, 1);
      
      if (searchResults.length === 0) {
        throw new Error('No results found');
      }
      
      const article = await WikipediaService.fetchArticleByTitle(searchResults[0].title);
      this.displayArticle(article);
      this.showStatus(`Found article: "${article.title}"`);
      
      // Clear search input
      this.elements.searchInput.value = '';
      
    } catch (error) {
      this.showError(error.message);
      this.showStatus('Search failed - try another term', 'error');
    }
  }

  async handleCategoryClick(category) {
    try {
      // Set the selected category
      this.state.selectedCategory = category;
      
      // Visual feedback
      this.elements.categoryButtons.forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');
      
      this.showSkeleton();
      this.showStatus(`Searching ${category} articles...`);
      
      const article = await WikipediaService.fetchCategoryArticle(category);
      this.displayArticle(article);
      this.showStatus(`Found ${category} article: "${article.title}"`);
      
      // Keep category active to show it's selected
      // Don't remove active state automatically
      
    } catch (error) {
      this.showError(error.message);
      this.showStatus(`Failed to load ${category} article`, 'error');
    }
  }

  async fetchRandomArticle() {
    try {
      this.showSkeleton();
      
      let article;
      if (this.state.selectedCategory) {
        // If a category is selected, fetch from that category
        this.showStatus(`Fetching another ${this.state.selectedCategory} article...`);
        article = await WikipediaService.fetchCategoryArticle(this.state.selectedCategory);
        this.showStatus(`Found another ${this.state.selectedCategory} article: "${article.title}"`);
      } else {
        // Otherwise fetch truly random article
        this.showStatus('Fetching random article...');
        article = await WikipediaService.fetchRandomArticle();
        this.showStatus('Fetched random article from Wikipedia');
      }
      
      this.displayArticle(article);
      
    } catch (error) {
      this.showError(error.message);
      this.showStatus('Failed to fetch article', 'error');
    }
  }

  displayArticle(article) {
    this.state.currentArticle = article;
    this.state.saveLastArticle();
    
    // Hide skeleton and error states
    this.elements.articleSkeleton.style.display = 'none';
    this.elements.errorState.classList.remove('visible');
    
    // Update article content
    this.elements.articleTitle.textContent = article.title;
    this.elements.articleSummary.textContent = article.summary;
    this.elements.readMoreLink.href = article.url;
    this.elements.readingTime.textContent = `${article.readingTime} min read`;
    this.elements.articleLength.textContent = `${article.wordCount} words`;
    
    // Handle image
    if (article.image) {
      this.elements.articleImage.src = article.image;
      this.elements.articleImage.alt = article.imageAlt;
      this.elements.articleImageContainer.style.display = 'block';
    } else {
      this.elements.articleImageContainer.style.display = 'none';
    }
    
    // Update favorite button state
    this.updateFavoriteButton();
    
    // Show article with animation
    this.elements.articleCard.classList.remove('visible');
    setTimeout(() => {
      this.elements.articleCard.classList.add('visible');
    }, 100);
  }

  showSkeleton() {
    this.elements.articleSkeleton.style.display = 'block';
    this.elements.articleCard.classList.remove('visible');
    this.elements.errorState.classList.remove('visible');
  }

  showError(message) {
    this.elements.articleSkeleton.style.display = 'none';
    this.elements.articleCard.classList.remove('visible');
    this.elements.errorState.classList.add('visible');
    this.elements.errorState.querySelector('.error-message').textContent = message;
  }

  toggleFavorite() {
    if (!this.state.currentArticle) return;
    
    const existingIndex = this.state.favorites.findIndex(
      fav => fav.pageId === this.state.currentArticle.pageId
    );
    
    if (existingIndex >= 0) {
      // Remove from favorites
      this.state.favorites.splice(existingIndex, 1);
      this.showStatus('Removed from favorites');
    } else {
      // Add to favorites
      this.state.favorites.push({
        ...this.state.currentArticle,
        savedAt: new Date().toISOString()
      });
      this.showStatus('Added to favorites');
      
      // Bounce animation
      this.elements.favoriteBtn.classList.add('animate-bounce');
      setTimeout(() => {
        this.elements.favoriteBtn.classList.remove('animate-bounce');
      }, 1000);
    }
    
    this.state.saveFavorites();
    this.updateFavoriteButton();
    this.updateFavoritesCount();
  }

  updateFavoriteButton() {
    if (!this.state.currentArticle) return;
    
    const isFavorited = this.state.favorites.some(
      fav => fav.pageId === this.state.currentArticle.pageId
    );
    
    this.elements.favoriteBtn.classList.toggle('favorited', isFavorited);
    this.elements.favoriteText.textContent = isFavorited ? 'Saved' : 'Save';
  }

  updateFavoritesCount() {
    const count = this.state.favorites.length;
    this.elements.favoritesCount.textContent = count;
    this.elements.favoritesCount.classList.toggle('visible', count > 0);
  }

  async shareArticle() {
    if (!this.state.currentArticle) return;
    
    const shareData = {
      title: `${this.state.currentArticle.title} - Random Knowledge Explorer`,
      text: this.state.currentArticle.summary.substring(0, 100) + '...',
      url: this.state.currentArticle.url
    };
    
    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        this.showStatus('Article shared successfully');
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(this.state.currentArticle.url);
        this.showStatus('Article link copied to clipboard');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      this.showStatus('Failed to share article', 'error');
    }
  }

  toggleFavoritesModal() {
    this.elements.favoritesModal.classList.toggle('visible');
    this.renderFavoritesList();
    
    if (this.elements.favoritesModal.classList.contains('visible')) {
      this.elements.favoritesModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } else {
      this.closeFavoritesModal();
    }
  }

  closeFavoritesModal() {
    this.elements.favoritesModal.classList.remove('visible');
    this.elements.favoritesModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  renderFavoritesList() {
    if (this.state.favorites.length === 0) {
      this.elements.favoritesList.innerHTML = `
        <div class="empty-favorites">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <p>No saved articles yet</p>
          <small>Articles you save will appear here</small>
        </div>
      `;
      return;
    }
    
    this.elements.favoritesList.innerHTML = this.state.favorites
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .map(article => `
        <div class="favorite-item">
          <div class="favorite-content">
            <h3 class="favorite-title">${article.title}</h3>
            <p class="favorite-summary">${article.summary.substring(0, 120)}...</p>
          </div>
          <div class="favorite-actions">
            <button class="favorite-action" onclick="app.openFavorite('${article.pageId}')" title="Open article">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 17L17 7M17 7H7M17 7V17"/>
              </svg>
            </button>
            <button class="favorite-action" onclick="app.removeFavorite('${article.pageId}')" title="Remove from favorites">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('');
  }

  openFavorite(pageId) {
    const article = this.state.favorites.find(fav => fav.pageId == pageId);
    if (article) {
      this.displayArticle(article);
      this.closeFavoritesModal();
      this.showStatus(`Opened: "${article.title}"`);
    }
  }

  removeFavorite(pageId) {
    this.state.favorites = this.state.favorites.filter(fav => fav.pageId != pageId);
    this.state.saveFavorites();
    this.updateFavoritesCount();
    this.renderFavoritesList();
    this.updateFavoriteButton();
    this.showStatus('Removed from favorites');
  }

  toggleAutoFetch() {
    this.state.autoFetchEnabled = !this.state.autoFetchEnabled;
    this.state.saveAutoFetch();
    
    this.elements.autoFetchToggle.setAttribute('aria-pressed', this.state.autoFetchEnabled);
    this.elements.autoFetchToggle.textContent = `Auto-fetch: ${this.state.autoFetchEnabled ? 'ON' : 'OFF'}`;
    
    if (this.state.autoFetchEnabled) {
      this.startAutoFetch();
      this.showStatus('Auto-fetch enabled - new articles every 30 seconds');
    } else {
      this.stopAutoFetch();
      this.showStatus('Auto-fetch disabled');
    }
  }

  startAutoFetch() {
    this.stopAutoFetch(); // Clear any existing timer
    this.state.autoFetchTimer = setInterval(() => {
      if (!this.state.isLoading) {
        this.fetchRandomArticle();
      }
    }, CONFIG.AUTO_FETCH_INTERVAL);
  }

  stopAutoFetch() {
    if (this.state.autoFetchTimer) {
      clearInterval(this.state.autoFetchTimer);
      this.state.autoFetchTimer = null;
    }
  }

  handleKeyboard(e) {
    // Keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'k':
          e.preventDefault();
          this.elements.searchInput.focus();
          break;
        case 'n':
          e.preventDefault();
          this.fetchRandomArticle();
          break;
        case 'f':
          e.preventDefault();
          this.toggleFavorite();
          break;
        case 's':
          e.preventDefault();
          this.shareArticle();
          break;
      }
    }
    
    // Space for next article
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      this.fetchRandomArticle();
    }
  }

  showStatus(message, type = 'info') {
    this.elements.statusMessage.textContent = message;
    this.elements.statusMessage.className = `status-message visible ${type}`;
    
    setTimeout(() => {
      this.elements.statusMessage.classList.remove('visible');
    }, 3000);
  }
}

// ===== APPLICATION INITIALIZATION =====
class RandomKnowledgeExplorer {
  constructor() {
    this.state = new AppState();
    this.ui = new UIController(this.state);
    this.init();
  }

  async init() {
    console.log(`🧠 Random Knowledge Explorer initialized (Visit #${this.state.visitCount})`);
    
    // Start in random mode (clear any category selection)
    this.ui.clearCategorySelection();
    
    // Load initial article
    await this.ui.fetchRandomArticle();
    
    // Start auto-fetch if enabled
    if (this.state.autoFetchEnabled) {
      this.ui.startAutoFetch();
    }
    
    // Add service worker for offline support (if available)
    if ('serviceWorker' in navigator) {
      try {
        // Note: Service worker file would need to be created separately
        // await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker support detected');
      } catch (error) {
        console.log('Service Worker registration failed');
      }
    }
  }

  // Public methods for global access
  openFavorite(pageId) {
    this.ui.openFavorite(pageId);
  }

  removeFavorite(pageId) {
    this.ui.removeFavorite(pageId);
  }
}

// ===== GLOBAL INITIALIZATION =====
let app;

document.addEventListener('DOMContentLoaded', () => {
  app = new RandomKnowledgeExplorer();
});

// Handle online/offline status
window.addEventListener('online', () => {
  app.ui.showStatus('Back online! 🌐');
});

window.addEventListener('offline', () => {
  app.ui.showStatus('You are offline. Showing cached content.', 'warning');
});

// Handle page visibility for auto-fetch
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    app.ui.stopAutoFetch();
  } else if (app.state.autoFetchEnabled) {
    app.ui.startAutoFetch();
  }
});

// Export for debugging
window.RKE = { app, WikipediaService, CONFIG };
