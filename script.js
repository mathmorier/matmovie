const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const POSTER_SIZE = 'w500';

// State
let apiKey = '';
let currentMovie = null;
let currentBackdrops = [];
let currentImageIndex = 0;
let score = 0;

// New State for Challenge Mode
let maxRounds = Infinity;
let currentRound = 0;
let selectedGenre = '';

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const apiKeyInput = document.getElementById('api-key-input');
const startBtn = document.getElementById('start-btn');
const loginError = document.getElementById('login-error');
const backdropDisplay = document.getElementById('backdrop-display');
const indicators = document.querySelectorAll('.indicator');
const guessInput = document.getElementById('guess-input');
const submitGuessBtn = document.getElementById('submit-guess-btn');
const nextHintBtn = document.getElementById('next-hint-btn');
const skipBtn = document.getElementById('skip-btn');
const currentScoreEl = document.getElementById('current-score');
const resetKeyBtn = document.getElementById('reset-key-btn');
const bgOverlay = document.querySelector('.background-overlay');

// Settings Elements
const roundsSelect = document.getElementById('rounds-select');
const genreSelect = document.getElementById('genre-select');
const roundIndicator = document.getElementById('round-indicator');

// Modal Elements
const resultModal = document.getElementById('result-modal');
const resultTitle = document.getElementById('result-title');
const resultMovieTitle = document.getElementById('result-movie-title');
const resultMessage = document.getElementById('result-message');
const posterReveal = document.getElementById('poster-reveal');
const nextMovieBtn = document.getElementById('next-movie-btn');
const suggestionsList = document.getElementById('suggestions-list');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const storedKey = localStorage.getItem('tmdb_api_key');
    if (storedKey) {
        apiKey = storedKey;
        apiKeyInput.value = apiKey;
        // Verify key and populate genres
        fetchGenres(apiKey);
    }
});

startBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showLoginError('Veuillez entrer une clé API.');
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Vérification...';

    const isValid = await testApiKey(key);

    if (isValid) {
        apiKey = key;
        localStorage.setItem('tmdb_api_key', apiKey);

        // Fetch genres just in case, then start
        await fetchGenres(apiKey);
        startGame();
    } else {
        showLoginError('Clé API invalide. Vérifiez-la sur TMDB.');
        startBtn.disabled = false;
        startBtn.textContent = 'Commencer';
    }
});

resetKeyBtn.addEventListener('click', () => {
    localStorage.removeItem('tmdb_api_key');
    location.reload();
});

// Event Listeners for Game
nextHintBtn.addEventListener('click', showNextImage);
skipBtn.addEventListener('click', () => handleRoundEnd(false, true)); // Treat skip as loss
submitGuessBtn.addEventListener('click', checkGuess);
guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkGuess();
});
guessInput.addEventListener('input', debounce(handleInput, 300));

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-wrapper')) {
        suggestionsList.classList.add('hidden');
    }
});

nextMovieBtn.addEventListener('click', () => {
    resultModal.classList.add('hidden');

    // Check if game over
    if (maxRounds !== Infinity && currentRound >= maxRounds) {
        showGameOver();
    } else {
        startNewRound();
    }
});

// App Logic
async function initApp(key) {
    // Populate genres
    await fetchGenres(key);

    // If key was just entered, update UI immediately? 
    // Actually we stay on login screen to let user choose settings
    // But if auto-login, we might wait on login screen? 
    // The requirement implies we choose settings before starting.
    // So if stored key exists, we just unlock the form?
    // Let's modify behavior: if stored key, fill input, verify silently, fetch genres.
    // User still needs to click "Start" to choose settings.

    // If we are auto-logging in (from DOMContentLoaded):
    if (document.getElementById('login-screen').classList.contains('active')) {
        apiKeyInput.value = key;
        // We don't auto-start because we want them to pick options
        // Just fetch genres
    } else {
        // If clicked start button
        startGame();
    }
}

