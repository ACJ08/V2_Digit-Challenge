import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { QUESTION_BANK, type Question, type QuestionToken } from "./questions";

const ASSESSMENT_SECONDS = 300;
const ASSESSMENT_MS = ASSESSMENT_SECONDS * 1000;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PRACTICE_APP_VERSION = "2.1";
const ACTIVE_SESSION_KEY = "digitChallengePracticeActiveSessionV2";
const PRACTICE_STATS_KEY = "digitChallengePracticeStatsV2";

type Phase = "home" | "select" | "confirm" | "playing" | "results";
type PracticeModeId =
  | "intermediate"
  | "advanced"
  | "final"
  | "mixed"
  | "levels1to30"
  | "levels1to50";

type PracticeMode = {
  id: PracticeModeId;
  label: string;
  shortLabel: string;
  range: string;
  meta?: string;
  description: string;
  poolStart: number;
  poolEnd: number;
};

type QuestionResult = {
  questionNumber: number;
  equation: string;
  correctAnswer: number[];
  userAnswer: (number | null)[];
  isCorrect: boolean | null;
  timeSpentMs: number;
  submitted: boolean;
};

type StoredSession = {
  selectedModeId: PracticeModeId;
  questions: Question[];
  currentIndex: number;
  answers: (number | null)[];
  activeGap: number;
  records: QuestionResult[];
  assessmentStartTime: number;
  questionStartTime: number;
};

type ModePerformance = {
  lastCompleted: number;
  lastCorrect: number;
  lastAccuracy: number;
  lastAverageTimeMs: number;
  lastBestStreak: number;
  lastSessionAt: number;
  bestCompleted: number;
  bestAccuracy: number;
  bestAverageTimeMs: number;
  bestStreak: number;
};

type PracticeStats = Partial<Record<PracticeModeId, ModePerformance>>;

const OPTIONS: PracticeMode[] = [
  {
    id: "intermediate",
    label: "Intermediate Levels",
    shortLabel: "Intermediate",
    range: "Question bank levels 11–30",
    description: "Moderate sums, products, and quick multi-step calculations.",
    poolStart: 10,
    poolEnd: 30,
  },
  {
    id: "advanced",
    label: "Advanced Levels",
    shortLabel: "Advanced",
    range: "Question bank levels 31–50",
    description: "Larger values, less obvious patterns, and mixed operations.",
    poolStart: 30,
    poolEnd: 50,
  },
  {
    id: "final",
    label: "Final Levels",
    shortLabel: "Final",
    range: "Question bank levels 51–60",
    description: "The hardest four-gap combinations under maximum pressure.",
    poolStart: 50,
    poolEnd: 60,
  },
  {
    id: "mixed",
    label: "Full Practice",
    shortLabel: "Mixed",
    range: "All question bank levels 1–60",
    description: "The complete progressive Digit Challenge question bank.",
    poolStart: 0,
    poolEnd: 60,
  },
  {
    id: "levels1to30",
    label: "Levels 1–30",
    shortLabel: "Levels 1–30",
    range: "Question bank levels 1–30",
    meta: "30 Levels · 5 Minutes",
    description: "A focused five-minute run using only question levels 1 through 30.",
    poolStart: 0,
    poolEnd: 30,
  },
  {
    id: "levels1to50",
    label: "Levels 1–50",
    shortLabel: "Levels 1–50",
    range: "Question bank levels 1–50",
    meta: "50 Levels · 5 Minutes",
    description: "A longer progressive run using only question levels 1 through 50.",
    poolStart: 0,
    poolEnd: 50,
  },
];

function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "digit" | "gap" | "option";
}) {
  return createElement("button", {
    ...props,
    className: `button button--${variant} ${className}`,
  });
}

