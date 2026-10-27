import { Injectable } from '@angular/core';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import {
  IDynamicFormConfigurationRaw,
  IDynamicFormFieldRaw,
  IDynamicFormGroupRaw,
  IDynamicFormI18nEntry,
  IDynamicFormRule,
  IDynamicFormRuleChangeState,
  IDynamicFormTemplateContext,
  IResolvedDynamicField,
  IResolvedDynamicGroup,
  IResolvedDynamicView,
} from '../../models/dynamic-form-fields.models';
import { getSystemLinkLanguage, toLanguage } from '../../utils/language.utils';
import { DynamicFormFieldsHttpService } from '../dynamic-form-fields-http/dynamic-form-fields-http.service';
import { evaluateDisplayRule } from './display-rule-evaluator';

const WORKITEM_RESOURCE_TYPE = 'workitem:workitem';

interface IRuleOverrides {
  views: Map<string, IDynamicFormRuleChangeState>;
  groups: Map<string, IDynamicFormRuleChangeState>;
  fields: Map<string, IDynamicFormRuleChangeState>;
}

/** Resolves Dynamic Form Field views/groups/fields applicable to a work item template. */
@Injectable({
  providedIn: 'root',
})
export class DynamicFormFieldsService {
  private language = 'en';

  public constructor(private readonly httpService: DynamicFormFieldsHttpService) {}

  /**
   * Applies each view's configuration rules (in order; later matches win) to the resolved views and
   * returns only the visible views/groups/fields, with rule-adjusted editable/mandatory flags.
   */
  public applyRules(
    views: IResolvedDynamicView[],
    context: IDynamicFormTemplateContext,
  ): IResolvedDynamicView[] {
    const overridesByRules = new Map<IDynamicFormRule[], IRuleOverrides>();
    const visibleViews: IResolvedDynamicView[] = [];

    for (const view of views) {
      let overrides = overridesByRules.get(view.rules);
      if (!overrides) {
        overrides = this.evaluateRules(view.rules, context);
        overridesByRules.set(view.rules, overrides);
      }

      const viewState = overrides.views.get(view.viewKey);
      if (!(viewState?.visible ?? view.visible)) {
        continue;
      }

      const groups = view.groups
        .map((group) => {
          const groupState = overrides.groups.get(group.key);
          if (!(groupState?.visible ?? group.visible)) {
            return null;
          }
          const containerReadOnly =
            !(viewState?.editable ?? view.editable) || !(groupState?.editable ?? group.editable);

          const fields = group.fields
            .map((field) => {
              const fieldState = overrides.fields.get(field.key);
              if (!(fieldState?.visible ?? field.visible)) {
                return null;
              }
              return {
                ...field,
                visible: true,
                editable: !containerReadOnly && (fieldState?.editable ?? field.editable),
                mandatory: fieldState?.mandatory ?? field.mandatory,
              };
            })
            .filter((field): field is IResolvedDynamicField => field !== null);

          return { ...group, visible: true, fields };
        })
        .filter(
          (group): group is IResolvedDynamicGroup => group !== null && group.fields.length > 0,
        );

      if (groups.length > 0) {
        visibleViews.push({ ...view, visible: true, groups });
      }
    }

    return visibleViews;
  }

  /**
   * Returns the resolved views (tabs) whose configuration display rule matches the template.
   * Groups and fields are only requested when a configuration applies, so servers without the
   * Dynamic Form Fields service (e.g. SystemLink Full) make a single request and show no tabs.
   */
  public resolveViewsForTemplate(
    context: IDynamicFormTemplateContext,
  ): Observable<IResolvedDynamicView[]> {
    return this.httpService.getConfigurations().pipe(
      map((configurations) => this.getMatchingConfigurations(configurations, context)),
      switchMap((matchingConfigurations) =>
        matchingConfigurations.length === 0
          ? of<IResolvedDynamicView[]>([])
          : combineLatest([this.httpService.getGroups(), this.httpService.getFields()]).pipe(
              map(([groups, fields]) =>
                this.resolve(context, matchingConfigurations, groups, fields),
              ),
            ),
      ),
    );
  }

  private getMatchingConfigurations(
    configurations: IDynamicFormConfigurationRaw[],
    context: IDynamicFormTemplateContext,
  ): IDynamicFormConfigurationRaw[] {
    return configurations.filter(
      (configuration) =>
        configuration.resourceType === WORKITEM_RESOURCE_TYPE &&
        configuration.workspace === context.workspaceId &&
        this.matchesDisplayRule(configuration, context),
    );
  }