async function fetchGenres(key) {
    try {
        const res = await fetch(`${TMDB_BASE_URL}/genre/movie/list?api_key=${key}&language=fr-FR`);
        const data = await res.json();

        genreSelect.innerHTML = '<option value="">Tous les genres</option>';
        data.genres.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            genreSelect.appendChild(opt);
        });
    } catch (e) {
        console.error("Failed to fetch genres", e);
    }
}

async function testApiKey(key) {
    try {
        const res = await fetch(`${TMDB_BASE_URL}/authentication/token/new?api_key=${key}`);
        const data = await res.json();
        return data.success;
    } catch (e) {
        return false;
    }
}

function startGame() {
    // Read Settings
    const roundsVal = roundsSelect.value;
    maxRounds = roundsVal === 'Infinity' ? Infinity : parseInt(roundsVal);
    selectedGenre = genreSelect.value;

    score = 0;
    currentRound = 0;
    currentScoreEl.textContent = score;

    loginScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startNewRound();
}

function showLoginError(msg) {
    loginError.textContent = msg;
    apiKeyInput.classList.add('error');
    setTimeout(() => loginError.textContent = '', 3000);
}

// Game Logic
async function startNewRound() {
    currentRound++;
    updateRoundIndicator();

    resetRoundState();
    showLoading();

    try {
        // Fetch logic with Genre
        const genreParam = selectedGenre ? `&with_genres=${selectedGenre}` : '';
        const randomPage = Math.floor(Math.random() * 50) + 1;

        const listRes = await fetch(`${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&language=fr-FR&page=${randomPage}&sort_by=popularity.desc&include_adult=false${genreParam}`);
        const listData = await listRes.json();

        if (!listData.results || listData.results.length === 0) {
            throw new Error('No movies found');
        }

        const randomIndex = Math.floor(Math.random() * listData.results.length);
        const movieBasic = listData.results[randomIndex];

        // Get images
        const imagesRes = await fetch(`${TMDB_BASE_URL}/movie/${movieBasic.id}/images?api_key=${apiKey}&include_image_language=en,null`);
        const imagesData = await imagesRes.json();

        if (!imagesData.backdrops || imagesData.backdrops.length < 1) {
            console.log('Not enough images, retrying...');
            currentRound--; // Don't count this attempt
            startNewRound();
            return;
        }

        currentMovie = movieBasic;
        const shuffled = imagesData.backdrops.sort(() => 0.5 - Math.random());
        currentBackdrops = shuffled.slice(0, 3);

        updateDisplay();

    } catch (e) {
        console.error(e);
        alert("Erreur. Rechargement...");
        location.reload();
    }
}

function resetRoundState() {
    currentImageIndex = 0;
    guessInput.value = '';
    backdropDisplay.innerHTML = '';

    indicators.forEach((ind, i) => {
        ind.className = 'indicator';
        if (i === 0) ind.classList.add('active');
    });

    nextHintBtn.disabled = false;
    nextHintBtn.textContent = 'Indice Suivant (+1 Image)';
    skipBtn.disabled = false;
}

function updateRoundIndicator() {
    if (maxRounds === Infinity) {
        roundIndicator.textContent = `Manche ${currentRound}`;
    } else {
        roundIndicator.textContent = `Manche ${currentRound} / ${maxRounds}`;
    }
}

function showLoading() {
    backdropDisplay.innerHTML = '<div class="loading-spinner"></div>';
    bgOverlay.style.backgroundImage = 'none';
}

function updateDisplay() {
    if (!currentBackdrops[currentImageIndex]) return;

    const imagePath = currentBackdrops[currentImageIndex].file_path;
    const fullUrl = `${IMAGE_BASE_URL}${imagePath}`;

    const img = new Image();
    img.src = fullUrl;
    img.className = 'game-image';
    img.onload = () => {
        backdropDisplay.innerHTML = '';
        backdropDisplay.appendChild(img);
        bgOverlay.style.backgroundImage = `url(${fullUrl})`;
    };

    indicators.forEach((ind, i) => {
        if (i <= currentImageIndex) ind.classList.add('active');
    });

    if (currentImageIndex >= currentBackdrops.length - 1) {
        nextHintBtn.disabled = true;
        nextHintBtn.textContent = 'Dernière image';
    }
}

