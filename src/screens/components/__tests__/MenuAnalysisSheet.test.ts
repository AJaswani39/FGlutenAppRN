import { analyseMenuText } from '../../../services/menuSafety';

describe('analyseMenuText', () => {
  it('detects consecutive gluten-free menu lines', () => {
    const result = analyseMenuText(['GF salad bowl', 'GF rice bowl', 'GF crispy tacos'].join('\n'));

    expect(result.glutenFreeItems).toEqual(['GF salad bowl', 'GF rice bowl', 'GF crispy tacos']);
    expect(result.overallSafety).toBe('safe');
  });
});
