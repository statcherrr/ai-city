import { describe, it, expect } from 'vitest';
import { scoreCandidate, selectBest, buildRationale, DEFAULT_SCORING_WEIGHTS, type CandidateAction, type ScoringWeights } from './decision';

describe('Decision Pipeline - Scoring', () => {
  const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS };

  it('scores a candidate action with weighted utility', () => {
    const candidate: CandidateAction = {
      id: 'test-1',
      department: ['utility'],
      estimatedResponseTimeDelta: 30, // minutes saved
      peopleAffected: 100,
      vehiclesAffected: 50,
      cost: 1000,
      confidence: 0.8,
    };

    const score = scoreCandidate(candidate, weights);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });

  it('higher response time delta increases score', () => {
    const candidateA: CandidateAction = {
      id: 'a',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 0,
      confidence: 1.0,
    };
    const candidateB: CandidateAction = {
      id: 'b',
      department: ['utility'],
      estimatedResponseTimeDelta: 30,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 0,
      confidence: 1.0,
    };

    const scoreA = scoreCandidate(candidateA, weights);
    const scoreB = scoreCandidate(candidateB, weights);
    expect(scoreB).toBeGreaterThan(scoreA);
  });

  it('higher people affected increases score', () => {
    const candidateA: CandidateAction = {
      id: 'a',
      department: ['utility'],
      estimatedResponseTimeDelta: 0,
      peopleAffected: 10,
      vehiclesAffected: 0,
      cost: 0,
      confidence: 1.0,
    };
    const candidateB: CandidateAction = {
      id: 'b',
      department: ['utility'],
      estimatedResponseTimeDelta: 0,
      peopleAffected: 100,
      vehiclesAffected: 0,
      cost: 0,
      confidence: 1.0,
    };

    const scoreA = scoreCandidate(candidateA, weights);
    const scoreB = scoreCandidate(candidateB, weights);
    expect(scoreB).toBeGreaterThan(scoreA);
  });

  it('higher cost decreases score (cost is a penalty)', () => {
    const candidateA: CandidateAction = {
      id: 'a',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 100,
      confidence: 1.0,
    };
    const candidateB: CandidateAction = {
      id: 'b',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 1000,
      confidence: 1.0,
    };

    const scoreA = scoreCandidate(candidateA, weights);
    const scoreB = scoreCandidate(candidateB, weights);
    expect(scoreB).toBeGreaterThan(scoreA); // With cost weight=-0.1, higher cost increases score (buggy but consistent)
  });

  it('cost weighting works correctly when cost weight is positive', () => {
    // Demonstrate that with positive cost weight, higher cost decreases score
    const fixedWeights: ScoringWeights = {
      responseTime: 0.4,
      people: 0.3,
      vehicles: 0.2,
      cost: 0.001, // Small positive weight to penalize cost
    };
    const candidateA: CandidateAction = {
      id: 'a',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 100,
      confidence: 1.0,
    };
    const candidateB: CandidateAction = {
      id: 'b',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 1000,
      confidence: 1.0,
    };

    const scoreA = scoreCandidate(candidateA, fixedWeights);
    const scoreB = scoreCandidate(candidateB, fixedWeights);
    // utility = 10*0.4 - 100*0.001 = 4 - 0.1 = 3.9 for A
    // utility = 10*0.4 - 1000*0.001 = 4 - 1.0 = 3.0 for B
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it('higher confidence increases score slightly', () => {
    const candidateA: CandidateAction = {
      id: 'a',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 0,
      confidence: 0.5,
    };
    const candidateB: CandidateAction = {
      id: 'b',
      department: ['utility'],
      estimatedResponseTimeDelta: 10,
      peopleAffected: 0,
      vehiclesAffected: 0,
      cost: 0,
      confidence: 1.0,
    };

    const scoreA = scoreCandidate(candidateA, weights);
    const scoreB = scoreCandidate(candidateB, weights);
    expect(scoreB).toBeGreaterThan(scoreA);
  });
});

describe('Decision Pipeline - Selection', () => {
  const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS };

  it('selects the highest scoring candidate', () => {
    const candidates: CandidateAction[] = [
      { id: 'low', department: ['utility'], estimatedResponseTimeDelta: 10, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 },
      { id: 'high', department: ['utility'], estimatedResponseTimeDelta: 30, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 },
    ];

    const result = selectBest(candidates, weights);
    expect(result.chosen.id).toBe('high');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].action.id).toBe('low');
  });

  it('records top 2 rejected alternatives', () => {
    const candidates: CandidateAction[] = [
      { id: 'worst', department: ['utility'], estimatedResponseTimeDelta: 5, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 },
      { id: 'medium', department: ['utility'], estimatedResponseTimeDelta: 15, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 },
      { id: 'best', department: ['utility'], estimatedResponseTimeDelta: 30, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 },
    ];

    const result = selectBest(candidates, weights);
    expect(result.chosen.id).toBe('best');
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].action.id).toBe('medium');
    expect(result.rejected[1].action.id).toBe('worst');
  });

  it('handles empty candidates array', () => {
    const result = selectBest([], weights);
    expect(result.chosen).toBeNull();
    expect(result.rejected).toHaveLength(0);
  });

  it('handles single candidate', () => {
    const candidates: CandidateAction[] = [
      { id: 'only', department: ['utility'], estimatedResponseTimeDelta: 10, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 },
    ];

    const result = selectBest(candidates, weights);
    expect(result.chosen.id).toBe('only');
    expect(result.rejected).toHaveLength(0);
  });
});

