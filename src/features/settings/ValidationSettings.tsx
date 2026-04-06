'use client';

import { useMemo } from 'react';
import { Panel } from '@/components/Panel';
import {
  VALIDATION_CATEGORIES,
  VALIDATION_RULES,
  isRuleEnabled,
  type ValidationCategory,
} from '@/domain/validators/validationRules';
import { useDocumentStore } from '@/stores/documentStore';

const CATEGORY_LABELS: Record<ValidationCategory, string> = {
  contract: 'Contract',
  business: 'Business Rules',
  'cross-reference': 'Cross-Reference',
  impact: 'Impact Analysis',
  semantic: 'Semantic Diff',
};

const CATEGORY_DESCRIPTIONS: Record<ValidationCategory, string> = {
  contract: 'Required field formats, valid enums, and structural constraints from the Atlassian spec.',
  business: 'Schema quality rules: label attributes, select typeValues, mapping completeness.',
  'cross-reference': 'Consistency between schema and mapping definitions.',
  impact: 'Breaking changes detected against a baseline snapshot.',
  semantic: 'Structural differences between the current document and a baseline snapshot.',
};

export function ValidationSettings() {
  const validationConfig = useDocumentStore((state) => state.validationConfig);
  const setValidationRuleEnabled = useDocumentStore((state) => state.setValidationRuleEnabled);
  const setAllValidationRulesEnabled = useDocumentStore((state) => state.setAllValidationRulesEnabled);
  const resetValidationConfig = useDocumentStore((state) => state.resetValidationConfig);

  const rulesByCategory = useMemo(() => {
    const map = new Map<ValidationCategory, typeof VALIDATION_RULES>();
    for (const cat of VALIDATION_CATEGORIES) {
      map.set(cat, VALIDATION_RULES.filter((r) => r.category === cat));
    }
    return map;
  }, []);

  const enabledCount = VALIDATION_RULES.filter((r) => isRuleEnabled(r.code, validationConfig)).length;

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Validation Rules</h2>
          <p className="text-xs text-slate-500">
            {enabledCount} of {VALIDATION_RULES.length} rules enabled
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
            onClick={() => setAllValidationRulesEnabled(true)}
          >
            Enable all
          </button>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
            onClick={() => setAllValidationRulesEnabled(false)}
          >
            Disable all
          </button>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
            onClick={resetValidationConfig}
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {VALIDATION_CATEGORIES.map((category) => {
          const rules = rulesByCategory.get(category) ?? [];
          const enabledInCategory = rules.filter((r) => isRuleEnabled(r.code, validationConfig)).length;

          return (
            <div key={category} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{CATEGORY_LABELS[category]}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      {enabledInCategory}/{rules.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{CATEGORY_DESCRIPTIONS[category]}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="text-xs text-slate-500 underline hover:text-slate-800"
                    onClick={() => rules.forEach((r) => setValidationRuleEnabled(r.code, true))}
                  >
                    All on
                  </button>
                  <button
                    className="text-xs text-slate-500 underline hover:text-slate-800"
                    onClick={() => rules.forEach((r) => setValidationRuleEnabled(r.code, false))}
                  >
                    All off
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {rules.map((rule) => {
                  const enabled = isRuleEnabled(rule.code, validationConfig);
                  return (
                    <label
                      key={rule.code}
                      className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${!enabled ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-900"
                        checked={enabled}
                        onChange={(e) => setValidationRuleEnabled(rule.code, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{rule.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            rule.defaultSeverity === 'error'
                              ? 'bg-red-100 text-red-700'
                              : rule.defaultSeverity === 'warning'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-sky-100 text-sky-700'
                          }`}>
                            {rule.defaultSeverity}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{rule.code}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