function showNextImage() {
    if (currentImageIndex < currentBackdrops.length - 1) {
        currentImageIndex++;
        updateDisplay();
    }
}

function checkGuess() {
    const userGuess = guessInput.value.trim().toLowerCase();
    const correctTitle = currentMovie.title.toLowerCase();

    const cleanUser = normalizeString(userGuess);
    const cleanTitle = normalizeString(correctTitle);

    if (cleanUser === cleanTitle) {
        // Win
        handleRoundEnd(true);
    } else {
        // Wrong
        flashInputRed();

        // Logic: if wrong, show next image automatically
        if (currentImageIndex < currentBackdrops.length - 1) {
            currentImageIndex++;
            updateDisplay();
        } else {
            // If on last image and wrong -> Lost
            handleRoundEnd(false);
        }
    }
}

function flashInputRed() {
    guessInput.style.borderColor = '#ff4d4d';
    setTimeout(() => guessInput.style.borderColor = 'rgba(255, 255, 255, 0.1)', 500);
}

function handleRoundEnd(isWin, isSkip = false) {
    let points = 0;

    if (isWin) {
        // 1st img = 3pts (index 0)
        // 2nd img = 2pts (index 1)
        // 3rd img = 1pt  (index 2)
        if (currentImageIndex === 0) points = 3;
        if (currentImageIndex === 1) points = 2;
        if (currentImageIndex === 2) points = 1;

        score += points;
        currentScoreEl.textContent = score;

        resultTitle.textContent = "Bravo !";
        resultTitle.style.color = "#46d369";
        resultMessage.textContent = `+${points} points (${currentImageIndex + 1} image${currentImageIndex > 0 ? 's' : ''})`;
    } else {
        // Loss or Skip
        resultTitle.textContent = isSkip ? "Puni !" : "Perdu !";
        resultTitle.style.color = "#ff4d4d";
        resultMessage.textContent = "0 point. La réponse était ci-dessous.";
    }

    resultMovieTitle.textContent = currentMovie.title;

    if (currentMovie.poster_path) {
        posterReveal.innerHTML = `<img src="https://image.tmdb.org/t/p/${POSTER_SIZE}${currentMovie.poster_path}" alt="Poster">`;
    } else {
        posterReveal.innerHTML = '';
    }

    // Check if it's the absolute last round
    if (maxRounds !== Infinity && currentRound >= maxRounds) {
        nextMovieBtn.textContent = "Voir Résultat Final";
    } else {
        nextMovieBtn.textContent = "Film Suivant";
    }

    resultModal.classList.remove('hidden');
}

function showGameOver() {
    // Show a summary inside the same modal or alert, then reload
    alert(`Partie terminée ! Score Final: ${score}`);
    location.reload();
}

function normalizeString(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

// Autocomplete Logic
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function handleInput(e) {
    const query = e.target.value.trim();
    if (query.length < 2) {
        suggestionsList.classList.add('hidden');
        return;
    }

    if (!apiKey) return;

    try {
        const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=fr-FR&page=1&include_adult=false`);
        const data = await res.json();

        if (data.results) {
            displaySuggestions(data.results.slice(0, 5));
        }
    } catch (err) {
        console.error("Search error:", err);
    }
}

function displaySuggestions(movies) {
    suggestionsList.innerHTML = '';

    if (movies.length === 0) {
        suggestionsList.classList.add('hidden');
        return;
    }

    movies.forEach(movie => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        const year = movie.release_date ? movie.release_date.split('-')[0] : '';
        div.innerHTML = `${movie.title} <span class="item-year">${year}</span>`;
        div.onclick = () => selectSuggestion(movie);
        suggestionsList.appendChild(div);
    });

    suggestionsList.classList.remove('hidden');
}

function selectSuggestion(movie) {
    guessInput.value = movie.title;
    suggestionsList.classList.add('hidden');
    guessInput.focus();
}
