import { css } from '@ni/fast-element';
import { DesignSystem } from '@ni/fast-foundation';
import { TableColumnText } from '@ni/nimble-components/dist/esm/table-column/text';
import { TableColumnTextCellView } from '@ni/nimble-components/dist/esm/table-column/text/cell-view';
import { template as cellTemplate } from '@ni/nimble-components/dist/esm/table-column/text-base/cell-view/template';
import { styles as cellBaseStyles } from '@ni/nimble-components/dist/esm/table-column/text-base/cell-view/styles';
import { template as columnTemplate } from '@ni/nimble-components/dist/esm/table-column/base/template';
import { styles as columnStyles } from '@ni/nimble-components/dist/esm/table-column/base/styles';

const severityCellViewTag = 'app-severity-text-cell-view';

const cellViewStyles = css`
  ${cellBaseStyles}

  :host([severity='success']) span {
    color: var(--status-pass-color);
  }

  :host([severity='error']) span {
    color: var(--status-fail-color);
  }

  :host([severity='muted']) span {
    color: var(--ni-nimble-placeholder-font-color);
  }
`;

/**
 * Cell view that colors its text green for "LIVE"/"200", red for other
 * non-empty values, grey for unauthorized ("401"/"403"), and leaves
 * "N/A"/empty at the default text color.
 */
class SeverityTextCellView extends TableColumnTextCellView {
  protected override updateText(): void {
    super.updateText();
    const value = this.text;
    let severity = 'default';
    if (value === 'LIVE' || value === '200') {
      severity = 'success';
    } else if (value === '401' || value === '403') {
      severity = 'muted';
    } else if (value !== '' && value !== 'N/A') {
      severity = 'error';
    }
    this.setAttribute('severity', severity);
  }
}

const severityCellView = SeverityTextCellView.compose({
  baseName: 'severity-text-cell-view',
  template: cellTemplate,
  styles: cellViewStyles
});
DesignSystem.getOrCreate().withPrefix('app').register(severityCellView());

/**
 * Text column that renders cells using the severity-colored cell view.
 */
class SeverityTextColumn extends TableColumnText {
  protected override getColumnInternalsOptions() {
    const options = super.getColumnInternalsOptions();
    return { ...options, cellViewTag: severityCellViewTag };
  }
}

const severityColumn = SeverityTextColumn.compose({
  baseName: 'severity-text-column',
  template: columnTemplate,
  styles: columnStyles
});
DesignSystem.getOrCreate().withPrefix('app').register(severityColumn());

export const severityTextColumnTag = 'app-severity-text-column';

const linkCellViewTag = 'app-link-text-cell-view';

const linkCellViewStyles = css`
  ${cellBaseStyles}

  span {
    color: var(--accent);
  }

  :host(:hover) span {
    text-decoration: underline;
  }
`;

/**
 * Cell view that always renders its text in the theme accent (blue) color.
 */
class LinkTextCellView extends TableColumnTextCellView {}

const linkCellView = LinkTextCellView.compose({
  baseName: 'link-text-cell-view',
  template: cellTemplate,
  styles: linkCellViewStyles
});
DesignSystem.getOrCreate().withPrefix('app').register(linkCellView());

/**
 * Text column that renders cells using the accent-colored (blue) cell view.
 */
class LinkTextColumn extends TableColumnText {
  protected override getColumnInternalsOptions() {
    const options = super.getColumnInternalsOptions();
    return { ...options, cellViewTag: linkCellViewTag };
  }
}

const linkColumn = LinkTextColumn.compose({
  baseName: 'link-text-column',
  template: columnTemplate,
  styles: columnStyles
});
DesignSystem.getOrCreate().withPrefix('app').register(linkColumn());

export const linkTextColumnTag = 'app-link-text-column';
