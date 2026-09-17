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

  it('rejects malformed JSON and mixed-type arrays', () => {
    expect(parseMenuAiResponse('{"safeItems":["Rice",3]}')).toEqual({
      overallSafety: undefined,
      summary: undefined,
      safeItems: undefined,
      cautionItems: undefined,
      warningItems: undefined,
      crossContamRisk: undefined,
      riskBreakdown: undefined,
    });
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
});
