// ---------- GLOBALS ----------
let quizQuestions = [];
let currentQuestionIndex = 0;
const TOTAL_QUESTIONS = 10;
let currentScore = 0;
let questionStartTime = null;
let results = new Array(TOTAL_QUESTIONS).fill(null);
let questionAnswered = false;
let isWaitingForNext = false;
let isFetching = false;

// DOM elements (quiz area)
const quizContent = document.getElementById('quiz-content');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const difficultySelect = document.getElementById('difficulty-select');
const categorySelect = document.getElementById('category-select');
const questionTextEl = document.getElementById('question-text');
const answersContainer = document.getElementById('answers-container');
const categoryDisplay = document.getElementById('category-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const questionCounterEl = document.getElementById('question-counter');
const scoreSpan = document.getElementById('quiz-score');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const feedbackDiv = document.getElementById('feedback-message');

// Helper: update UI (score + counter)
function updateUI() {
    scoreSpan.textContent = currentScore;
    questionCounterEl.innerHTML = `<span class="meta-icon">🔢</span> Question: <strong>${currentQuestionIndex + 1} / ${TOTAL_QUESTIONS}</strong>`;
}

let feedbackTimeout = null;
function showFeedback(message, isError = false) {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackDiv.textContent = message;
    feedbackDiv.style.background = isError ? '#ffe6e5' : '#fef9e6';
    feedbackDiv.style.color = isError ? '#b13e3e' : '#8a6e2f';
    feedbackTimeout = setTimeout(() => { feedbackDiv.textContent = ''; }, 2000);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function renderAnswerOptions(correctAnswer, incorrectAnswers) {
    if (!answersContainer) return;
    const allAnswers = shuffleArray([correctAnswer, ...incorrectAnswers]);
    answersContainer.innerHTML = '';
    allAnswers.forEach(answer => {
        const label = document.createElement('label');
        label.className = 'answer-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quiz-answer';
        radio.value = answer;
        radio.disabled = questionAnswered || isWaitingForNext;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(answer));
        answersContainer.appendChild(label);
    });
}

function setAnswersEnabled(enabled) {
    document.querySelectorAll('#answers-container input[type="radio"]').forEach(radio => radio.disabled = !enabled);
}

function clearSelectedAnswer() {
    const selected = document.querySelector('#answers-container input[type="radio"]:checked');
    if (selected) selected.checked = false;
}

function decodeHtml(html) {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

// ----- Fetch 10 questions with selected difficulty & category (retry up to 5 times) -----
async function fetchTenQuestions(difficulty = '', category = '', attempt = 1) {
    const maxAttempts = 5;
    let url = `https://opentdb.com/api.php?amount=${TOTAL_QUESTIONS}&type=multiple`;
    if (difficulty) url += `&difficulty=${difficulty}`;
    if (category) url += `&category=${category}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.response_code === 0 && data.results && data.results.length === TOTAL_QUESTIONS) {
            return data.results.map(result => ({
                question: decodeHtml(result.question),
                correctAnswer: decodeHtml(result.correct_answer),
                incorrectAnswers: result.incorrect_answers.map(decodeHtml),
                category: decodeHtml(result.category),
                difficulty: result.difficulty.charAt(0).toUpperCase() + result.difficulty.slice(1)
            }));
        } else {
            throw new Error(`API returned ${data.results?.length || 0} questions, need ${TOTAL_QUESTIONS}`);
        }
    } catch (err) {
        console.warn(`Attempt ${attempt} failed:`, err);
        if (attempt < maxAttempts) {
            showFeedback(`Retrying fetch (attempt ${attempt + 1}/${maxAttempts})...`, false);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchTenQuestions(difficulty, category, attempt + 1);
        } else {
            throw new Error(`Failed to fetch 10 questions after ${maxAttempts} attempts. Please restart.`);
        }
    }
}

// ----- Start quiz: hide start screen, fetch questions, store in localStorage -----
async function startQuiz() {
    const difficulty = difficultySelect.value;
    const category = categorySelect.value;
    // Show loading inside start screen (optional)
    startBtn.disabled = true;
    startBtn.textContent = 'Loading...';
    try {
        const freshQuestions = await fetchTenQuestions(difficulty, category);
        quizQuestions = freshQuestions;
        // Store questions and preferences in localStorage
        localStorage.setItem('triviaQuizQuestions', JSON.stringify(freshQuestions));
        localStorage.setItem('triviaQuizDifficulty', difficulty);
        localStorage.setItem('triviaQuizCategory', category);
        // Reset state
        currentQuestionIndex = 0;
        currentScore = 0;
        results = new Array(TOTAL_QUESTIONS).fill(null);
        questionAnswered = false;
        isWaitingForNext = false;
        updateUI();
        displayCurrentQuestion();
        // Switch UI
        startScreen.style.display = 'none';
        quizContent.style.display = 'block';
        showFeedback('Quiz started! Good luck.', false);
    } catch (err) {
        console.error('Start failed:', err);
        showFeedback(`❌ Failed to load questions: ${err.message}. Please try again.`, true);
        startBtn.disabled = false;
        startBtn.textContent = 'Start Quiz';
    }
}

// ----- Display current question (from quizQuestions array) -----
function displayCurrentQuestion() {
    if (!quizQuestions.length || currentQuestionIndex >= quizQuestions.length) {
        endGame();
        return;
    }
    const q = quizQuestions[currentQuestionIndex];
    questionTextEl.textContent = q.question;
    categoryDisplay.innerHTML = `<span class="meta-icon">📂</span> Category: <strong>${escapeHtml(q.category)}</strong>`;
    difficultyDisplay.innerHTML = `<span class="meta-icon">⚙️</span> Difficulty: <strong>${escapeHtml(q.difficulty)}</strong>`;
    renderAnswerOptions(q.correctAnswer, q.incorrectAnswers);
    setAnswersEnabled(true);
    submitBtn.disabled = false;
    questionAnswered = false;
    questionStartTime = performance.now();
}

// ----- End game: show score + fastest correct answer -----
function endGame() {
    let fastestTime = Infinity;
    let fastestIndex = -1;
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
        const res = results[i];
        if (res && res.correct === true && res.time > 0 && res.time < fastestTime) {
            fastestTime = res.time;
            fastestIndex = i;
        }
    }
    let fastestMsg = '';
    if (fastestIndex !== -1) {
        const fastestResult = results[fastestIndex];
        fastestMsg = `<br><br>⚡ Fastest correct answer:<br>
                      <strong>Question ${fastestIndex + 1}:</strong> ${escapeHtml(fastestResult.questionText)}<br>
                      <strong>Correct answer:</strong> ${escapeHtml(fastestResult.correctAnswer)}<br>
                      <strong>Time:</strong> ${fastestTime.toFixed(2)} seconds`;
    } else {
        fastestMsg = '<br><br>⚠️ No correct answers recorded.';
    }
    questionTextEl.innerHTML = `🏆 Quiz completed! Your final score: ${currentScore} / ${TOTAL_QUESTIONS}${fastestMsg}`;
    answersContainer.innerHTML = '<div style="text-align:center; padding:1rem;">🎉 Great job! Press Restart to play again.</div>';
    submitBtn.disabled = true;
    setAnswersEnabled(false);
    showFeedback(`Game over! Final score: ${currentScore} out of ${TOTAL_QUESTIONS}`, false);
}

// ----- Move to next question (auto-advance) -----
async function proceedToNextQuestion() {
    if (currentQuestionIndex + 1 >= TOTAL_QUESTIONS) {
        endGame();
        return;
    }
    currentQuestionIndex++;
    updateUI();
    displayCurrentQuestion();
    isWaitingForNext = false;
    submitBtn.disabled = false;
}

// ----- Handle answer submission -----
function handleSubmit() {
    if (questionAnswered) {
        showFeedback('Already answered! Loading next...', false);
        if (!isWaitingForNext && !isFetching && currentQuestionIndex < TOTAL_QUESTIONS) {
            isWaitingForNext = true;
            setTimeout(async () => {
                await proceedToNextQuestion();
                isWaitingForNext = false;
            }, 500);
        }
        return;
    }
    if (isWaitingForNext || isFetching) {
        showFeedback('Please wait...', false);
        return;
    }
    const selectedRadio = document.querySelector('#answers-container input[type="radio"]:checked');
    if (!selectedRadio) {
        showFeedback('Please select an answer.', true);
        return;
    }
    const timeTaken = (performance.now() - questionStartTime) / 1000;
    const currentQ = quizQuestions[currentQuestionIndex];
    const userAnswer = selectedRadio.value;
    const isCorrect = (userAnswer === currentQ.correctAnswer);

    results[currentQuestionIndex] = {
        time: timeTaken,
        correct: isCorrect,
        questionText: currentQ.question,
        correctAnswer: currentQ.correctAnswer
    };
    localStorage.setItem('triviaQuizResults', JSON.stringify(results));

    if (isCorrect) {
        currentScore++;
        updateUI();
        showFeedback(`✅ Correct! +1 point. Answer: ${currentQ.correctAnswer} (${timeTaken.toFixed(1)}s)`, false);
    } else {
        showFeedback(`❌ Wrong! The correct answer is: ${currentQ.correctAnswer} (${timeTaken.toFixed(1)}s)`, false);
    }

    questionAnswered = true;
    setAnswersEnabled(false);
    submitBtn.disabled = true;
    isWaitingForNext = true;
    setTimeout(async () => {
        if (currentQuestionIndex + 1 >= TOTAL_QUESTIONS) {
            endGame();
        } else {
            await proceedToNextQuestion();
        }
        isWaitingForNext = false;
    }, 1500);
}

// ----- Restart quiz: show start screen again, clear stored data -----
function restartQuiz() {
    // Clear localStorage for questions and results
    localStorage.removeItem('triviaQuizQuestions');
    localStorage.removeItem('triviaQuizResults');
    // Reset state
    quizQuestions = [];
    currentQuestionIndex = 0;
    currentScore = 0;
    results = new Array(TOTAL_QUESTIONS).fill(null);
    questionAnswered = false;
    isWaitingForNext = false;
    // Show start screen, hide quiz content
    startScreen.style.display = 'flex';
    quizContent.style.display = 'none';
    // Reset start button
    startBtn.disabled = false;
    startBtn.textContent = 'Start Quiz';
    // Optionally restore previously selected preferences from localStorage
    const savedDifficulty = localStorage.getItem('triviaQuizDifficulty');
    const savedCategory = localStorage.getItem('triviaQuizCategory');
    if (savedDifficulty) difficultySelect.value = savedDifficulty;
    if (savedCategory) categorySelect.value = savedCategory;
    showFeedback('Quiz reset. Choose your preferences and start again.', false);
}

// ----- Initial load: show start screen, hide quiz content -----
function init() {
    startScreen.style.display = 'flex';
    quizContent.style.display = 'none';
    // Load saved preferences if any
    const savedDifficulty = localStorage.getItem('triviaQuizDifficulty');
    const savedCategory = localStorage.getItem('triviaQuizCategory');
    if (savedDifficulty) difficultySelect.value = savedDifficulty;
    if (savedCategory) categorySelect.value = savedCategory;
    startBtn.addEventListener('click', startQuiz);
    submitBtn.addEventListener('click', handleSubmit);
    resetBtn.addEventListener('click', restartQuiz);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m));
}

// Start the app
init();