  private resolve(
    context: IDynamicFormTemplateContext,
    matchingConfigurations: IDynamicFormConfigurationRaw[],
    groups: IDynamicFormGroupRaw[],
    fields: IDynamicFormFieldRaw[],
  ): IResolvedDynamicView[] {
    this.language = getSystemLinkLanguage();
    const groupsByKey = this.indexByKeyPreferringWorkspace(groups, context.workspaceId);
    const fieldsByKey = this.indexByKeyPreferringWorkspace(fields, context.workspaceId);

    const resolvedViews: IResolvedDynamicView[] = [];
    const seenViewKeys = new Set<string>();

    for (const configuration of matchingConfigurations) {
      const rules = configuration.rules ?? [];
      const views = [...(configuration.views ?? [])].sort(
        (left, right) => (left.order ?? 0) - (right.order ?? 0),
      );

      for (const view of views) {
        const dedupeKey = `${configuration.id}:${view.key}`;
        if (seenViewKeys.has(dedupeKey)) {
          continue;
        }
        seenViewKeys.add(dedupeKey);

        const resolvedGroups = (view.groups ?? [])
          .map((groupKey) => groupsByKey.get(groupKey))
          .filter((group): group is IDynamicFormGroupRaw => !!group)
          .map((group) => this.resolveGroup(group, fieldsByKey))
          .filter((group) => group.fields.length > 0);

        if (resolvedGroups.length === 0) {
          continue;
        }

        resolvedViews.push({
          key: `${configuration.id}-${view.key}`,
          viewKey: view.key,
          displayText: this.localize(view, 'displayText') || view.displayText || 'View',
          helpText: this.localize(view, 'helpText'),
          order: view.order ?? 0,
          visible: view.visible !== false,
          editable: view.editable !== false,
          rules,
          groups: resolvedGroups,
        });
      }
    }

    return resolvedViews.sort((left, right) => left.order - right.order);
  }

  private resolveGroup(
    group: IDynamicFormGroupRaw,
    fieldsByKey: Map<string, IDynamicFormFieldRaw>,
  ): IResolvedDynamicGroup {
    const fields = (group.fields ?? [])
      .map((fieldKey) => fieldsByKey.get(fieldKey))
      .filter((field): field is IDynamicFormFieldRaw => !!field)
      .map((field) => this.resolveField(field));

    return {
      key: group.key,
      displayText: this.localize(group, 'displayText') || group.displayText || 'Group',
      helpText: this.localize(group, 'helpText'),
      visible: group.visible !== false,
      editable: group.editable !== false,
      fields,
    };
  }

  private resolveField(field: IDynamicFormFieldRaw): IResolvedDynamicField {
    const displayText = this.localize(field, 'displayText') || field.displayText || field.key;
    return {
      key: field.key,
      displayText,
      // Same message as SystemLink, so its message ID picks up SystemLink's translations.
      requiredText: $localize`${displayText}:controlName: cannot be empty.`,
      helpText: this.localize(field, 'helpText'),
      placeHolder: this.localize(field, 'placeHolder') || field.placeHolder || '',
      type: (field.type || 'TEXT').toUpperCase(),
      mandatory: field.mandatory ?? false,
      editable: field.editable ?? true,
      visible: field.visible !== false,
      retainWhenHidden: field.retainWhenHidden ?? true,
      defaultValue: this.stringifyDefault(field.defaultValue),
      allowedValues: (field.allowedValues ?? []).map((allowedValue) => ({
        ...allowedValue,
        displayText:
          this.localize(allowedValue, 'displayText') ||
          allowedValue.displayText ||
          allowedValue.key,
      })),
    };
  }

  /** Returns the label for the SystemLink UI language, or empty string when unavailable. */
  private localize(
    element: { i18n?: IDynamicFormI18nEntry[] },
    key: 'displayText' | 'helpText' | 'placeHolder',
  ): string {
    const entry = element.i18n?.find(
      (candidate) => toLanguage(candidate.localeId) === this.language,
    );
    return entry?.[key] ?? '';
  }

  private evaluateRules(
    rules: IDynamicFormRule[],
    context: IDynamicFormTemplateContext,
  ): IRuleOverrides {
    const overrides: IRuleOverrides = { views: new Map(), groups: new Map(), fields: new Map() };

    for (const rule of rules) {
      if (!rule.expression?.trim() || !evaluateDisplayRule(rule.expression, context)) {
        continue;
      }

      for (const change of rule.changes ?? []) {
        const targets: [Map<string, IDynamicFormRuleChangeState>, string[] | undefined][] = [
          [overrides.views, change.views],
          [overrides.groups, change.groups],
          [overrides.fields, change.fields],
        ];
        for (const [map, keys] of targets) {
          for (const key of keys ?? []) {
            map.set(key, { ...map.get(key), ...change.change });
          }
        }
      }
    }

    return overrides;
  }

  private matchesDisplayRule(
    configuration: IDynamicFormConfigurationRaw,
    context: IDynamicFormTemplateContext,
  ): boolean {
    const rule = configuration.displayRule?.trim();
    if (!rule) {
      // A configuration without a display rule applies to all resources in its workspace.
      return true;
    }

    return evaluateDisplayRule(rule, context);
  }

  private indexByKeyPreferringWorkspace<T extends { key: string; workspace: string }>(
    items: T[],
    workspaceId: string,
  ): Map<string, T> {
    const byKey = new Map<string, T>();

    for (const item of items) {
      const existing = byKey.get(item.key);
      if (!existing || (item.workspace === workspaceId && existing.workspace !== workspaceId)) {
        byKey.set(item.key, item);
      }
    }

    return byKey;
  }

  private stringifyDefault(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    return String(value);
  }
}
