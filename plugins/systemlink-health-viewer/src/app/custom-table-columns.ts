import { Directive } from '@angular/core';

/**
 * Angular directives for the custom design-system table columns registered in
 * severity-text-column.ts. They exist so the templates can reference the custom
 * elements without enabling CUSTOM_ELEMENTS_SCHEMA. The runtime behavior comes
 * from the registered Nimble custom elements; these directives only make the
 * elements known to the Angular template compiler.
 */

// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: 'app-severity-text-column', standalone: true })
export class SeverityTextColumnDirective {}

// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: 'app-link-text-column', standalone: true })
export class LinkTextColumnDirective {}
