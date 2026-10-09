/**
 * IRAS nomenclature (not diagnostic criteria). Each type keeps a fixed color token so the same
 * infection reads the same way in every chart, chip and legend.
 */
export type IrasType = 'IPCS' | 'PAV' | 'ITU-AC' | 'ISC' | 'OUTRA';

export type DeviceType = 'CVC' | 'PICC' | 'VM' | 'SVD' | 'PAI' | 'DRENO' | 'OUTRO';

export interface IrasTypeInfo {
  type: IrasType;
  sigla: string;
  name: string;
  /** Design-system color token. */
  token: string;
  /** Device types that make the event device-associated, when applicable. */
  devices: DeviceType[];
}

export const IRAS_TYPES: Record<IrasType, IrasTypeInfo> = {
  IPCS: { type: 'IPCS', sigla: 'IPCS', name: 'Infecção primária de corrente sanguínea', token: 'iras-ipcs', devices: ['CVC', 'PICC'] },
  PAV: { type: 'PAV', sigla: 'PAV', name: 'Pneumonia associada à ventilação mecânica', token: 'iras-pav', devices: ['VM'] },
  'ITU-AC': { type: 'ITU-AC', sigla: 'ITU-AC', name: 'Infecção do trato urinário associada a cateter', token: 'iras-itu', devices: ['SVD'] },
  ISC: { type: 'ISC', sigla: 'ISC', name: 'Infecção de sítio cirúrgico', token: 'iras-isc', devices: [] },
  OUTRA: { type: 'OUTRA', sigla: 'Outras', name: 'Outras IRAS', token: 'iras-outras', devices: [] },
};

export const IRAS_TYPE_ORDER: IrasType[] = ['IPCS', 'PAV', 'ITU-AC', 'ISC', 'OUTRA'];

export const DEVICE_LABEL: Record<DeviceType, string> = {
  CVC: 'Cateter venoso central',
  PICC: 'PICC',
  VM: 'Ventilação mecânica',
  SVD: 'Cateter urinário de demora',
  PAI: 'Pressão arterial invasiva',
  DRENO: 'Dreno',
  OUTRO: 'Outro dispositivo',
};

export type InvestigationStatus = 'suspeita' | 'em_investigacao' | 'confirmada' | 'descartada';

export const INVESTIGATION_STATUS_LABEL: Record<InvestigationStatus, string> = {
  suspeita: 'Suspeita',
  em_investigacao: 'Em investigação',
  confirmada: 'Confirmada',
  descartada: 'Descartada',
};
