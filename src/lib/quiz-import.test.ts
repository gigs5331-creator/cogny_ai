/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { parseQuizImport, splitQuizParts } from "./quiz-import";

describe("manual quiz imports", () => {
  test("retains every imported question", () => {
    const cards = Array.from({ length: 50 }, (_, i) => ({ question: `Question ${i + 1}`, answer: `${i}` }));
    expect(parseQuizImport(JSON.stringify({ cards })).cards.length).toBe(50);
  });
  test("splits quizzes into parts of 20", () => {
    expect(splitQuizParts(Array.from({ length: 50 }, (_, i) => i)).map(p => p.length)).toEqual([20, 20, 10]);
  });
  test("rejects incomplete cards rather than silently losing questions", () => {
    expect(() => parseQuizImport('{"cards":[{"question":"Q","answer":"A"},{"question":"Missing answer"}]}')).toThrow("Question 2");
  });
  test("accepts fenced JSON and preserves valid multiple choice answers", () => {
    const result = parseQuizImport('```json\n{"cards":[{"question":"Choose the correct number","answer":"2","questionType":"multiple_choice","options":["1","2","3","4"]}]}\n```');
    expect(result.cards[0].questionType).toBe("multiple_choice");
    expect(result.cards[0].options).toContain("2");
  });
});