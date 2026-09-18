import { parseMenuAiResponse } from '../menuAiResponse';

describe('parseMenuAiResponse', () => {
  it('parses a valid response and normalizes the safety level', () => {
    expect(parseMenuAiResponse('Here is the result: {"overallSafety":"SAFE","safeItems":["Rice"]}')).toEqual({
      overallSafety: 'safe',
      safeItems: ['Rice'],
      summary: undefined,
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
  });

  it('keeps partial responses typed without inventing missing values', () => {
    expect(parseMenuAiResponse('{"summary":"Ask about the fryer.","overallSafety":"not-a-level"}')).toEqual({
      overallSafety: undefined,
      summary: 'Ask about the fryer.',
      safeItems: undefined,
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
  });

  it('keeps valid array entries and drops junk elements', () => {
    expect(parseMenuAiResponse('{"safeItems":["Rice",3,"Salad"]}')).toEqual({
      overallSafety: undefined,
      summary: undefined,
      safeItems: ['Rice', 'Salad'],
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
  });

  it('does not treat all-invalid arrays as an explicit empty list', () => {
    expect(parseMenuAiResponse('{"safeItems":[3,null]}')).toEqual({
      overallSafety: undefined,
      summary: undefined,
      safeItems: undefined,
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
  });

  it('rejects non-JSON input', () => {
    expect(parseMenuAiResponse('not json')).toBeNull();
  });

  it('parses crossContamRisk when present', () => {
    expect(
      parseMenuAiResponse(
        '{"overallSafety":"UNSAFE","crossContamRisk":"Shared fryer with breaded items.","warningItems":["Fried chicken"]}'
      )
    ).toEqual({
      overallSafety: 'unsafe',
      summary: undefined,
      safeItems: undefined,
      cautionItems: undefined,
      warningItems: ['Fried chicken'],
      crossContamRisk: 'Shared fryer with breaded items.',
      riskBreakdown: undefined,
    });
  });

  it('recovers JSON when prose contains extra braces', () => {
    const raw =
      'Note: {use caution with fryers}.\n{"overallSafety":"CAUTION","safeItems":["Salad"],"warningItems":["Fried chicken"]}';

    expect(parseMenuAiResponse(raw)).toEqual({
      overallSafety: 'caution',
      summary: undefined,
      safeItems: ['Salad'],
      cautionItems: undefined,
      warningItems: ['Fried chicken'],
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
  });

  it('strips markdown fences and prefers the menu-shaped object', () => {
    const raw = [
      '```json',
      '{"unrelated":true}',
      '```',
      'Analysis:',
      '{"overallSafety":"SAFE","safeItems":["Rice bowl"]}',
    ].join('\n');

    expect(parseMenuAiResponse(raw)).toEqual({
      overallSafety: 'safe',
      summary: undefined,
      safeItems: ['Rice bowl'],
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
  });

  it('keeps valid risk factors and drops malformed ones', () => {
    expect(
      parseMenuAiResponse(
        JSON.stringify({
          overallSafety: 'caution',
          riskBreakdown: [
            { factor: 'Shared fryer', severity: 0.8, description: 'Breaded items nearby' },
            { factor: 'Bad', severity: 'high', description: 'nope' },
          ],
        })
      )
    ).toEqual({
      overallSafety: 'caution',
      summary: undefined,
      safeItems: undefined,
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: [
        { factor: 'Shared fryer', severity: 0.8, description: 'Breaded items nearby' },
      ],
    });
  });
});
