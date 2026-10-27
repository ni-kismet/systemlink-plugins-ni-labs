import { of } from 'rxjs';
import { ProductHttpService } from './product-http/product-http.service';
import { ProductService } from './product/product.service';
import { TestResultHttpService } from './test-result-http/test-result-http.service';
import { TestResultService } from './test-result/test-result.service';

describe('service LINQ filters', () => {
  const value = 'path\\"quoted"\\';
  const literal = '"path\\\\\\"quoted\\"\\\\"';

  it('escapes quotes and backslashes in every product query', () => {
    const http = jasmine.createSpyObj<ProductHttpService>('ProductHttpService', ['queryProducts']);
    http.queryProducts.and.returnValue(of({ products: [] }));
    const service = new ProductService(http);

    service.queryProductsByFamily(value).subscribe();
    service.queryProductsByFamily(value, value).subscribe();
    service.queryProductFamiliesByWorkspace(value).subscribe();
    service.queryProductsByWorkspace(value).subscribe();
    service.fetchProductNameFromPartNumbers([value]).subscribe();
    service.fetchProductNameFromPartNumbers([value], value).subscribe();

    expect(http.queryProducts.calls.allArgs().map(([request]) => request.filter)).toEqual([
      `family == ${literal}`,
      `workspace == ${literal} && family == ${literal}`,
      `workspace == ${literal}`,
      `workspace == ${literal}`,
      `(partNumber == ${literal})`,
      `workspace == ${literal} && (partNumber == ${literal})`,
    ]);
    expect(http.queryProducts.calls.mostRecent().args[0].projection).toEqual([
      'name',
      'partNumber',
      'workspace',
    ]);
  });

  it('escapes result filters without changing the workspace header or duration', () => {
    const http = jasmine.createSpyObj<TestResultHttpService>('TestResultHttpService', [
      'queryResultValues',
      'queryResults',
    ]);
    http.queryResultValues.and.returnValue(of([]));
    http.queryResults.and.returnValue(
      of({ results: [{ id: 'result', totalTimeInSeconds: 12.6 }] }),
    );
    const service = new TestResultService(http);

    service.queryProgramNamesByWorkspace(value).subscribe();
    service.queryFirstElapsedTimeInSeconds(value, value).subscribe((duration) => {
      expect(duration).toBe(13);
    });

    expect(http.queryResultValues.calls.mostRecent().args[0].filter).toContain(
      `workspace == ${literal} && startedAt >= DateTime("`,
    );
    expect(http.queryResults).toHaveBeenCalledWith(
      jasmine.objectContaining({ filter: `workspace == ${literal} && programName == ${literal}` }),
      value,
    );
  });
});
