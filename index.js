// ---------- GLOBALS ----------
let currentQuestionData = null;
let currentCorrectAnswer = '';
let currentAnswersArray = [];
let currentQuestionIndex = 1;
const TOTAL_QUESTIONS = 10;
let currentScore = 0;
let questionAnswered = false;
let isWaitingForNext = false;
let isFetching = false;

// DOM elements (no nextBtn)
const questionTextEl = document.getElementById('question-text');
const answersContainer = document.getElementById('answers-container');
const categoryDisplay = document.getElementById('category-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const questionCounterEl = document.getElementById('question-counter');
const scoreSpan = document.getElementById('quiz-score');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const feedbackDiv = document.getElementById('feedback-message');

function updateScoreUI() { scoreSpan.textContent = currentScore; }
function updateCounterUI() { questionCounterEl.innerHTML = `<span class="meta-icon">🔢</span> Question: <strong>${currentQuestionIndex} / ${TOTAL_QUESTIONS}</strong>`; }

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

function renderAnswerOptions() {
    if (!answersContainer) return;
    answersContainer.innerHTML = '';
    currentAnswersArray.forEach((answerText) => {
        const label = document.createElement('label');
        label.className = 'answer-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quiz-answer';
        radio.value = answerText;
        radio.disabled = questionAnswered || isWaitingForNext;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(answerText));
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

async function fetchQuestionWithRetry(attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.response_code === 0 && data.results && data.results.length > 0) {
                const result = data.results[0];
                return {
                    question: decodeHtml(result.question),
                    correctAnswer: decodeHtml(result.correct_answer),
                    incorrectAnswers: result.incorrect_answers.map(decodeHtml),
                    category: decodeHtml(result.category),
                    difficulty: result.difficulty.charAt(0).toUpperCase() + result.difficulty.slice(1)
                };
            } else {
                console.warn(`Attempt ${i+1}: response_code ${data.response_code}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (err) {
            console.error(`Attempt ${i+1} failed:`, err);
            if (i === attempts - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    throw new Error('Could not fetch a valid question');
}

async function fetchQuestion() {
    if (isFetching) return null;
    isFetching = true;
    try {
        questionTextEl.textContent = 'Loading next question...';
        submitBtn.disabled = true;
        setAnswersEnabled(false);
        const questionObj = await fetchQuestionWithRetry(3);
        return questionObj;
    } catch (err) {
        console.error('Fetch error:', err);
        showFeedback('❌ Failed to load question. Please check your connection.', true);
        questionTextEl.textContent = '⚠️ Unable to fetch question. Click "Restart quiz" to retry.';
        submitBtn.disabled = true;
        return null;
    } finally {
        isFetching = false;
        submitBtn.disabled = false;
    }
}

async function loadNewQuestion() {
    questionAnswered = false;
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackDiv.textContent = '';
    isWaitingForNext = false;
    clearSelectedAnswer();

    const qData = await fetchQuestion();
    if (!qData) return;

    currentQuestionData = qData;
    currentCorrectAnswer = qData.correctAnswer;
    currentAnswersArray = shuffleArray([qData.correctAnswer, ...qData.incorrectAnswers]);

    questionTextEl.textContent = qData.question;
    categoryDisplay.innerHTML = `<span class="meta-icon">📂</span> Category: <strong>${escapeHtml(qData.category)}</strong>`;
    difficultyDisplay.innerHTML = `<span class="meta-icon">⚙️</span> Difficulty: <strong>${escapeHtml(qData.difficulty)}</strong>`;

    renderAnswerOptions();
    setAnswersEnabled(true);
    submitBtn.disabled = false;
}

async function proceedToNextQuestion() {
    if (currentQuestionIndex === TOTAL_QUESTIONS) {
        endGame();
        return;
    }
    currentQuestionIndex++;
    updateCounterUI();
    await loadNewQuestion();
}

function endGame() {
    questionTextEl.textContent = `🏆 Quiz completed! Your final score: ${currentScore} / ${TOTAL_QUESTIONS}`;
    answersContainer.innerHTML = '<div style="text-align:center; padding:1rem;">🎉 Great job! Press Restart to play again.</div>';
    submitBtn.disabled = true;
    setAnswersEnabled(false);
    showFeedback(`Game over! Final score: ${currentScore} out of ${TOTAL_QUESTIONS}`, false);
}

// SUBMIT: checks answer, updates score, then auto-advances after 1.5 seconds
function handleSubmit() {
    if (questionAnswered) {
        showFeedback('Already answered! Loading next...', false);
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
    const userAnswer = selectedRadio.value;
    const isCorrect = (userAnswer === currentCorrectAnswer);
    if (isCorrect) {
        currentScore++;
        updateScoreUI();
        showFeedback(`✅ Correct! +1 point. Answer: ${currentCorrectAnswer}`, false);
    } else {
        showFeedback(`❌ Wrong! The correct answer is: ${currentCorrectAnswer}`, false);
    }
    questionAnswered = true;
    setAnswersEnabled(false);
    submitBtn.disabled = true;
    isWaitingForNext = true;

    setTimeout(async () => {
        if (currentQuestionIndex === TOTAL_QUESTIONS) {
            endGame();
        } else {
            await proceedToNextQuestion();
        }
        isWaitingForNext = false;
    }, 1500);
}

async function resetQuiz() {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    isWaitingForNext = false;
    isFetching = false;
    currentScore = 0;
    currentQuestionIndex = 1;
    questionAnswered = false;
    updateScoreUI();
    updateCounterUI();
    feedbackDiv.textContent = '';
    submitBtn.disabled = false;
    await loadNewQuestion();
    showFeedback('🔄 Quiz restarted! Good luck.', false);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m));
}

submitBtn.addEventListener('click', handleSubmit);
resetBtn.addEventListener('click', resetQuiz);

(async function init() {
    await loadNewQuestion();
    updateCounterUI();
    updateScoreUI();
})();