
export enum GateMode {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
  NORMAL = 'NORMAL'
}

export interface AppState {
  isConnected: boolean;
  currentMode: GateMode;
  isLocked: boolean;
  visitCount: number;
  visitLimit: number;
  lockDurationMin: number;
  logs: string[];
}