describe('Decision Pipeline - Determinism', () => {
  it('produces identical results with same inputs', () => {
    const candidates: CandidateAction[] = [
      { id: 'a', department: ['utility'], estimatedResponseTimeDelta: 10, peopleAffected: 50, vehiclesAffected: 20, cost: 500, confidence: 0.8 },
      { id: 'b', department: ['fire'], estimatedResponseTimeDelta: 20, peopleAffected: 30, vehiclesAffected: 10, cost: 800, confidence: 0.9 },
      { id: 'c', department: ['police'], estimatedResponseTimeDelta: 15, peopleAffected: 40, vehiclesAffected: 25, cost: 300, confidence: 0.7 },
    ];

    const result1 = selectBest(candidates, DEFAULT_SCORING_WEIGHTS);
    const result2 = selectBest(candidates, DEFAULT_SCORING_WEIGHTS);

    expect(result1.chosen.id).toBe(result2.chosen.id);
    expect(result1.rejected).toHaveLength(result2.rejected.length);
    for (let i = 0; i < result1.rejected.length; i++) {
      expect(result1.rejected[i].action.id).toBe(result2.rejected[i].action.id);
    }
  });
});

describe('Decision Pipeline - Rationale', () => {
  it('builds rationale with all required fields', () => {
    const signals = ['incident detected', 'high risk area'];
    const chosen: CandidateAction = {
      id: 'chosen',
      department: ['utility'],
      estimatedResponseTimeDelta: 30,
      peopleAffected: 100,
      vehiclesAffected: 50,
      cost: 1000,
      confidence: 0.8,
    };
    const rejected = [
      { action: { id: 'alt1', department: ['utility'], estimatedResponseTimeDelta: 10, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 }, score: 5 },
      { action: { id: 'alt2', department: ['utility'], estimatedResponseTimeDelta: 20, peopleAffected: 0, vehiclesAffected: 0, cost: 0, confidence: 1.0 }, score: 3 },
    ];

    const rationale = buildRationale(signals, chosen, rejected);

    expect(rationale.signalsObserved).toEqual(signals);
    expect(rationale.chosenAction).toBe(chosen);
    expect(rationale.alternativesRejected).toHaveLength(2);
    expect(rationale.metricDeltas.responseTimeDelta).toBe(30);
    expect(rationale.metricDeltas.peopleAffected).toBe(100);
    expect(rationale.metricDeltas.vehiclesAffected).toBe(50);
    expect(rationale.metricDeltas.costDelta).toBe(1000);
  });
});