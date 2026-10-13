/**
 * Keyword/intent matching for the command bar.
 *
 * Deliberately lexical: the dashboard ships with no backend, so a query is
 * scored against each scenario's keyword set plus a handful of intent phrases
 * ("what if", "predict", "response time"). A score below the threshold is
 * reported as "no scenario matched" rather than guessing.
 */

import { SCENARIOS } from '@/data/scenarios';
import type { ScenarioId, ScenarioTimeline } from './types';

export interface IntentMatch {
  scenarioId: ScenarioId;
  scenario: ScenarioTimeline;
  confidence: number;
  reason: string;
  matched: string[];
}

export interface IntentResult {
  query: string;
  match: IntentMatch | null;
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'on',
  'in',
  'to',
  'for',
  'will',
  'how',
  'what',
  'if',
  'is',
  'are',
  'we',
  'do',
  'does',
  'our',
  'this',
  'that',
  'with',
  'at',
  'it',
  'by',
  'be',
  'city',
  'happen',
  'happens',
  'affect',
  'affects',
  'next',
]);

/** Phrases that point at a scenario regardless of its own keywords. */
const INTENT_PHRASES: { scenarioId: ScenarioId; phrases: string[]; weight: number }[] = [
  {
    scenarioId: 'parade',
    weight: 2.5,
    phrases: ['what if', 'what-if', 'predict', 'forecast', 'parade', 'saturday', 'event', 'spectators'],
  },
  {
    scenarioId: 'structure-fire',
    weight: 2,
    phrases: ['response time', 'emergency response', 'on fire', 'burning', 'smoke'],
  },
  {
    scenarioId: 'water-main',
    weight: 2,
    phrases: ['main break', 'burst', 'flooding', 'no water', 'pressure drop'],
  },
  {
    scenarioId: 'snowstorm',
    weight: 2,
    phrases: ['snow', 'plow', 'overnight', 'winter', 'freeze'],
  },
];

const MIN_CONFIDENCE = 0.16;

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function matchIntent(query: string): IntentResult {
  const tokens = tokenize(query);
  const lower = query.toLowerCase();
  if (tokens.length === 0) return { query, match: null };

  let best: IntentMatch | null = null;
  let bestScore = 0;

  for (const scenario of SCENARIOS) {
    const matched: string[] = [];
    let score = 0;

    for (const token of tokens) {
      const direct = scenario.keywords.find((keyword) => keyword === token);
      if (direct) {
        score += 2.2;
        matched.push(direct);
        continue;
      }
      // Partial stemming: "plowing" hits "plow", "firefighters" hits "fire".
      const partial = scenario.keywords.find(
        (keyword) => keyword.length > 3 && token.startsWith(keyword.slice(0, Math.max(3, keyword.length - 1))),
      );
      if (partial) {
        score += 1.4;
        matched.push(partial);
      }
    }

    for (const entry of INTENT_PHRASES) {
      if (entry.scenarioId !== scenario.id) continue;
      for (const phrase of entry.phrases) {
        if (lower.includes(phrase)) {
          score += entry.weight;
          matched.push(phrase);
        }
      }
    }

    // A named scenario mention should always win.
    if (lower.includes(scenario.name.toLowerCase())) {
      score += 3;
      matched.push(scenario.name);
    }
    if (lower.includes('parade') && scenario.id === 'parade') score += 2;

    if (score <= 0 || score <= bestScore) continue;
    bestScore = score;
    best = {
      scenarioId: scenario.id,
      scenario,
      confidence: Math.min(0.99, score / (tokens.length * 2.2 + 2)),
      matched: [...new Set(matched)],
      reason: buildReason(matched),
    };
  }

  if (!best || best.confidence < MIN_CONFIDENCE) return { query, match: null };
  return { query, match: best };
}

function buildReason(matched: string[]): string {
  const unique = [...new Set(matched)];
  if (unique.length === 0) return 'Closest scenario match';
  const shown = unique.slice(0, 4).map((m) => `“${m}”`);
  return `Matched ${shown.join(', ')}`;
}
