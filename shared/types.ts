// Types shared by the server and the dashboard.

export type Role = 'planner' | 'supervisor' | 'technician' | 'qc' | 'sro' | 'engineer';
export type Discipline = 'mechanical' | 'electrical' | 'ic';
export type SafetyClass = 'SR' | 'AQ' | 'NSR';
export type EquipmentStatus = 'operable' | 'degraded' | 'inoperable';

export type WorkType = 'CM' | 'PM' | 'PDM' | 'ST';
export type Priority = 1 | 2 | 3 | 4;
export type WorkStatus = 'requested' | 'planning' | 'ready' | 'in_progress' | 'testing' | 'closed' | 'cancelled';
export type WorkAction = 'screen' | 'ready' | 'return_to_planning' | 'release' | 'work_complete' | 'close' | 'cancel';
export type StepKind = 'step' | 'reading' | 'qc_hold' | 'pmt';
export type ClearanceStatus = 'none' | 'hung' | 'released';
export type WorkOrigin = 'request' | 'pm_generator' | 'failed_reading' | 'emergent' | 'history';

export interface Plant {
  name: string;
  shortName: string;
  operator: string;
  timezone: string;
  reactorType: string;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  role: Role;
  title: string;
  discipline: Discipline | null;
}

export interface PlantSystem {
  code: string;
  name: string;
  riskSignificant: boolean;
  /** Maintenance Rule performance criteria over a rolling 24 months. */
  mrFunctionalFailureLimit: number;
  mrUnavailabilityLimitHours: number;
}

export interface TechSpec {
  id: string;
  code: string;
  title: string;
  condition: string;
  requiredAction: string;
  completionHours: number;
}

export interface Equipment {
  id: string;
  tag: string;
  name: string;
  systemCode: string;
  equipmentType: string;
  discipline: Discipline;
  safetyClass: SafetyClass;
  /** 1 = critical, 2 = important, 3 = run to failure. */
  criticality: 1 | 2 | 3;
  train: string | null;
  location: string;
  manufacturer: string;
  model: string;
  techSpecId: string | null;
  status: EquipmentStatus;
  statusNote: string | null;
  runHours: number | null;
}

export interface ClearancePoint {
  point: string;
  position: string;
}

export interface WorkOrder {
  id: string;
  number: string;
  title: string;
  description: string;
  equipmentId: string;
  type: WorkType;
  priority: Priority;
  status: WorkStatus;
  discipline: Discipline;
  pmPlanId: string | null;
  dueDate: string | null;
  lateDate: string | null;
  scheduledDate: string | null;
  requiresOos: boolean;
  clearancePoints: ClearancePoint[];
  clearanceStatus: ClearanceStatus;
  estHours: number;
  estDoseMrem: number;
  radArea: boolean;
  fme: boolean;
  confinedSpace: boolean;
  /** Maintenance Rule evaluation by the system engineer. null = not evaluated yet. */
  functionalFailure: boolean | null;
  mrNote: string | null;
  parentWoId: string | null;
  sourceStepId: string | null;
  origin: WorkOrigin;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
  workCompleteAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  cancelReason: string | null;
}

export interface WorkStep {
  id: string;
  woId: string;
  seq: number;
  kind: StepKind;
  text: string;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  value: number | null;
  result: 'pass' | 'fail' | null;
  completedBy: string | null;
  completedAt: string | null;
}

export interface Part {
  id: string;
  stockCode: string;
  description: string;
  mfrPart: string;
  quality: 'Q' | 'NQ';
  bin: string;
  onHand: number;
  reserved: number;
  reorderPoint: number;
  maxQty: number;
  unitCostCents: number;
  leadDays: number;
  criticalSpare: boolean;
}

export interface WorkPart {
  id: string;
  woId: string;
  partId: string;
  qtyReserved: number;
  qtyIssued: number;
  part: Part;
}

export interface LaborEntry {
  id: string;
  woId: string;
  personId: string;
  hours: number;
  workedOn: string;
  note: string;
}

export interface PmPlan {
  id: string;
  equipmentId: string;
  title: string;
  type: Exclude<WorkType, 'CM'>;
  srRef: string | null;
  intervalDays: number | null;
  intervalHours: number | null;
  gracePct: number;
  leadDays: number;
  lastDoneDate: string | null;
  lastDoneHours: number | null;
  estHours: number;
  discipline: Discipline;
  requiresOos: boolean;
  steps: PlanStep[];
  active: boolean;
}

export interface PlanStep {
  kind: StepKind;
  text: string;
  unit?: string;
  min?: number;
  max?: number;
}

export interface OosEvent {
  id: string;
  equipmentId: string;
  woId: string | null;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  techSpecId: string | null;
  lcoDueAt: string | null;
  enteredBy: string;
  exitedBy: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: 'work_order' | 'equipment' | 'part' | 'pm_plan' | 'system';
  entityId: string | null;
  summary: string;
}

/** One check the server runs before a workflow action. The UI shows the same list. */
export interface Gate {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ActionOption {
  action: WorkAction;
  label: string;
  /** Roles allowed to take this action on this work order. */
  roles: Role[];
  allowedForActor: boolean;
  gates: Gate[];
}

export interface PmDue {
  basis: 'calendar' | 'meter';
  dueDate: string | null;
  lateDate: string | null;
  dueHours: number | null;
  lateHours: number | null;
  /** Days (calendar) or hours (meter) until due; negative when past due. */
  remaining: number;
  state: 'ok' | 'due_soon' | 'in_grace' | 'overdue';
}

export interface ActiveLco {
  oos: OosEvent;
  equipment: Equipment;
  techSpec: TechSpec;
  workOrder: { id: string; number: string; title: string; status: WorkStatus } | null;
  hoursRemaining: number;
  expired: boolean;
}

/** Every train of one Tech Spec is inoperable: LCO 3.0.3 applies. */
export interface Ts303Alert {
  techSpec: TechSpec;
  equipment: Equipment[];
}
