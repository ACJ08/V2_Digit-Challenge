export type QuestionToken = string | { gap: number };

type QuestionKind =
  | "sum2"
  | "product2"
  | "sum3"
  | "productPlus"
  | "sum4"
  | "mixedSum"
  | "productMinus"
  | "productPlus2"
  | "tripleProduct"
  | "tripleMinus"
  | "triplePlus"
  | "productMixed"
  | "pairedProducts"
  | "pairedDifference"
  | "groupProduct";

type Recipe = {
  kind: QuestionKind;
  digits: number[];
};

export type Question = {
  level: number;
  expression: string;
  target: number;
  gapCount: number;
  operators: string[];
  validAnswers: number[][];
  explanation: string;
  difficulty: "Easy" | "Moderate" | "Difficult" | "Very difficult";
  tokens: QuestionToken[];
};

const PATTERNS: Record<QuestionKind, QuestionToken[]> = {
  sum2: [{ gap: 0 }, "+", { gap: 1 }],
  product2: [{ gap: 0 }, "×", { gap: 1 }],
  sum3: [{ gap: 0 }, "+", { gap: 1 }, "+", { gap: 2 }],
  productPlus: ["(", { gap: 0 }, "×", { gap: 1 }, ")", "+", { gap: 2 }],
  sum4: [
    { gap: 0 },
    "+",
    { gap: 1 },
    "+",
    { gap: 2 },
    "+",
    { gap: 3 },
  ],
  mixedSum: [
    { gap: 0 },
    "+",
    { gap: 1 },
    "−",
    { gap: 2 },
    "+",
    { gap: 3 },
  ],
  productMinus: ["(", { gap: 0 }, "×", { gap: 1 }, ")", "−", { gap: 2 }],
  productPlus2: [
    "(",
    { gap: 0 },
    "×",
    { gap: 1 },
    ")",
    "+",
    { gap: 2 },
    "+",
    { gap: 3 },
  ],
  tripleProduct: [
    { gap: 0 },
    "×",
    { gap: 1 },
    "×",
    { gap: 2 },
  ],
  tripleMinus: [
    "(",
    { gap: 0 },
    "×",
    { gap: 1 },
    "×",
    { gap: 2 },
    ")",
    "−",
    { gap: 3 },
  ],
  triplePlus: [
    "(",
    { gap: 0 },
    "×",
    { gap: 1 },
    "×",
    { gap: 2 },
    ")",
    "+",
    { gap: 3 },
  ],
  productMixed: [
    "(",
    { gap: 0 },
    "×",
    { gap: 1 },
    ")",
    "+",
    { gap: 2 },
    "−",
    { gap: 3 },
  ],
  pairedProducts: [
    "(",
    { gap: 0 },
    "×",
    { gap: 1 },
    ")",
    "+",
    "(",
    { gap: 2 },
    "×",
    { gap: 3 },
    ")",
  ],
  pairedDifference: [
    "(",
    { gap: 0 },
    "×",
    { gap: 1 },
    ")",
    "−",
    "(",
    { gap: 2 },
    "×",
    { gap: 3 },
    ")",
  ],
  groupProduct: [
    "(",
    { gap: 0 },
    "+",
    { gap: 1 },
    ")",
    "×",
    { gap: 2 },
    "−",
    { gap: 3 },
  ],
};

function evaluate(kind: QuestionKind, digits: number[]) {
  const [a, b, c = 0, d = 0] = digits;
  switch (kind) {
    case "sum2":
      return a + b;
    case "product2":
      return a * b;
    case "sum3":
      return a + b + c;
    case "productPlus":
      return a * b + c;
    case "sum4":
      return a + b + c + d;
    case "mixedSum":
      return a + b - c + d;
    case "productMinus":
      return a * b - c;
    case "productPlus2":
      return a * b + c + d;
    case "tripleProduct":
      return a * b * c;
    case "tripleMinus":
      return a * b * c - d;
    case "triplePlus":
      return a * b * c + d;
    case "productMixed":
      return a * b + c - d;
    case "pairedProducts":
      return a * b + c * d;
    case "pairedDifference":
      return a * b - c * d;
    case "groupProduct":
      return (a + b) * c - d;
  }
}

function enumerateValidAnswers(
  kind: QuestionKind,
  gapCount: number,
  target: number,
) {
  const answers: number[][] = [];
  const search = (candidate: number[]) => {
    if (candidate.length === gapCount) {
      if (evaluate(kind, candidate) === target) answers.push(candidate);
      return;
    }
    for (let digit = 1; digit <= 9; digit += 1) {
      if (!candidate.includes(digit)) search([...candidate, digit]);
    }
  };
  search([]);
  return answers;
}

function tokenText(token: QuestionToken) {
  return typeof token === "string" ? token : `[G${token.gap + 1}]`;
}

function explanationText(tokens: QuestionToken[], digits: number[], target: number) {
  return `${tokens
    .map((token) => (typeof token === "string" ? token : digits[token.gap]))
    .join(" ")} = ${target}`;
}

