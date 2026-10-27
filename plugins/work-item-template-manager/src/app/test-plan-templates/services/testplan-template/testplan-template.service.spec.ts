import { TableRecord } from '@ni/nimble-angular/table';
import { of } from 'rxjs';
import { IWorkitemTemplate } from '../../../core/models/workitem-templates.models';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ProductHttpService } from '../../../core/services/product-http/product-http.service';
import { ProductService } from '../../../core/services/product/product.service';
import { UserService } from '../../../core/services/user/user.service';
import { WorkitemTemplatesService } from '../../../core/services/workitem-templates/workitem-templates.service';
import { TestplanTemplateFiltersService } from '../testplan-template-filters/testplan-template-filters.service';
import { TestplanTemplateService } from './testplan-template.service';

describe('workspace-scoped product names', () => {
  it('keeps overlapping part numbers distinct in the grid and cascading filters', () => {
    const templates: IWorkitemTemplate[] = ['A', 'B', 'C'].map((workspace) => ({
      id: workspace,
      name: workspace,
      workspace,
      partNumbers: ['shared'],
      summary: null,
      description: null,
      productFamilies: null,
      templateGroup: null,
      testProgram: null,
      type: null,
      createdBy: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
      properties: null,
      workflowId: null,
    }));
    const productHttp = jasmine.createSpyObj<ProductHttpService>('ProductHttpService', [
      'queryProducts',
    ]);
    productHttp.queryProducts.and.callFake((request) =>
      of({
        products: request.continuationToken
          ? [
              { id: 'A', workspace: 'A', partNumber: 'shared', name: 'Product A', family: null },
              { id: 'C', workspace: 'C', partNumber: 'shared', name: null, family: null },
            ]
          : [{ id: 'B', workspace: 'B', partNumber: 'shared', name: 'Product B', family: null }],
        continuationToken: request.continuationToken ? undefined : 'next',
      }),
    );
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getAllWorkspaces']);
    auth.getAllWorkspaces.and.returnValue(of({ workspaces: [] }));
    const users = jasmine.createSpyObj<UserService>('UserService', ['getAllUsers']);
    users.getAllUsers.and.returnValue(of({ users: [] }));
    const http = jasmine.createSpyObj<WorkitemTemplatesService>('WorkitemTemplatesService', [
      'queryWorkitemTemplates',
    ]);
    http.queryWorkitemTemplates.and.returnValue(of({ workItemTemplates: templates }));
    const service = new TestplanTemplateService(http, auth, users, new ProductService(productHttp));
    const filters = new TestplanTemplateFiltersService(service);
    let records: TableRecord[] = [];
    let products: string[] = [];
    const recordsSubscription = filters.filteredRecords$.subscribe((value) => {
      records = value;
    });
    const productsSubscription = filters.filteredProducts$.subscribe((value) => {
      products = value;
    });
    const sync = filters.dataSync$.subscribe();

    filters.initialize();
    expect(records.map((record) => record['product'])).toEqual([
      'Product A',
      'Product B',
      'shared',
    ]);
    expect(products).toEqual(['Product A', 'Product B', 'shared']);
    expect(productHttp.queryProducts.calls.mostRecent().args[0].projection).toContain('workspace');

    filters.applyFilters({
      workspace: '',
      type: '',
      productFamily: '',
      product: 'Product A',
      category: '',
    });
    expect(records.map((record) => record['id'])).toEqual(['A']);
    expect(http.queryWorkitemTemplates.calls.mostRecent().args[0]).toContain('.Contains("shared")');

    filters.applyFilters({
      workspace: 'B',
      type: '',
      productFamily: '',
      product: '',
      category: '',
    });
    expect(records.map((record) => record['product'])).toEqual(['Product B']);

    sync.unsubscribe();
    productsSubscription.unsubscribe();
    recordsSubscription.unsubscribe();
  });
});
