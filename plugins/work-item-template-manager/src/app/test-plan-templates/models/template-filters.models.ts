export interface ITemplateFilters {
  workspace: string;
  type: string;
  productFamily: string;
  product: string;
  category: string;
}

export interface IFilterCascade {
  allTypes: string[];
  allFamilies: string[];
  allProducts: string[];
  allCategories: string[];
}
