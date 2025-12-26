const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';
const POSTER_SIZE = 'w500';

// State
let apiKey = '';
let currentMovie = null;
let currentBackdrops = [];
let currentImageIndex = 0;
let score = 0;

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
        testApiKey(apiKey).then(isValid => {
            if (isValid) {
                showGameScreen();
            } else {
                localStorage.removeItem('tmdb_api_key');
            }
        });
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
        showGameScreen();
    } else {
        showLoginError('Clé API invalide. Vérifiez-la sur TMDB.');
    }

    startBtn.disabled = false;
    startBtn.textContent = 'Commencer';
});

resetKeyBtn.addEventListener('click', () => {
    localStorage.removeItem('tmdb_api_key');
    location.reload();
});

nextHintBtn.addEventListener('click', showNextImage);
skipBtn.addEventListener('click', handleSkip);


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
    startNewRound();
});

// Logic
async function testApiKey(key) {
    try {
        const res = await fetch(`${TMDB_BASE_URL}/authentication/token/new?api_key=${key}`);
        const data = await res.json();
        return data.success;
    } catch (e) {
        return false;
    }
}

function showLoginError(msg) {
    loginError.textContent = msg;
    apiKeyInput.classList.add('error'); // Ensure CSS handles this if wanted
    setTimeout(() => loginError.textContent = '', 3000);
}

function showGameScreen() {
    loginScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startNewRound();
}

async function startNewRound() {
    resetGameState();
    showLoading();

    try {
        // 1. Get a random page of popular movies (total_pages usually capped at 500 by TMDB for this list)
        // We pick a random page between 1 and 100 to stick to relatively known movies
        const randomPage = Math.floor(Math.random() * 50) + 1;

        const listRes = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${apiKey}&language=fr-FR&page=${randomPage}`);
        const listData = await listRes.json();

        if (!listData.results || listData.results.length === 0) {
            throw new Error('No movies found');
        }

        // 2. Pick a random movie
        const randomIndex = Math.floor(Math.random() * listData.results.length);
        const movieBasic = listData.results[randomIndex];

        // 3. Get images for that movie (en includes most backdrops, we can filter for null iso_639_1 too)
        const imagesRes = await fetch(`${TMDB_BASE_URL}/movie/${movieBasic.id}/images?api_key=${apiKey}&include_image_language=en,null`);
        const imagesData = await imagesRes.json();

        // Filter backdrops only, verify we have at least 1. If not, retry.
        if (!imagesData.backdrops || imagesData.backdrops.length < 1) {
            console.log('Not enough images, retrying...');
            startNewRound();
            return;
        }

        // Save current movie details
        currentMovie = movieBasic;

        // Pick up to 3 random backdrops
        // Sort by vote_average or just random? Random is better for difficulty.
        // Or simply take top 3. Let's shuffle and take 3.
        const shuffled = imagesData.backdrops.sort(() => 0.5 - Math.random());
        currentBackdrops = shuffled.slice(0, 3);

        // If we have fewer than 3, just repeat the last one or loop.
        // But for UX, let's just use what we have.

        updateDisplay();

    } catch (e) {
        console.error(e);
        alert("Erreur lors du chargement du film. Vérifiez votre connexion/Clé API.");
    }
}

function resetGameState() {
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

function showLoading() {
    backdropDisplay.innerHTML = '<div class="loading-spinner"></div>';
    bgOverlay.style.backgroundImage = 'none';
}

function updateDisplay() {
    if (!currentBackdrops[currentImageIndex]) return;

    const imagePath = currentBackdrops[currentImageIndex].file_path;
    const fullUrl = `${IMAGE_BASE_URL}${imagePath}`;

    // Preload image
    const img = new Image();
    img.src = fullUrl;
    img.className = 'game-image';
    img.onload = () => {
        backdropDisplay.innerHTML = '';
        backdropDisplay.appendChild(img);

        // Update background overlay for immersion
        bgOverlay.style.backgroundImage = `url(${fullUrl})`;
    };

    // Update indicators
    indicators.forEach((ind, i) => {
        if (i <= currentImageIndex) ind.classList.add('active');
    });

    // Handle buttons
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


function handleSkip() {
    // Reveal everything
    resultTitle.textContent = "Dommage !";
    resultTitle.style.color = "#ff4d4d"; // Red
    resultMovieTitle.textContent = currentMovie.title;
    resultMessage.textContent = `La réponse était : ${currentMovie.title}.`;

    if (currentMovie.poster_path) {
        posterReveal.innerHTML = `<img src="https://image.tmdb.org/t/p/${POSTER_SIZE}${currentMovie.poster_path}" alt="Poster">`;
    } else {
        posterReveal.innerHTML = '';
    }

    // Reset score if wanted, or just don't increment
    // score = 0; // Hardcore mode? Let's verify with user. For now, just no points.
    // currentScoreEl.textContent = score;

    resultModal.classList.remove('hidden');
}

function checkGuess() {
    const userGuess = guessInput.value.trim().toLowerCase();
    const correctTitle = currentMovie.title.toLowerCase();

    // Simple normalization: remove accents, special chars
    const cleanUser = normalizeString(userGuess);
    const cleanTitle = normalizeString(correctTitle);

    if (cleanUser === cleanTitle) {
        handleWin();
    } else {
        // Simple shake animation on input
        guessInput.style.borderColor = '#ff4d4d';
        setTimeout(() => guessInput.style.borderColor = 'rgba(255, 255, 255, 0.1)', 500);
    }
}

// Remove accents and special chars
function normalizeString(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""); // Keep only alphanumeric
}

function handleWin() {
    score++;
    currentScoreEl.textContent = score;

    resultTitle.textContent = "Bravo !";
    resultTitle.style.color = "#46d369";
    resultMovieTitle.textContent = currentMovie.title;
    resultMessage.textContent = `Vous avez trouvé avec ${currentImageIndex + 1} image(s).`;

    if (currentMovie.poster_path) {
        posterReveal.innerHTML = `<img src="https://image.tmdb.org/t/p/${POSTER_SIZE}${currentMovie.poster_path}" alt="Poster">`;
    } else {
        posterReveal.innerHTML = '';
    }

    resultModal.classList.remove('hidden');
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

    // Only search if we have a key
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
    // Optional: auto-submit or focus button
    // checkGuess(); 
    guessInput.focus();
}
