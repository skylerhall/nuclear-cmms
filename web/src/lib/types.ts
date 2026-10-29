// Shapes of the API responses the dashboard reads.
import type {
  ActionOption,
  ActiveLco,
  AuditEntry,
  Discipline,
  Equipment,
  LaborEntry,
  OosEvent,
  Part,
  Person,
  Plant,
  PlantSystem,
  PmDue,
  PmPlan,
  Priority,
  TechSpec,
  Ts303Alert,
  WorkOrder,
  WorkPart,
  WorkStatus,
  WorkStep,
  WorkType,
} from '../../../shared/types.ts';

export interface Bootstrap {
  plant: Plant;
  people: Person[];
  systems: PlantSystem[];
  techSpecs: TechSpec[];
  today: string;
  now: string;
  authRequired: boolean;
}

export interface WoLink {
  id: string;
  number: string;
  title: string;
  status: WorkStatus;
}

export interface OverviewData {
  today: string;
  openTotal: number;
  byStatus: Record<WorkStatus, number>;
  emergent: { id: string; number: string; title: string; priority: Priority; status: WorkStatus; type: WorkType; tag: string; createdAt: string }[];
  lcos: ActiveLco[];
  ts303: Ts303Alert[];
  attention: { planId: string; title: string; type: WorkType; srRef: string | null; tag: string; due: PmDue; openWorkOrder: { id: string; number: string; status: WorkStatus } | null }[];
  overdueCount: number;
  inGraceCount: number;
  compliance: { done: number; onTime: number; pct: number | null };
  backlog: { discipline: Discipline; total: number; corrective: number; hours: number }[];
  ageBuckets: { label: string; count: number }[];
  throughput: { week: string; closed: number; corrective: number }[];
  equipmentDown: Equipment[];
  lowParts: number;
  criticalSparesLow: number;
}

export type WorkOrderRow = WorkOrder & { tag: string; equipmentName: string; safetyClass: Equipment['safetyClass']; systemCode: string; equipmentStatus: Equipment['status'] };

export interface WorkOrderDetail {
  workOrder: WorkOrder;
  equipment: Equipment;
  system: PlantSystem;
  techSpec: TechSpec | null;
  steps: WorkStep[];
  parts: WorkPart[];
  labor: (LaborEntry & { personName: string })[];
  history: AuditEntry[];
  actions: ActionOption[];
  plan: (PmPlan & { due: PmDue }) | null;
  parent: WoLink | null;
  children: WoLink[];
  equipmentOos: (OosEvent & { heldByThis: boolean; holder: { id: string; number: string } | null })[];
  signResult?: { result: 'pass' | 'fail' | null; followUp: { id: string; number: string } | null; enteredLco: boolean };
}

export type EquipmentRow = Equipment & {
  openWork: number;
  openCorrective: number;
  lco: { code: string; hoursRemaining: number } | null;
  nextDue: { title: string; due: PmDue } | null;
};

export interface Trend {
  text: string;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  points: { value: number; at: string; number: string }[];
}

export interface EquipmentDetail {
  equipment: Equipment;
  system: PlantSystem;
  techSpec: TechSpec | null;
  sameSpec: Equipment[];
  protectedConflicts: Equipment[];
  plans: (PmPlan & { due: PmDue })[];
  workOrders: WorkOrder[];
  oos: (OosEvent & { hours: number })[];
  meter: { value: number; readAt: string; readBy: string }[];
  trends: Trend[];
}

export interface PlanRow {
  plan: PmPlan;
  equipment: Equipment;
  due: PmDue;
  openWorkOrder: { id: string; number: string; status: WorkStatus } | null;
}

export interface LcoData {
  active: ActiveLco[];
  ts303: Ts303Alert[];
  history: (OosEvent & { tag: string; equipmentName: string; code: string; completionHours: number; hours: number; woNumber: string | null })[];
  trains: { techSpec: TechSpec; equipment: { id: string; tag: string; name: string; train: string | null; status: Equipment['status'] }[] }[];
}

export type PartRow = Part & { belowReorder: boolean; reservations: { number: string; id: string; qty: number }[] };

export interface SystemReliability {
  system: PlantSystem;
  equipmentCount: number;
  functionalFailures: number;
  unavailabilityHours: number;
  correctiveCount: number;
  mtbfHours: number | null;
  mttrHours: number | null;
  status: 'a1' | 'watch' | 'a2';
}
