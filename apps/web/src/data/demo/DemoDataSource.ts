import { addMonths, monthStart, todayIn, type Provenance } from '@ccih/domain';
import type { CcihDataSource, FactsQuery } from '../port';
import { generateFacts } from './facts';
import { DEMO_CONFIG, DEMO_LOAD_POLICY, DEMO_REFERENCES, DEMO_SECTORS, DEMO_UNITS } from './institution';

const SOURCE = 'Gerador sintético de demonstração v1 (sem pacientes reais)';

/** In-memory synthetic source. Selected only when VITE_DATA_SOURCE=demo; flags every payload as demo. */
export class DemoDataSource implements CcihDataSource {
  readonly origin = 'demo' as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private provenance(): Provenance {
    return { origin: 'demo', source: SOURCE, consolidatedAt: this.now().toISOString() };
  }

  /** Last complete month in the institution zone: synthetic data never covers the current month. */
  lastClosedMonth(): string {
    return addMonths(monthStart(todayIn(DEMO_CONFIG.timezone, this.now())), -1);
  }

  async getInstitution() {
    return {
      data: { config: DEMO_CONFIG, loadReleasePolicy: DEMO_LOAD_POLICY, units: DEMO_UNITS, sectors: DEMO_SECTORS, references: DEMO_REFERENCES },
      provenance: this.provenance(),
    };
  }

  async getFacts(query: FactsQuery) {
    const anchor = this.lastClosedMonth();
    const to = query.to > anchor ? anchor : query.to;
    return { data: { rows: query.from > to ? [] : generateFacts(query.from, to, anchor) }, provenance: this.provenance() };
  }
}