// Each recipe contains an intentionally selected, unique-digit solution. At startup,
// every possible unique assignment is enumerated and retained as a valid answer.
const RECIPES: Recipe[] = [
  { kind: "sum2", digits: [1, 4] },
  { kind: "sum2", digits: [3, 5] },
  { kind: "product2", digits: [2, 3] },
  { kind: "sum2", digits: [2, 7] },
  { kind: "product2", digits: [2, 5] },
  { kind: "sum2", digits: [4, 7] },
  { kind: "product2", digits: [3, 4] },
  { kind: "sum2", digits: [6, 8] },
  { kind: "product2", digits: [3, 6] },
  { kind: "product2", digits: [5, 6] },

  { kind: "sum3", digits: [1, 3, 5] },
  { kind: "sum3", digits: [2, 4, 7] },
  { kind: "productPlus", digits: [2, 4, 3] },
  { kind: "sum3", digits: [5, 6, 8] },
  { kind: "tripleProduct", digits: [2, 3, 5] },
  { kind: "productPlus", digits: [3, 6, 2] },
  { kind: "sum3", digits: [4, 7, 9] },
  { kind: "tripleProduct", digits: [2, 4, 7] },
  { kind: "productPlus", digits: [5, 7, 4] },
  { kind: "tripleProduct", digits: [3, 5, 6] },

  { kind: "sum4", digits: [2, 4, 6, 7] },
  { kind: "mixedSum", digits: [8, 6, 2, 4] },
  { kind: "productPlus2", digits: [4, 6, 3, 1] },
  { kind: "productMinus", digits: [6, 7, 5] },
  { kind: "sum4", digits: [5, 7, 8, 9] },
  { kind: "mixedSum", digits: [9, 7, 3, 6] },
  { kind: "productPlus2", digits: [7, 5, 6, 2] },
  { kind: "productMinus", digits: [8, 7, 3] },
  { kind: "productMixed", digits: [6, 8, 5, 2] },
  { kind: "productPlus2", digits: [9, 5, 6, 1] },

  { kind: "tripleProduct", digits: [3, 7, 9] },
  { kind: "tripleMinus", digits: [3, 5, 8, 7] },
  { kind: "productMixed", digits: [7, 8, 6, 3] },
  { kind: "pairedProducts", digits: [3, 8, 5, 7] },
  { kind: "triplePlus", digits: [4, 6, 7, 3] },
  { kind: "pairedDifference", digits: [9, 7, 3, 4] },
  { kind: "groupProduct", digits: [5, 8, 6, 4] },
  { kind: "tripleMinus", digits: [4, 7, 9, 5] },
  { kind: "pairedProducts", digits: [6, 8, 7, 9] },
  { kind: "triplePlus", digits: [5, 7, 8, 2] },

  { kind: "tripleProduct", digits: [5, 8, 9] },
  { kind: "tripleMinus", digits: [5, 6, 9, 3] },
  { kind: "pairedDifference", digits: [8, 9, 5, 6] },
  { kind: "groupProduct", digits: [7, 9, 8, 5] },
  { kind: "triplePlus", digits: [6, 7, 8, 5] },
  { kind: "pairedProducts", digits: [7, 9, 6, 8] },
  { kind: "tripleMinus", digits: [6, 8, 9, 7] },
  { kind: "groupProduct", digits: [8, 9, 7, 4] },
  { kind: "pairedDifference", digits: [9, 8, 4, 7] },
  { kind: "triplePlus", digits: [7, 8, 9, 4] },

  { kind: "tripleMinus", digits: [5, 7, 9, 2] },
  { kind: "groupProduct", digits: [6, 9, 8, 5] },
  { kind: "pairedProducts", digits: [8, 9, 6, 7] },
  { kind: "triplePlus", digits: [5, 8, 9, 7] },
  { kind: "pairedDifference", digits: [9, 7, 5, 8] },
  { kind: "groupProduct", digits: [7, 9, 8, 3] },
  { kind: "tripleMinus", digits: [6, 7, 9, 5] },
  { kind: "pairedProducts", digits: [9, 8, 7, 6] },
  { kind: "groupProduct", digits: [8, 9, 7, 2] },
  { kind: "tripleMinus", digits: [5, 6, 9, 3] },
];

export const QUESTION_BANK: Question[] = RECIPES.map((recipe, index) => {
  const level = index + 1;
  const tokens = PATTERNS[recipe.kind];
  const target = evaluate(recipe.kind, recipe.digits);
  const validAnswers = enumerateValidAnswers(
    recipe.kind,
    recipe.digits.length,
    target,
  );

  if (!validAnswers.length) {
    throw new Error(`Level ${level} has no valid unique-digit solution.`);
  }

  const difficulty =
    level <= 10
      ? "Easy"
      : level <= 30
        ? "Moderate"
        : level <= 50
          ? "Difficult"
          : "Very difficult";

  return {
    level,
    expression: `${tokens.map(tokenText).join(" ")} = ${target}`,
    target,
    gapCount: recipe.digits.length,
    operators: tokens.filter(
      (token): token is string => typeof token === "string" && !/[()]/.test(token),
    ),
    validAnswers,
    explanation: explanationText(tokens, recipe.digits, target),
    difficulty,
    tokens,
  };
});

if (QUESTION_BANK.length < 60) {
  throw new Error("The question bank must contain at least 60 questions.");
}
