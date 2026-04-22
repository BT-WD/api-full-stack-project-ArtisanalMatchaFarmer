// ---------- GLOBALS ----------
let quizQuestions = [];            // array of 10 question objects
let currentQuestionIndex = 0;      // 0-based index
const TOTAL_QUESTIONS = 10;
let currentScore = 0;
let questionStartTime = null;      // timestamp when current question was shown
let results = new Array(TOTAL_QUESTIONS).fill(null); // stores { time, correct, questionText, correctAnswer }
let questionAnswered = false;
let isWaitingForNext = false;
let isFetching = false;

// DOM elements
const questionTextEl = document.getElementById('question-text');
const answersContainer = document.getElementById('answers-container');
const categoryDisplay = document.getElementById('category-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const questionCounterEl = document.getElementById('question-counter');
const scoreSpan = document.getElementById('quiz-score');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const feedbackDiv = document.getElementById('feedback-message');

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

// ----- Fetch 10 questions with retries (max 5 attempts) -----
async function fetchTenQuestions(attempt = 1) {
    const maxAttempts = 5;
    try {
        const response = await fetch(`https://opentdb.com/api.php?amount=${TOTAL_QUESTIONS}&type=multiple`);
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
            return fetchTenQuestions(attempt + 1);
        } else {
            throw new Error(`Failed to fetch 10 questions after ${maxAttempts} attempts. Please restart.`);
        }
    }
}

// ----- Load/store questions in localStorage -----
async function loadOrFetchQuestions() {
    const stored = localStorage.getItem('triviaQuizQuestions');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length === TOTAL_QUESTIONS) {
                console.log('Using questions from localStorage');
                return parsed;
            }
        } catch (e) {}
    }
    console.log('Fetching fresh questions from API');
    const fresh = await fetchTenQuestions();
    localStorage.setItem('triviaQuizQuestions', JSON.stringify(fresh));
    return fresh;
}

// ----- Save results to localStorage after each answer -----
function saveResultsToLocalStorage() {
    localStorage.setItem('triviaQuizResults', JSON.stringify(results));
}

// ----- Display current question -----
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
    // Start timing
    questionStartTime = performance.now();
}

// ----- End game: show score + fastest correct answer (time, question, correct answer) -----
function endGame() {
    // Find fastest correct answer (lowest time > 0)
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

// ----- Move to next question (auto-advance after answer) -----
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

    // Stop timing
    const timeTaken = (performance.now() - questionStartTime) / 1000;
    const currentQ = quizQuestions[currentQuestionIndex];
    const userAnswer = selectedRadio.value;
    const isCorrect = (userAnswer === currentQ.correctAnswer);

    // Store result for this question
    results[currentQuestionIndex] = {
        time: timeTaken,
        correct: isCorrect,
        questionText: currentQ.question,
        correctAnswer: currentQ.correctAnswer
    };
    saveResultsToLocalStorage();

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

    // Auto-advance after 1.5 seconds
    setTimeout(async () => {
        if (currentQuestionIndex + 1 >= TOTAL_QUESTIONS) {
            endGame();
        } else {
            await proceedToNextQuestion();
        }
        isWaitingForNext = false;
    }, 1500);
}

// ----- Reset quiz: fetch fresh questions, reset all state, clear stored results -----
async function resetQuiz() {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    isWaitingForNext = false;
    isFetching = true;
    submitBtn.disabled = true;
    setAnswersEnabled(false);
    questionTextEl.textContent = 'Fetching new questions...';
    feedbackDiv.textContent = '';

    try {
        // Clear localStorage for questions and results
        localStorage.removeItem('triviaQuizQuestions');
        localStorage.removeItem('triviaQuizResults');
        // Fetch new set
        const freshQuestions = await fetchTenQuestions(1);
        quizQuestions = freshQuestions;
        localStorage.setItem('triviaQuizQuestions', JSON.stringify(freshQuestions));
        // Reset state
        currentQuestionIndex = 0;
        currentScore = 0;
        results = new Array(TOTAL_QUESTIONS).fill(null);
        questionAnswered = false;
        updateUI();
        displayCurrentQuestion();
        showFeedback('🔄 Quiz restarted with fresh questions! Good luck.', false);
    } catch (err) {
        console.error('Reset failed:', err);
        showFeedback('❌ Failed to fetch new questions. Please check your connection and try again.', true);
        questionTextEl.textContent = '⚠️ Unable to load questions. Click Restart to retry.';
        answersContainer.innerHTML = '';
    } finally {
        isFetching = false;
        submitBtn.disabled = false;
    }
}

// ----- Initial load -----
async function init() {
    isFetching = true;
    submitBtn.disabled = true;
    try {
        quizQuestions = await loadOrFetchQuestions();
        if (!quizQuestions || quizQuestions.length !== TOTAL_QUESTIONS) {
            throw new Error('Invalid question set');
        }
        // Try to load previous results from localStorage (optional, but for consistency)
        const storedResults = localStorage.getItem('triviaQuizResults');
        if (storedResults) {
            try {
                const parsed = JSON.parse(storedResults);
                if (Array.isArray(parsed) && parsed.length === TOTAL_QUESTIONS) {
                    results = parsed;
                    // Recalculate score from stored results
                    currentScore = results.filter(r => r && r.correct === true).length;
                }
            } catch (e) {}
        }
        currentQuestionIndex = 0;
        updateUI();
        displayCurrentQuestion();
    } catch (err) {
        console.error('Init error:', err);
        questionTextEl.textContent = '⚠️ Failed to load quiz. Please restart.';
        showFeedback('❌ Could not load questions. Click Restart.', true);
    } finally {
        isFetching = false;
        submitBtn.disabled = false;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m));
}

// Event listeners
submitBtn.addEventListener('click', handleSubmit);
resetBtn.addEventListener('click', resetQuiz);

// Start
init();