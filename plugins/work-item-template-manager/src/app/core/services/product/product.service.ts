import { Injectable } from '@angular/core';
import { EMPTY, expand, forkJoin, map, Observable, of, reduce } from 'rxjs';
import {
  IProduct,
  IQueryProductsRequest,
  IQueryProductsResponse,
  ProductNameMap,
} from '../../models/product.models';
import { PART_NUMBER_FILTER_BATCH_SIZE, PRODUCT_BATCH_SIZE } from '../../constants/api.constants';
import { ProductHttpService } from '../product-http/product-http.service';
import { escapeLinqString } from '../../library/systemlink-query-generators/core/linq';

/** Stateless service that fetches product data via the products API. */
@Injectable({
  providedIn: 'root',
})
export class ProductService {
  /** Creates an instance of ProductService. */
  public constructor(private readonly productHttpService: ProductHttpService) {}

  /** Fetches all products belonging to the given product family, optionally scoped to a workspace. */
  public queryProductsByFamily(family: string, workspace?: string): Observable<IProduct[]> {
    const safeFamily = escapeLinqString(family);

    const filter = workspace
      ? `workspace == "${escapeLinqString(workspace)}" && family == "${safeFamily}"`
      : `family == "${safeFamily}"`;

    return this.getAllProducts({
      filter,
      projection: ['name', 'partNumber'],
    });
  }

  /** Fetches unique product families available in a workspace. */
  public queryProductFamiliesByWorkspace(workspace: string): Observable<string[]> {
    const safeWorkspace = escapeLinqString(workspace);

    return this.getAllProducts({
      filter: `workspace == "${safeWorkspace}"`,
      projection: ['family'],
    }).pipe(
      map((products) =>
        [...new Set(products.map((product) => product.family).filter((family): family is string => !!family))]
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),
      ),
    );
  }

  /** Fetches all products in a workspace. */
  public queryProductsByWorkspace(workspace: string): Observable<IProduct[]> {
    const safeWorkspace = escapeLinqString(workspace);

    return this.getAllProducts({
      filter: `workspace == "${safeWorkspace}"`,
      projection: ['name', 'partNumber'],
    }).pipe(
      map((products) =>
        products.sort((a, b) => {
          const nameA = a.name ?? a.partNumber ?? '';
          const nameB = b.name ?? b.partNumber ?? '';
          return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
        }),
      ),
    );
  }

  /** Fetches workspace-scoped product names, optionally limiting the query to one workspace. */
  public fetchProductNameFromPartNumbers(
    partNumbers: string[],
    workspace?: string,
  ): Observable<ProductNameMap> {
    const uniquePartNumbers = [...new Set(partNumbers.filter(Boolean))];

    if (uniquePartNumbers.length === 0) {
      return of(new Map<string, Map<string, string>>());
    }

    return forkJoin(
      this.chunkPartNumbers(uniquePartNumbers).map((partNumberBatch) =>
        this.getAllProducts({
          filter:
            workspace === undefined
              ? this.buildPartNumbersFilter(partNumberBatch)
              : `workspace == "${escapeLinqString(workspace)}" && ${this.buildPartNumbersFilter(partNumberBatch)}`,
          projection: ['name', 'partNumber', 'workspace'],
        }),
      ),
    ).pipe(
      map((productBatches) => productBatches.flat()),
      map((products) => this.mapPartNumbersToProductNames(products)),
    );
  }

  /** Queries all pages for a products request. */
  private getAllProducts(request: IQueryProductsRequest): Observable<IProduct[]> {
    const requestBody: IQueryProductsRequest = {
      ...request,
      take: PRODUCT_BATCH_SIZE,
    };

    return this.productHttpService.queryProducts(requestBody).pipe(
      expand((response) => {
        if (!response.continuationToken) {
          return EMPTY;
        }

        return this.productHttpService.queryProducts({
          ...requestBody,
          continuationToken: response.continuationToken,
        });
      }),

      reduce(
        (allProducts: IProduct[], response: IQueryProductsResponse): IProduct[] => [
          ...allProducts,
          ...(response.products ?? []),
        ],
        [],
      ),
    );
  }

  /** Builds a safe OR filter for querying a batch of part numbers. */
  private buildPartNumbersFilter(partNumbers: string[]): string {
    return `(${partNumbers
      .map((partNumber) => this.buildPartNumberClause(partNumber))
      .join(' || ')})`;
  }

  /** Builds a safe filter clause for a single part number. */
  private buildPartNumberClause(partNumber: string): string {
    return `partNumber == "${escapeLinqString(partNumber)}"`;
  }

  /** Splits part numbers into batches to keep filter strings at a reasonable size. */
  private chunkPartNumbers(partNumbers: string[]): string[][] {
    const chunks: string[][] = [];

    for (let index = 0; index < partNumbers.length; index += PART_NUMBER_FILTER_BATCH_SIZE) {
      chunks.push(partNumbers.slice(index, index + PART_NUMBER_FILTER_BATCH_SIZE));
    }

    return chunks;
  }

  /** Keeps the first non-empty name for each workspace and part number. */
  private mapPartNumbersToProductNames(products: IProduct[]): ProductNameMap {
    const names: ProductNameMap = new Map();
    for (const product of products) {
      if (!product.name) {
        continue;
      }
      const workspace = product.workspace ?? '';
      const workspaceNames = names.get(workspace) ?? new Map<string, string>();
      if (!workspaceNames.has(product.partNumber)) {
        workspaceNames.set(product.partNumber, product.name);
      }
      names.set(workspace, workspaceNames);
    }

    return names;
  }
}