function Heading({
  level = 1,
  id,
  className,
  children,
}: {
  level?: 1 | 2 | 3;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return createElement(`h${level}`, { id, className }, children);
}

function readStoredSession(): StoredSession | null {
  try {
    const value = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as StoredSession;
    if (
      !session.assessmentStartTime ||
      !OPTIONS.some((option) => option.id === session.selectedModeId) ||
      !session.questions?.length ||
      Date.now() >= session.assessmentStartTime + ASSESSMENT_MS
    ) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function shuffleByDifficulty(questions: Question[]) {
  const shuffled: Question[] = [];
  for (let index = 0; index < questions.length; index += 10) {
    const band = [...questions.slice(index, index + 10)];
    for (let cursor = band.length - 1; cursor > 0; cursor -= 1) {
      const randomIndex = Math.floor(Math.random() * (cursor + 1));
      [band[cursor], band[randomIndex]] = [band[randomIndex], band[cursor]];
    }
    shuffled.push(...band);
  }
  return shuffled.map((question, index) => ({ ...question, level: index + 1 }));
}

function buildPracticeQueue(mode: PracticeMode) {
  const source = QUESTION_BANK.slice(mode.poolStart, mode.poolEnd);
  const queue: Question[] = [];

  // A long queue lets practice continue for the full five minutes. Each pass
  // retains the category's easy-to-hard order while varying nearby questions.
  for (let round = 0; round < 18; round += 1) {
    if (mode.id === "mixed") {
      queue.push(...shuffleByDifficulty(source));
      continue;
    }
    for (let index = 0; index < source.length; index += 5) {
      const group = [...source.slice(index, index + 5)];
      for (let cursor = group.length - 1; cursor > 0; cursor -= 1) {
        const randomIndex = Math.floor(Math.random() * (cursor + 1));
        [group[cursor], group[randomIndex]] = [group[randomIndex], group[cursor]];
      }
      queue.push(...group);
    }
  }

  return queue.map((question, index) => ({ ...question, level: index + 1 }));
}

function readPracticeStats(): PracticeStats {
  try {
    return JSON.parse(localStorage.getItem(PRACTICE_STATS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function calculateBestStreak(results: QuestionResult[]) {
  let current = 0;
  let best = 0;
  results.forEach((result) => {
    current = result.isCorrect ? current + 1 : 0;
    best = Math.max(best, current);
  });
  return best;
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(totalMs: number) {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${String(seconds).padStart(2, "0")} seconds`;
}

function formatAnswer(answer: (number | null)[] | undefined) {
  if (!answer?.length) return "—";
  return answer.map((digit) => digit ?? "_").join(" · ");
}

function formatFilledEquation(question: Question, answer: number[]) {
  const leftSide = question.tokens
    .map((token) => (typeof token === "string" ? token : answer[token.gap]))
    .join(" ");
  return `${leftSide} = ${question.target}`;
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={`stat ${emphasis ? "stat--emphasis" : ""}`}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
    </div>
  );
}

function AppHeader({
  onHome,
  compact = false,
}: {
  onHome: () => void;
  compact?: boolean;
}) {
  return (
    <header className="app-header">
      <Button
        variant="secondary"
        className="brand-button"
        onClick={onHome}
        disabled={compact}
      >
        <span className="brand__mark" aria-hidden="true">
          9
        </span>
        <span className="brand__name">Digit Challenge</span>
      </Button>
      {!compact && <span className="brand__tagline">Numerical reasoning practice</span>}
    </header>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("home");
  const [selectedModeId, setSelectedModeId] = useState<PracticeModeId | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [activeGap, setActiveGap] = useState(0);
  const [records, setRecords] = useState<QuestionResult[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_SECONDS);
  const [assessmentStartTime, setAssessmentStartTime] = useState<number | null>(null);
  const [assessmentEndTime, setAssessmentEndTime] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "correct" | "incorrect";
    text: string;
  } | null>(null);
  const [savedSession, setSavedSession] = useState<StoredSession | null>(
    readStoredSession,
  );
  const [practiceStats, setPracticeStats] =
    useState<PracticeStats>(readPracticeStats);
  const [personalBest, setPersonalBest] = useState(() => {
    try {
      return Number(localStorage.getItem("digitChallengeBestScore")) || 0;
    } catch {
      return 0;
    }
  });

  const startTimeRef = useRef<number | null>(null);
  const questionStartRef = useRef<number>(0);
  const currentIndexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);
  const answersRef = useRef<(number | null)[]>([]);
  const recordsRef = useRef<QuestionResult[]>([]);
  const lockedRef = useRef(false);
  const finishGuardRef = useRef(false);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const currentQuestion = questions[currentIndex];
  const selectedMode =
    OPTIONS.find((option) => option.id === selectedModeId) ?? null;
  const usedDigits = useMemo(
    () => new Set(answers.filter((answer): answer is number => answer !== null)),
    [answers],
  );
  const answerComplete =
    answers.length > 0 && answers.every((answer) => answer !== null);

  const returnHome = () => {
    if (phase === "playing") return;
    setPhase("home");
    setSelectedModeId(null);
    setFeedback(null);
  };

  const prepareSelection = () => {
    setSelectedModeId(null);
    setPhase("select");
  };

  const selectAssessment = (modeId: PracticeModeId) => {
    setSelectedModeId(modeId);
    setPhase("confirm");
  };

  const resetQuestion = (question: Question, now: number) => {
    const emptyAnswer = Array(question.gapCount).fill(null);
    answersRef.current = emptyAnswer;
    questionStartRef.current = now;
    setAnswers(emptyAnswer);
    setActiveGap(0);
  };

  const startAssessment = () => {
    if (!selectedMode) return;
    const now = Date.now();
    const nextQuestions = buildPracticeQueue(selectedMode);

    finishGuardRef.current = false;
    lockedRef.current = false;
    startTimeRef.current = now;
    questionStartRef.current = now;
    currentIndexRef.current = 0;
    questionsRef.current = nextQuestions;
    recordsRef.current = [];

    setQuestions(nextQuestions);
    setCurrentIndex(0);
    setRecords([]);
    setAssessmentStartTime(now);
    setAssessmentEndTime(null);
    setTimeRemaining(ASSESSMENT_SECONDS);
    setFeedback(null);
    setLocked(false);
    resetQuestion(nextQuestions[0], now);
    setPhase("playing");
  };

  const resumeAssessment = () => {
    if (!savedSession) return;
    finishGuardRef.current = false;
    lockedRef.current = false;
    startTimeRef.current = savedSession.assessmentStartTime;
    questionStartRef.current = savedSession.questionStartTime;
    currentIndexRef.current = savedSession.currentIndex;
    questionsRef.current = savedSession.questions;
    answersRef.current = savedSession.answers;
    recordsRef.current = savedSession.records;

    setSelectedModeId(savedSession.selectedModeId);
    setQuestions(savedSession.questions);
    setCurrentIndex(savedSession.currentIndex);
    setAnswers(savedSession.answers);
    setActiveGap(savedSession.activeGap);
    setRecords(savedSession.records);
    setAssessmentStartTime(savedSession.assessmentStartTime);
    setAssessmentEndTime(null);
    setTimeRemaining(
      Math.max(
        0,
        Math.ceil(
          (savedSession.assessmentStartTime + ASSESSMENT_MS - Date.now()) / 1000,
        ),
      ),
    );
    setFeedback(null);
    setLocked(false);
    setPhase("playing");
  };

  const finishAssessment = (
    reason: "completed" | "timeout" | "stopped",
    requestedEndTime = Date.now(),
  ) => {
    if (finishGuardRef.current) return;
    finishGuardRef.current = true;
    lockedRef.current = true;

    const start = startTimeRef.current ?? requestedEndTime;
    const endTime =
      reason === "timeout"
        ? Math.min(requestedEndTime, start + ASSESSMENT_MS)
        : requestedEndTime;
    let finalRecords = [...recordsRef.current];
    const index = currentIndexRef.current;
    const activeQuestion = questionsRef.current[index];
    const alreadyRecorded = finalRecords.some(
      (record) => record.questionNumber === index + 1,
    );

    if (reason !== "completed" && activeQuestion && !alreadyRecorded) {
      finalRecords.push({
        questionNumber: index + 1,
        equation: activeQuestion.expression,
        correctAnswer: activeQuestion.validAnswers[0],
        userAnswer: [...answersRef.current],
        isCorrect: null,
        timeSpentMs: Math.max(0, endTime - questionStartRef.current),
        submitted: false,
      });
    }

    recordsRef.current = finalRecords;
    setRecords(finalRecords);
    setAssessmentEndTime(endTime);
    setTimeRemaining(
      Math.max(0, Math.ceil((start + ASSESSMENT_MS - endTime) / 1000)),
    );
    setLocked(true);
    setPhase("results");
    setSavedSession(null);
    const modeId = selectedModeId ?? "mixed";
    const submittedResults = finalRecords.filter((record) => record.submitted);
    const correctResults = submittedResults.filter((record) => record.isCorrect);
    const accuracy = submittedResults.length
      ? (correctResults.length / submittedResults.length) * 100
      : 0;
    const averageTimeMs = submittedResults.length
      ? submittedResults.reduce(
          (sum, record) => sum + record.timeSpentMs,
          0,
        ) / submittedResults.length
      : 0;
    const sessionBestStreak = calculateBestStreak(submittedResults);
    const previous = practiceStats[modeId];
    const nextPerformance: ModePerformance = {
      lastCompleted: submittedResults.length,
      lastCorrect: correctResults.length,
      lastAccuracy: accuracy,
      lastAverageTimeMs: averageTimeMs,
      lastBestStreak: sessionBestStreak,
      lastSessionAt: endTime,
      bestCompleted: Math.max(previous?.bestCompleted ?? 0, submittedResults.length),
      bestAccuracy: Math.max(previous?.bestAccuracy ?? 0, accuracy),
      bestAverageTimeMs:
        averageTimeMs > 0
          ? previous?.bestAverageTimeMs
            ? Math.min(previous.bestAverageTimeMs, averageTimeMs)
            : averageTimeMs
          : previous?.bestAverageTimeMs ?? 0,
      bestStreak: Math.max(previous?.bestStreak ?? 0, sessionBestStreak),
    };
    const nextStats = { ...practiceStats, [modeId]: nextPerformance };
    setPracticeStats(nextStats);
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.setItem(PRACTICE_STATS_KEY, JSON.stringify(nextStats));
      localStorage.setItem(
        "digitChallengeLastResult",
        JSON.stringify({
          selectedModeId: modeId,
          assessmentStartTime: start,
          assessmentEndTime: endTime,
          elapsedTimeMs: endTime - start,
          remainingTimeMs: Math.max(0, start + ASSESSMENT_MS - endTime),
          records: finalRecords,
        }),
      );
    } catch {
      // Results remain available in application state when storage is unavailable.
    }
  };

  const chooseDigit = (digit: number) => {
    if (lockedRef.current || usedDigits.has(digit)) return;
    const next = [...answersRef.current];
    next[activeGap] = digit;
    answersRef.current = next;
    setAnswers(next);

    const nextEmpty = next.findIndex(
      (answer, index) => index > activeGap && answer === null,
    );
    const firstEmpty = next.findIndex((answer) => answer === null);
    if (nextEmpty >= 0) setActiveGap(nextEmpty);
    else if (firstEmpty >= 0) setActiveGap(firstEmpty);
  };

  const clearGap = (index: number) => {
    if (lockedRef.current) return;
    const next = answersRef.current.map((answer, answerIndex) =>
      answerIndex === index ? null : answer,
    );
    answersRef.current = next;
    setAnswers(next);
    setActiveGap(index);
  };

  const clearAnswer = () => {
    if (!currentQuestion || lockedRef.current) return;
    const emptyAnswer = Array(currentQuestion.gapCount).fill(null);
    answersRef.current = emptyAnswer;
    setAnswers(emptyAnswer);
    setActiveGap(0);
  };

  const submitAnswer = () => {
    if (
      !currentQuestion ||
      !answerComplete ||
      lockedRef.current ||
      phase !== "playing"
    ) {
      return;
    }

    const now = Date.now();
    const deadline = (startTimeRef.current ?? now) + ASSESSMENT_MS;
    if (now >= deadline) {
      finishAssessment("timeout", deadline);
      return;
    }

    lockedRef.current = true;
    setLocked(true);
    const submittedAnswer = answersRef.current as number[];
    const isCorrect = currentQuestion.validAnswers.some((validAnswer) =>
      validAnswer.every((digit, index) => digit === submittedAnswer[index]),
    );
    const result: QuestionResult = {
      questionNumber: currentIndex + 1,
      equation: currentQuestion.expression,
      correctAnswer: isCorrect
        ? [...submittedAnswer]
        : currentQuestion.validAnswers[0],
      userAnswer: [...submittedAnswer],
      isCorrect,
      timeSpentMs: Math.max(0, now - questionStartRef.current),
      submitted: true,
    };
    const nextRecords = [...recordsRef.current, result];
    recordsRef.current = nextRecords;
    setRecords(nextRecords);
    setFeedback({
      kind: isCorrect ? "correct" : "incorrect",
      text: isCorrect ? "Correct" : "Incorrect",
    });

    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedback(null), 700);

    if (currentIndex + 1 >= questions.length) {
      finishAssessment("completed", now);
      return;
    }

    const nextIndex = currentIndex + 1;
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
    resetQuestion(questions[nextIndex], now);
    window.setTimeout(() => {
      lockedRef.current = false;
      setLocked(false);
    }, 140);
  };

  useEffect(() => {
    if (phase !== "playing" || !startTimeRef.current) return;
    const updateTimer = () => {
      const deadline = (startTimeRef.current ?? Date.now()) + ASSESSMENT_MS;
      const remainingMs = Math.max(0, deadline - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      setTimeRemaining((previous) =>
        previous === remainingSeconds ? previous : remainingSeconds,
      );
      if (remainingMs <= 0) finishAssessment("timeout", deadline);
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (
      phase !== "playing" ||
      !selectedModeId ||
      !assessmentStartTime ||
      !questions.length
    ) {
      return;
    }
    const session: StoredSession = {
      selectedModeId,
      questions,
      currentIndex,
      answers,
      activeGap,
      records,
      assessmentStartTime,
      questionStartTime: questionStartRef.current,
    };
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Persistence is an enhancement; the live assessment can continue without it.
    }
  }, [
    phase,
    selectedModeId,
    questions,
    currentIndex,
    answers,
    activeGap,
    records,
    assessmentStartTime,
    timeRemaining,
  ]);

  useEffect(() => {
    if (phase !== "results") return;
    const correctCount = records.filter((record) => record.isCorrect).length;
    if (correctCount > personalBest) {
      setPersonalBest(correctCount);
      try {
        localStorage.setItem("digitChallengeBestScore", String(correctCount));
      } catch {
        // Personal-best persistence is optional.
      }
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^[1-9]$/.test(event.key)) chooseDigit(Number(event.key));
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        clearAnswer();
      }
      if (event.key === "Enter") submitAnswer();
      if (event.key === "ArrowLeft") {
        setActiveGap((value) => Math.max(0, value - 1));
      }
      if (event.key === "ArrowRight") {
        setActiveGap((value) => Math.min(answersRef.current.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  const renderToken = (token: QuestionToken, tokenIndex: number) => {
    if (typeof token === "string") {
      return (
        <span className="equation__operator" key={`${token}-${tokenIndex}`}>
          {token}
        </span>
      );
    }
    const value = answers[token.gap];
    const isActive = activeGap === token.gap;
    return (
      <Button
        variant="gap"
        className={`${isActive ? "is-active" : ""} ${value !== null ? "is-filled" : ""}`}
        key={`gap-${token.gap}`}
        onClick={() => {
          setActiveGap(token.gap);
          if (value !== null) clearGap(token.gap);
        }}
        aria-label={`Gap ${token.gap + 1}${value ? `, filled with ${value}` : ", empty"}`}
        aria-pressed={isActive}
        disabled={locked}
      >
        {value ?? ""}
      </Button>
    );
  };

  const answeredRecords = records.filter((record) => record.submitted);
  const correctCount = answeredRecords.filter((record) => record.isCorrect).length;
  const incorrectCount = answeredRecords.length - correctCount;
  const accuracy = answeredRecords.length
    ? (correctCount / answeredRecords.length) * 100
    : 0;
  const score = accuracy;
  const totalElapsedMs =
    assessmentStartTime && assessmentEndTime
      ? assessmentEndTime - assessmentStartTime
      : 0;
  const timedRecords = answeredRecords.filter((record) => record.timeSpentMs > 0);
  const averageTimeMs = timedRecords.length
    ? timedRecords.reduce((sum, record) => sum + record.timeSpentMs, 0) /
      timedRecords.length
    : 0;
  const fastestRecord = timedRecords.length
    ? timedRecords.reduce((fastest, record) =>
        record.timeSpentMs < fastest.timeSpentMs ? record : fastest,
      )
    : null;
  const slowestRecord = timedRecords.length
    ? timedRecords.reduce((slowest, record) =>
        record.timeSpentMs > slowest.timeSpentMs ? record : slowest,
      )
    : null;
  const recordByQuestion = new Map(
    records.map((record) => [record.questionNumber, record]),
  );
  const bestStreak = calculateBestStreak(answeredRecords);
  const reviewQuestions = questions.slice(0, records.length);
  const overallBestCompleted = Math.max(
    0,
    ...OPTIONS.map((option) => practiceStats[option.id]?.bestCompleted ?? 0),
  );
  const currentModeStats = selectedModeId
    ? practiceStats[selectedModeId]
    : undefined;

  return (
    <main className="app-shell">
      <AppHeader onHome={returnHome} compact={phase === "playing"} />

      {phase === "home" && (
        <section className="intro-panel" aria-labelledby="home-title">
          <div className="intro-panel__copy">
            <span className="eyebrow">Digit Challenge practice</span>
            <Heading id="home-title">Train the level that challenges you.</Heading>
            <p>
              Build speed progressively with dedicated Intermediate, Advanced, and
              Final five-minute practice sessions.
            </p>
            <div className="intro-actions">
              <Button onClick={prepareSelection}>
                Choose practice mode <span aria-hidden="true">→</span>
              </Button>
              {savedSession && (
                <Button variant="secondary" onClick={resumeAssessment}>
                  Resume saved assessment
                </Button>
              )}
            </div>
          </div>

          <div className="preview-card" aria-label="Example question">
            <div className="preview-card__topline">
              <span>Practice preview</span>
              <span>5:00</span>
            </div>
            <div className="preview-equation" aria-hidden="true">
              <span className="preview-gap">3</span>
              <span>+</span>
              <span className="preview-gap preview-gap--active"></span>
              <span>=</span>
              <span>8</span>
            </div>
            <div className="preview-card__hint">
              Select <strong>5</strong> to complete the equation
            </div>
          </div>

          <div className="intro-meta">
            <div>
              <strong>{OPTIONS.length}</strong>
              <span>practice modes</span>
            </div>
            <div>
              <strong>1–9</strong>
              <span>unique digits</span>
            </div>
            <div>
              <strong>{overallBestCompleted}</strong>
              <span>best completed</span>
            </div>
          </div>
        </section>
      )}

      {phase === "select" && (
        <section className="selection-panel" aria-labelledby="selection-title">
          <div className="screen-heading">
            <Button variant="secondary" className="back-button" onClick={returnHome}>
              <span aria-hidden="true">←</span> Back
            </Button>
            <span className="eyebrow">Focused practice</span>
            <Heading id="selection-title">Choose your training level</Heading>
            <p>
              Each mode has an independent five-minute timer and tracks its own
              personal records.
            </p>
          </div>

          <div className="option-grid">
            {OPTIONS.map((option, index) => (
              <Button
                variant="option"
                className={`option-card--${option.id}`}
                key={option.id}
                onClick={() => selectAssessment(option.id)}
              >
                <span className="option-card__index">0{index + 1}</span>
                <span className="option-card__body">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                  <span>{option.meta ?? `${option.range} · 5 minutes`}</span>
                </span>
                <span className="option-card__arrow" aria-hidden="true">
                  →
                </span>
              </Button>
            ))}
          </div>

          <div className="dashboard-section">
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">Practice dashboard</span>
                <Heading level={2}>Your progress by category</Heading>
              </div>
              <span>Personal records are saved on this device</span>
            </div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Time</th>
                    <th scope="col">Last completed</th>
                    <th scope="col">Last correct</th>
                    <th scope="col">Last accuracy</th>
                    <th scope="col">Best completed</th>
                  </tr>
                </thead>
                <tbody>
                  {OPTIONS.map((option) => {
                    const stats = practiceStats[option.id];
                    return (
                      <tr key={option.id}>
                        <td>
                          <strong>{option.shortLabel}</strong>
                        </td>
                        <td>5:00</td>
                        <td>{stats?.lastCompleted ?? "—"}</td>
                        <td>{stats?.lastCorrect ?? "—"}</td>
                        <td>
                          {stats ? `${stats.lastAccuracy.toFixed(1)}%` : "—"}
                        </td>
                        <td>{stats?.bestCompleted ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {phase === "confirm" && selectedMode && (
        <section className="confirm-panel" aria-labelledby="confirm-title">
          <div className="confirm-card">
            <span className="confirm-card__number">5</span>
            <span className="eyebrow">Ready when you are</span>
            <Heading id="confirm-title">{selectedMode.label} Practice</Heading>
            <p>
              Solve as many {selectedMode.shortLabel.toLowerCase()} problems as
              possible. The timer starts only when you press Start.
            </p>
            <div className="confirm-facts">
              <div>
                <span>Goal</span>
                <strong>Max solved</strong>
              </div>
              <div>
                <span>Time limit</span>
                <strong>05:00</strong>
              </div>
              <div>
                <span>Question pool</span>
                <strong>{selectedMode.poolEnd - selectedMode.poolStart} levels</strong>
              </div>
            </div>
            <div className="confirm-actions">
              <Button variant="secondary" onClick={() => setPhase("select")}>
                Change assessment
              </Button>
              <Button onClick={startAssessment}>
                Start {selectedMode.shortLabel} practice{" "}
                <span aria-hidden="true">→</span>
              </Button>
            </div>
          </div>
        </section>
      )}

      {phase === "playing" && currentQuestion && (
        <section className="game-panel" aria-label="Digit Challenge assessment">
          <div className="game-status">
            <div className="level-block">
              <span className="status-label">Question</span>
              <strong>
                {selectedMode?.shortLabel} {String(currentIndex + 1).padStart(2, "0")}
              </strong>
            </div>
            <progress
              className="progress-track"
              max={ASSESSMENT_SECONDS}
              value={ASSESSMENT_SECONDS - timeRemaining}
              aria-label={`${ASSESSMENT_SECONDS - timeRemaining} seconds elapsed`}
            />
            <div
              className={`timer-block ${timeRemaining <= 30 ? "timer-block--urgent" : ""}`}
            >
              <span className="status-label">Time remaining</span>
              <strong>{formatClock(timeRemaining)}</strong>
            </div>
          </div>

          <div className="challenge-area">
            <div className="challenge-heading">
              <span className="eyebrow">{currentQuestion.difficulty}</span>
              <p>Use each digit no more than once</p>
            </div>

            <div className="equation" aria-label={currentQuestion.expression}>
              {currentQuestion.tokens.map(renderToken)}
              <span className="equation__operator">=</span>
              <strong className="equation__target">{currentQuestion.target}</strong>
            </div>

            <div
              className={`feedback ${feedback ? `feedback--${feedback.kind}` : ""}`}
              role="status"
              aria-live="polite"
            >
              {feedback?.text ?? "Select a gap, then choose a digit"}
            </div>

            <div className="keypad" aria-label="Digit choices">
              {DIGITS.map((digit) => (
                <Button
                  variant="digit"
                  key={digit}
                  disabled={usedDigits.has(digit) || locked}
                  onClick={() => chooseDigit(digit)}
                  aria-label={`Choose digit ${digit}`}
                >
                  {digit}
                </Button>
              ))}
            </div>

            <div className="game-actions">
              <Button variant="secondary" onClick={clearAnswer} disabled={locked}>
                Clear
              </Button>
              <Button onClick={submitAnswer} disabled={!answerComplete || locked}>
                Submit
              </Button>
            </div>
            <div className="practice-controls">
              <p className="keyboard-hint">
                Keyboard: 1–9 to fill · arrows to move · backspace to clear · enter
                to submit
              </p>
              <Button
                variant="secondary"
                className="stop-button"
                onClick={() => finishAssessment("stopped")}
              >
                Stop practice
              </Button>
            </div>
          </div>
        </section>
      )}

      {phase === "results" && selectedMode && (
        <section className="results-page" aria-labelledby="results-title">
          <div className="results-hero">
            <div>
              <span className="completion-mark" aria-hidden="true">
                ✓
              </span>
              <span className="eyebrow">Digit Challenge results</span>
              <Heading id="results-title">
                {score >= 80
                  ? "Excellent pace and accuracy."
                  : score >= 60
                    ? "A strong practice run."
                    : "Build speed through repetition."}
              </Heading>
              <p>
                Practice mode: <strong>{selectedMode.label}</strong>
              </p>
            </div>
            <div className="results-score">
              <span>Problems completed</span>
              <strong>
                {answeredRecords.length}
              </strong>
              <span>within five minutes</span>
            </div>
          </div>

          <div className="results-grid">
            <Stat label="Completed" value={answeredRecords.length} emphasis />
            <Stat label="Correct" value={correctCount} emphasis />
            <Stat label="Incorrect" value={incorrectCount} />
            <Stat label="Accuracy" value={`${accuracy.toFixed(1)}%`} />
            <Stat label="Best streak" value={bestStreak} />
            <Stat label="Total time" value={formatClock(Math.round(totalElapsedMs / 1000))} />
            <Stat label="Time remaining" value={formatClock(timeRemaining)} />
            <Stat
              label="Average / question"
              value={averageTimeMs ? `${(averageTimeMs / 1000).toFixed(1)} sec` : "—"}
            />
            <Stat
              label="Fastest"
              value={
                fastestRecord
                  ? `Q${fastestRecord.questionNumber} · ${(fastestRecord.timeSpentMs / 1000).toFixed(1)}s`
                  : "—"
              }
            />
            <Stat
              label="Slowest"
              value={
                slowestRecord
                  ? `Q${slowestRecord.questionNumber} · ${(slowestRecord.timeSpentMs / 1000).toFixed(1)}s`
                  : "—"
              }
            />
          </div>

          <div className="personal-records">
            <div>
              <span className="eyebrow">{selectedMode.shortLabel} personal bests</span>
              <Heading level={2}>Records for this category</Heading>
            </div>
            <Stat
              label="Most completed"
              value={currentModeStats?.bestCompleted ?? answeredRecords.length}
            />
            <Stat
              label="Highest accuracy"
              value={`${(currentModeStats?.bestAccuracy ?? accuracy).toFixed(1)}%`}
            />
            <Stat
              label="Fastest average"
              value={
                currentModeStats?.bestAverageTimeMs
                  ? `${(currentModeStats.bestAverageTimeMs / 1000).toFixed(1)} sec`
                  : "—"
              }
            />
            <Stat
              label="Best streak"
              value={currentModeStats?.bestStreak ?? bestStreak}
            />
          </div>

          <div className="time-summary">
            <span>Total time taken</span>
            <strong>{formatDuration(totalElapsedMs)}</strong>
            <p>
              Started{" "}
              {assessmentStartTime
                ? new Date(assessmentStartTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "—"}
            </p>
          </div>

          <div className="review-section">
            <div className="review-heading">
              <div>
                <span className="eyebrow">Complete review</span>
                <Heading level={2}>Question breakdown</Heading>
              </div>
              <span>{reviewQuestions.length} displayed questions</span>
            </div>

            <div className="review-table-wrap">
              <table className="review-table">
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Equation</th>
                    <th scope="col">Your answer</th>
                    <th scope="col">Correct answer</th>
                    <th scope="col">Result</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewQuestions.map((question, index) => {
                    const result = recordByQuestion.get(index + 1);
                    const correctAnswer =
                      result?.correctAnswer ?? question.validAnswers[0];
                    const status = result?.submitted
                      ? result.isCorrect
                        ? "Correct"
                        : "Incorrect"
                      : "Unanswered";
                    return (
                      <tr key={`${question.expression}-${index}`}>
                        <td data-label="Question">
                          <strong>Q{index + 1}</strong>
                        </td>
                        <td data-label="Equation" className="review-equation">
                          {question.expression}
                        </td>
                        <td data-label="Your answer">
                          {formatAnswer(result?.userAnswer)}
                        </td>
                        <td data-label="Correct answer">
                          <span className="correct-answer">
                            {formatAnswer(correctAnswer)}
                          </span>
                          <small>{formatFilledEquation(question, correctAnswer)}</small>
                        </td>
                        <td data-label="Result">
                          <span
                            className={`result-badge result-badge--${status.toLowerCase()}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td data-label="Time">
                          {result
                            ? `${(result.timeSpentMs / 1000).toFixed(1)} sec`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="results-actions">
            <Button variant="secondary" onClick={prepareSelection}>
              Back to level select
            </Button>
            <Button onClick={startAssessment}>
              Try again <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}

      <footer className="app-footer">
        <span>Practice simulator</span>
        <span>
          Verified equations · Accurate timing · Saved progress · v
          {PRACTICE_APP_VERSION}
        </span>
      </footer>
    </main>
  );
}
