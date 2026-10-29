// The fictional plant: Halcyon Point Generating Station, a single-unit PWR.
// Every name, tag, part and number here is invented for the demo.
import type { Discipline, Person, Plant, PlantSystem, PlanStep, SafetyClass, TechSpec } from '../../shared/types.ts';

export const PLANT: Plant = {
  name: 'Halcyon Point Generating Station',
  shortName: 'Halcyon Point',
  operator: 'Halcyon Point Energy Cooperative',
  timezone: 'America/Chicago',
  reactorType: 'Single-unit PWR · 1,150 MWe',
};

export const PEOPLE: Person[] = [
  { id: 'dana', name: 'Dana Whitfield', initials: 'DW', role: 'planner', title: 'Work Control Planner', discipline: null },
  { id: 'marcus', name: 'Marcus Oyelaran', initials: 'MO', role: 'supervisor', title: 'Maintenance Supervisor', discipline: null },
  { id: 'tom', name: 'Tom Brandt', initials: 'TB', role: 'technician', title: 'Mechanical Technician', discipline: 'mechanical' },
  { id: 'elena', name: 'Elena Vasquez', initials: 'EV', role: 'technician', title: 'Electrical Technician', discipline: 'electrical' },
  { id: 'kenji', name: 'Kenji Arai', initials: 'KA', role: 'technician', title: 'I&C Technician', discipline: 'ic' },
  { id: 'rachel', name: 'Rachel Okafor', initials: 'RO', role: 'qc', title: 'QC Inspector', discipline: null },
  { id: 'sam', name: 'Sam Delgado', initials: 'SD', role: 'sro', title: 'Shift Manager (SRO)', discipline: null },
  { id: 'priya', name: 'Priya Nair', initials: 'PN', role: 'engineer', title: 'System Engineer', discipline: null },
];

export const SYSTEMS: PlantSystem[] = [
  { code: 'AFW', name: 'Auxiliary Feedwater', riskSignificant: true, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 250 },
  { code: 'CCW', name: 'Component Cooling Water', riskSignificant: true, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 250 },
  { code: 'EDG', name: 'Emergency Diesel Generators', riskSignificant: true, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 500 },
  { code: 'EPS', name: 'Class 1E Electrical Power', riskSignificant: true, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 150 },
  { code: 'FP', name: 'Fire Protection', riskSignificant: false, mrFunctionalFailureLimit: 3, mrUnavailabilityLimitHours: 500 },
  { code: 'FW', name: 'Condensate and Feedwater', riskSignificant: false, mrFunctionalFailureLimit: 4, mrUnavailabilityLimitHours: 1000 },
  { code: 'HVAC', name: 'Control Room Emergency Ventilation', riskSignificant: false, mrFunctionalFailureLimit: 3, mrUnavailabilityLimitHours: 600 },
  { code: 'IA', name: 'Instrument Air', riskSignificant: false, mrFunctionalFailureLimit: 3, mrUnavailabilityLimitHours: 600 },
  { code: 'MG', name: 'Main Generator and Transformers', riskSignificant: false, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 500 },
  { code: 'RHR', name: 'Residual Heat Removal', riskSignificant: true, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 200 },
  { code: 'RPS', name: 'Reactor Protection Instrumentation', riskSignificant: true, mrFunctionalFailureLimit: 3, mrUnavailabilityLimitHours: 100 },
  { code: 'SW', name: 'Essential Service Water', riskSignificant: true, mrFunctionalFailureLimit: 2, mrUnavailabilityLimitHours: 300 },
];

export const TECH_SPECS: TechSpec[] = [
  { id: 'ts_3_3_1', code: '3.3.1', title: 'Reactor Trip System Instrumentation', condition: 'One or more Functions with one channel inoperable', requiredAction: 'Place channel in trip, or be in MODE 3', completionHours: 72 },
  { id: 'ts_3_5_2', code: '3.5.2', title: 'ECCS — Operating', condition: 'One or more trains inoperable', requiredAction: 'Restore train(s) to OPERABLE status', completionHours: 72 },
  { id: 'ts_3_7_5', code: '3.7.5', title: 'Auxiliary Feedwater (AFW) System', condition: 'One AFW train inoperable', requiredAction: 'Restore AFW train to OPERABLE status', completionHours: 72 },
  { id: 'ts_3_7_7', code: '3.7.7', title: 'Component Cooling Water (CCW) System', condition: 'One CCW train inoperable', requiredAction: 'Restore CCW train to OPERABLE status', completionHours: 72 },
  { id: 'ts_3_7_8', code: '3.7.8', title: 'Service Water System (SWS)', condition: 'One SWS train inoperable', requiredAction: 'Restore SWS train to OPERABLE status', completionHours: 72 },
  { id: 'ts_3_7_10', code: '3.7.10', title: 'Control Room Emergency Filtration System (CREFS)', condition: 'One CREFS train inoperable', requiredAction: 'Restore CREFS train to OPERABLE status', completionHours: 168 },
  { id: 'ts_3_8_1', code: '3.8.1', title: 'AC Sources — Operating', condition: 'One required DG inoperable', requiredAction: 'Restore required DG to OPERABLE status', completionHours: 72 },
  { id: 'ts_3_8_4', code: '3.8.4', title: 'DC Sources — Operating', condition: 'One DC electrical power subsystem inoperable', requiredAction: 'Restore DC electrical power subsystem to OPERABLE status', completionHours: 2 },
  { id: 'ts_3_8_9', code: '3.8.9', title: 'Distribution Systems — Operating', condition: 'One AC electrical power distribution subsystem inoperable', requiredAction: 'Restore AC electrical power distribution subsystem to OPERABLE status', completionHours: 8 },
];

export interface EquipmentSeed {
  key: string;
  tag: string;
  name: string;
  system: string;
  type: string;
  discipline: Discipline;
  safety: SafetyClass;
  crit: 1 | 2 | 3;
  train?: string;
  location: string;
  mfr: string;
  model: string;
  ts?: string;
  hours?: number;
}

export const EQUIPMENT: EquipmentSeed[] = [
  // RHR
  { key: 'rhr-p-1a', tag: '1-RHR-P-1A', name: 'RHR Pump 1A', system: 'RHR', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'A', location: "Aux Bldg · El. 15' · RHR Pump Room A", mfr: 'Westfield Pump Co.', model: 'VCT 12x14 vertical', ts: 'ts_3_5_2', hours: 9_412 },
  { key: 'rhr-p-1b', tag: '1-RHR-P-1B', name: 'RHR Pump 1B', system: 'RHR', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'B', location: "Aux Bldg · El. 15' · RHR Pump Room B", mfr: 'Westfield Pump Co.', model: 'VCT 12x14 vertical', ts: 'ts_3_5_2', hours: 9_087 },
  { key: 'rhr-mov-8701a', tag: '1-RHR-MOV-8701A', name: 'RHR Suction Isolation Valve 8701A', system: 'RHR', type: 'Motor-operated valve', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'A', location: "Containment · El. 68' · Pressurizer cubicle", mfr: 'Norland Valve', model: '12" gate, SMB-1 actuator', ts: 'ts_3_5_2' },
  { key: 'rhr-mov-8701b', tag: '1-RHR-MOV-8701B', name: 'RHR Suction Isolation Valve 8701B', system: 'RHR', type: 'Motor-operated valve', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'B', location: "Containment · El. 68' · Pressurizer cubicle", mfr: 'Norland Valve', model: '12" gate, SMB-1 actuator', ts: 'ts_3_5_2' },
  { key: 'rhr-hx-1a', tag: '1-RHR-HX-1A', name: 'RHR Heat Exchanger 1A', system: 'RHR', type: 'Heat exchanger', discipline: 'mechanical', safety: 'SR', crit: 2, train: 'A', location: "Aux Bldg · El. 35' · Rm 214", mfr: 'Calder Thermal', model: 'BEU shell-and-tube', ts: 'ts_3_5_2' },
  // EDG
  { key: 'edg-1a', tag: '1-EDG-DG-1A', name: 'Emergency Diesel Generator 1A', system: 'EDG', type: 'Diesel generator', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'A', location: 'Diesel Generator Bldg · Room A', mfr: 'Tamarack Diesel', model: 'TD-20V 7,000 kW', ts: 'ts_3_8_1', hours: 1_842 },
  { key: 'edg-1b', tag: '1-EDG-DG-1B', name: 'Emergency Diesel Generator 1B', system: 'EDG', type: 'Diesel generator', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'B', location: 'Diesel Generator Bldg · Room B', mfr: 'Tamarack Diesel', model: 'TD-20V 7,000 kW', ts: 'ts_3_8_1', hours: 1_796 },
  { key: 'edg-fop-1a', tag: '1-EDG-P-3A', name: 'EDG 1A Fuel Oil Transfer Pump', system: 'EDG', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 2, train: 'A', location: 'Diesel Generator Bldg · Fuel Oil Vault A', mfr: 'Westfield Pump Co.', model: 'G2 gear pump' },
  // CCW
  { key: 'ccw-p-1a', tag: '1-CCW-P-1A', name: 'CCW Pump 1A', system: 'CCW', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'A', location: "Aux Bldg · El. 35' · CCW Pump Area", mfr: 'Westfield Pump Co.', model: 'HSC 10x12 horizontal split-case', ts: 'ts_3_7_7', hours: 61_240 },
  { key: 'ccw-p-1b', tag: '1-CCW-P-1B', name: 'CCW Pump 1B', system: 'CCW', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'B', location: "Aux Bldg · El. 35' · CCW Pump Area", mfr: 'Westfield Pump Co.', model: 'HSC 10x12 horizontal split-case', ts: 'ts_3_7_7', hours: 58_810 },
  { key: 'ccw-hx-1a', tag: '1-CCW-HX-1A', name: 'CCW Heat Exchanger 1A', system: 'CCW', type: 'Heat exchanger', discipline: 'mechanical', safety: 'SR', crit: 2, train: 'A', location: "Aux Bldg · El. 35' · Rm 230", mfr: 'Calder Thermal', model: 'AEL shell-and-tube', ts: 'ts_3_7_7' },
  // SW
  { key: 'sw-p-1a', tag: '1-SW-P-1A', name: 'Essential Service Water Pump 1A', system: 'SW', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'A', location: 'Intake Structure · Bay A', mfr: 'Westfield Pump Co.', model: 'VTP-24 vertical turbine', ts: 'ts_3_7_8', hours: 70_115 },
  { key: 'sw-p-1b', tag: '1-SW-P-1B', name: 'Essential Service Water Pump 1B', system: 'SW', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'B', location: 'Intake Structure · Bay B', mfr: 'Westfield Pump Co.', model: 'VTP-24 vertical turbine', ts: 'ts_3_7_8', hours: 66_930 },
  { key: 'sw-str-1a', tag: '1-SW-STR-1A', name: 'SW Pump 1A Discharge Strainer', system: 'SW', type: 'Strainer', discipline: 'mechanical', safety: 'SR', crit: 2, train: 'A', location: 'Intake Structure · Bay A', mfr: 'Graystone Filtration', model: 'Automatic backwash 24"' },
  // AFW
  { key: 'afw-p-2a', tag: '1-AFW-P-2A', name: 'Motor-Driven AFW Pump 2A', system: 'AFW', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'A', location: "Turbine Bldg · El. 10' · AFW Room", mfr: 'Westfield Pump Co.', model: 'MSD 4-stage', ts: 'ts_3_7_5', hours: 2_310 },
  { key: 'afw-p-1', tag: '1-AFW-P-1', name: 'Turbine-Driven AFW Pump', system: 'AFW', type: 'Pump', discipline: 'mechanical', safety: 'SR', crit: 1, train: 'B', location: "Turbine Bldg · El. 10' · AFW Room", mfr: 'Westfield Pump Co.', model: 'MSD 6-stage w/ Terry-type turbine', ts: 'ts_3_7_5', hours: 1_104 },
  // EPS
  { key: 'swgr-1a01', tag: '1-EPS-SWGR-1A01', name: '4.16 kV Class 1E Bus 1A01', system: 'EPS', type: 'Switchgear', discipline: 'electrical', safety: 'SR', crit: 1, train: 'A', location: "Control Bldg · El. 30' · Switchgear Room A", mfr: 'Carrow Electric', model: 'MV metal-clad, 1200 A', ts: 'ts_3_8_9' },
  { key: 'swgr-1b01', tag: '1-EPS-SWGR-1B01', name: '4.16 kV Class 1E Bus 1B01', system: 'EPS', type: 'Switchgear', discipline: 'electrical', safety: 'SR', crit: 1, train: 'B', location: "Control Bldg · El. 30' · Switchgear Room B", mfr: 'Carrow Electric', model: 'MV metal-clad, 1200 A', ts: 'ts_3_8_9' },
  { key: 'bkr-1a0103', tag: '1-EPS-BKR-1A0103', name: 'Breaker 1A01-03 (RHR Pump 1A feeder)', system: 'EPS', type: 'Breaker', discipline: 'electrical', safety: 'SR', crit: 2, train: 'A', location: "Control Bldg · El. 30' · Switchgear Room A", mfr: 'Carrow Electric', model: 'VCB-5 vacuum, 1200 A' },
  { key: 'bat-1a', tag: '1-EPS-BAT-1A', name: '125 VDC Station Battery 1A', system: 'EPS', type: 'Battery', discipline: 'electrical', safety: 'SR', crit: 1, train: 'A', location: "Control Bldg · El. 30' · Battery Room A", mfr: 'Ridgeway Power Cells', model: '60-cell lead-calcium, 1,800 Ah', ts: 'ts_3_8_4' },
  { key: 'bat-1b', tag: '1-EPS-BAT-1B', name: '125 VDC Station Battery 1B', system: 'EPS', type: 'Battery', discipline: 'electrical', safety: 'SR', crit: 1, train: 'B', location: "Control Bldg · El. 30' · Battery Room B", mfr: 'Ridgeway Power Cells', model: '60-cell lead-calcium, 1,800 Ah', ts: 'ts_3_8_4' },
  { key: 'chg-1a', tag: '1-EPS-CHG-1A', name: 'Battery Charger 1A', system: 'EPS', type: 'Battery charger', discipline: 'electrical', safety: 'SR', crit: 2, train: 'A', location: "Control Bldg · El. 30' · DC Equipment Room A", mfr: 'Carrow Electric', model: '400 A SCR charger', ts: 'ts_3_8_4' },
  // RPS
  { key: 'pt-455', tag: '1-RCS-PT-455', name: 'Pressurizer Pressure Transmitter (Ch I)', system: 'RPS', type: 'Transmitter', discipline: 'ic', safety: 'SR', crit: 1, train: 'I', location: "Containment · El. 95' · Pressurizer instrument rack", mfr: 'Lumen Instruments', model: 'PT-1E 0–3,000 psig', ts: 'ts_3_3_1' },
  { key: 'pt-456', tag: '1-RCS-PT-456', name: 'Pressurizer Pressure Transmitter (Ch II)', system: 'RPS', type: 'Transmitter', discipline: 'ic', safety: 'SR', crit: 1, train: 'II', location: "Containment · El. 95' · Pressurizer instrument rack", mfr: 'Lumen Instruments', model: 'PT-1E 0–3,000 psig', ts: 'ts_3_3_1' },
  { key: 'pt-457', tag: '1-RCS-PT-457', name: 'Pressurizer Pressure Transmitter (Ch III)', system: 'RPS', type: 'Transmitter', discipline: 'ic', safety: 'SR', crit: 1, train: 'III', location: "Containment · El. 95' · Pressurizer instrument rack", mfr: 'Lumen Instruments', model: 'PT-1E 0–3,000 psig', ts: 'ts_3_3_1' },
  { key: 'lt-517', tag: '1-SG-LT-517', name: 'Steam Generator A Narrow-Range Level (Ch I)', system: 'RPS', type: 'Transmitter', discipline: 'ic', safety: 'SR', crit: 2, location: "Containment · El. 68' · SG A instrument rack", mfr: 'Lumen Instruments', model: 'DP-1E 0–150 inH2O' },
  // HVAC
  { key: 'crefs-41a', tag: '1-HVAC-F-41A', name: 'CR Emergency Filtration Fan 41A', system: 'HVAC', type: 'Fan', discipline: 'mechanical', safety: 'SR', crit: 2, train: 'A', location: "Control Bldg · El. 70' · HVAC Equipment Room", mfr: 'Pellston Air', model: 'Centrifugal, 4,000 cfm w/ HEPA + charcoal', ts: 'ts_3_7_10', hours: 4_820 },
  { key: 'crefs-41b', tag: '1-HVAC-F-41B', name: 'CR Emergency Filtration Fan 41B', system: 'HVAC', type: 'Fan', discipline: 'mechanical', safety: 'SR', crit: 2, train: 'B', location: "Control Bldg · El. 70' · HVAC Equipment Room", mfr: 'Pellston Air', model: 'Centrifugal, 4,000 cfm w/ HEPA + charcoal', ts: 'ts_3_7_10', hours: 4_655 },
  { key: 'cr-chiller', tag: '1-HVAC-CH-1', name: 'Control Room Chiller 1', system: 'HVAC', type: 'Chiller', discipline: 'mechanical', safety: 'AQ', crit: 2, location: "Control Bldg · El. 70' · Chiller Room", mfr: 'Pellston Air', model: 'Screw chiller, 120 ton' },
  // FW
  { key: 'cd-p-1a', tag: '1-CD-P-1A', name: 'Condensate Pump 1A', system: 'FW', type: 'Pump', discipline: 'mechanical', safety: 'NSR', crit: 2, location: "Turbine Bldg · El. 0' · Condenser pit", mfr: 'Westfield Pump Co.', model: 'VCP-20 can-type', hours: 88_402 },
  { key: 'fw-p-1a', tag: '1-FW-P-1A', name: 'Main Feedwater Pump 1A', system: 'FW', type: 'Pump', discipline: 'mechanical', safety: 'NSR', crit: 1, location: "Turbine Bldg · El. 30' · Feed pump bay", mfr: 'Westfield Pump Co.', model: 'BB5 barrel, turbine-driven', hours: 91_230 },
  // IA
  { key: 'ia-c-1', tag: '0-IA-C-1', name: 'Instrument Air Compressor 1', system: 'IA', type: 'Compressor', discipline: 'mechanical', safety: 'NSR', crit: 2, location: "Turbine Bldg · El. 10' · Compressor Room", mfr: 'Harlan Compression', model: 'Oil-free rotary screw, 1,200 scfm', hours: 31_975 },
  { key: 'ia-c-2', tag: '0-IA-C-2', name: 'Instrument Air Compressor 2', system: 'IA', type: 'Compressor', discipline: 'mechanical', safety: 'NSR', crit: 2, location: "Turbine Bldg · El. 10' · Compressor Room", mfr: 'Harlan Compression', model: 'Oil-free rotary screw, 1,200 scfm', hours: 29_410 },
  { key: 'ia-dry-1', tag: '0-IA-DRY-1', name: 'Instrument Air Dryer 1', system: 'IA', type: 'Air dryer', discipline: 'mechanical', safety: 'NSR', crit: 3, location: "Turbine Bldg · El. 10' · Compressor Room", mfr: 'Harlan Compression', model: 'Heatless twin-tower desiccant' },
  // FP
  { key: 'fp-p-1', tag: '0-FP-P-1', name: 'Electric Fire Pump', system: 'FP', type: 'Pump', discipline: 'mechanical', safety: 'AQ', crit: 2, location: 'Fire Pump House', mfr: 'Westfield Pump Co.', model: 'Split-case 2,500 gpm UL-listed' },
  { key: 'fp-p-2', tag: '0-FP-P-2', name: 'Diesel Fire Pump', system: 'FP', type: 'Pump', discipline: 'mechanical', safety: 'AQ', crit: 2, location: 'Fire Pump House', mfr: 'Tamarack Diesel', model: 'Split-case 2,500 gpm, diesel driver', hours: 1_212 },
  // MG
  { key: 'main-xfmr', tag: '1-MG-XFMR-1', name: 'Main Step-Up Transformer', system: 'MG', type: 'Transformer', discipline: 'electrical', safety: 'NSR', crit: 1, location: 'Transformer Yard', mfr: 'Carrow Electric', model: '1,300 MVA, 22/345 kV, ODAF' },
  { key: 'uat', tag: '1-MG-XFMR-1X', name: 'Unit Auxiliary Transformer', system: 'MG', type: 'Transformer', discipline: 'electrical', safety: 'NSR', crit: 1, location: 'Transformer Yard', mfr: 'Carrow Electric', model: '60 MVA, 22/4.16 kV' },
  { key: 'main-gen', tag: '1-MG-GEN-1', name: 'Main Generator', system: 'MG', type: 'Generator', discipline: 'electrical', safety: 'NSR', crit: 1, location: "Turbine Bldg · El. 50' · Turbine deck", mfr: 'Carrow Electric', model: '1,280 MVA hydrogen-cooled' },
];

export interface PartSeed {
  key: string;
  code: string;
  description: string;
  mfrPart: string;
  quality: 'Q' | 'NQ';
  bin: string;
  onHand: number;
  reorder: number;
  max: number;
  cost: number;
  lead: number;
  critical?: boolean;
}

export const PARTS: PartSeed[] = [
  { key: 'rhr-seal', code: 'SC-104411', description: 'Mechanical seal cartridge, RHR pump', mfrPart: 'WPC-MS-1214', quality: 'Q', bin: 'W1-A-03-2', onHand: 2, reorder: 1, max: 2, cost: 1_840_000, lead: 140, critical: true },
  { key: 'bearing-7318', code: 'SC-104502', description: 'Bearing, angular contact, 7318 BECBM pair', mfrPart: '7318-BECBM-DB', quality: 'Q', bin: 'W1-B-11-4', onHand: 3, reorder: 2, max: 6, cost: 186_000, lead: 45 },
  { key: 'bearing-6315', code: 'SC-104507', description: 'Bearing, deep groove, 6315 C3 (pump motor)', mfrPart: '6315-C3', quality: 'Q', bin: 'W1-B-11-6', onHand: 4, reorder: 2, max: 8, cost: 41_500, lead: 30 },
  { key: 'injector', code: 'SC-201188', description: 'Fuel injector assembly, EDG', mfrPart: 'TD-20V-INJ-04', quality: 'Q', bin: 'W2-D-02-1', onHand: 2, reorder: 2, max: 6, cost: 742_000, lead: 90, critical: true },
  { key: 'head-gasket', code: 'SC-201203', description: 'Gasket set, EDG cylinder head', mfrPart: 'TD-20V-GSK-HD', quality: 'Q', bin: 'W2-D-02-3', onHand: 8, reorder: 4, max: 12, cost: 38_900, lead: 60 },
  { key: 'edg-filter', code: 'SC-201245', description: 'Lube oil filter element, EDG', mfrPart: 'TD-LOF-220', quality: 'Q', bin: 'W2-D-04-1', onHand: 14, reorder: 8, max: 24, cost: 12_400, lead: 30 },
  { key: 'edg-fuel-filter', code: 'SC-201246', description: 'Fuel oil filter element, EDG', mfrPart: 'TD-FOF-118', quality: 'Q', bin: 'W2-D-04-2', onHand: 16, reorder: 8, max: 24, cost: 9_800, lead: 30 },
  { key: 'packing-sw', code: 'SC-104620', description: 'Packing set, braided graphite, SW pump', mfrPart: 'GP-1.0-SET', quality: 'Q', bin: 'W1-C-05-2', onHand: 6, reorder: 4, max: 12, cost: 22_000, lead: 21 },
  { key: 'torque-switch', code: 'SC-301877', description: 'Torque switch assembly, SMB-1 MOV actuator', mfrPart: 'SMB1-TS-2', quality: 'Q', bin: 'W3-A-08-1', onHand: 2, reorder: 2, max: 4, cost: 154_000, lead: 75 },
  { key: 'limit-switch', code: 'SC-301880', description: 'Limit switch rotor, SMB-1 MOV actuator', mfrPart: 'SMB1-LS-4R', quality: 'Q', bin: 'W3-A-08-2', onHand: 5, reorder: 2, max: 6, cost: 61_200, lead: 75 },
  { key: 'battery-cell', code: 'SC-302140', description: 'Battery cell, 125 VDC lead-calcium (1E)', mfrPart: 'RPC-1800-LC', quality: 'Q', bin: 'W3-F-01-1', onHand: 3, reorder: 2, max: 4, cost: 465_000, lead: 120, critical: true },
  { key: 'pt-1e', code: 'SC-302311', description: 'Pressure transmitter, 0–3,000 psig, 1E qualified', mfrPart: 'LUM-PT1E-3000', quality: 'Q', bin: 'W3-C-02-1', onHand: 1, reorder: 1, max: 2, cost: 1_210_000, lead: 180, critical: true },
  { key: 'relay-51', code: 'SC-302402', description: 'Relay, protective overcurrent 50/51 (1E)', mfrPart: 'CE-OC51-1E', quality: 'Q', bin: 'W3-C-06-3', onHand: 3, reorder: 2, max: 4, cost: 288_000, lead: 90 },
  { key: 'spring-motor', code: 'SC-302455', description: 'Charging spring motor, VCB-5 breaker', mfrPart: 'CE-VCB5-CSM', quality: 'Q', bin: 'W3-C-07-1', onHand: 1, reorder: 1, max: 3, cost: 97_500, lead: 60 },
  { key: 'contact-lube', code: 'SC-302470', description: 'Contact lubricant, breaker (Q-dedicated)', mfrPart: 'CE-LUB-7', quality: 'Q', bin: 'W3-C-07-4', onHand: 12, reorder: 4, max: 20, cost: 4_300, lead: 14 },
  { key: 'hepa', code: 'SC-402010', description: 'HEPA filter bank, CREFS (24×24×11.5, 1E)', mfrPart: 'PA-HEPA-2424', quality: 'Q', bin: 'W4-H-01-1', onHand: 4, reorder: 4, max: 8, cost: 162_000, lead: 60 },
  { key: 'charcoal', code: 'SC-402015', description: 'Charcoal adsorber tray, CREFS', mfrPart: 'PA-CHAR-4IN', quality: 'Q', bin: 'W4-H-01-2', onHand: 2, reorder: 2, max: 6, cost: 238_000, lead: 90 },
  { key: 'fan-belt', code: 'SC-402030', description: 'V-belt set (matched), CREFS fan', mfrPart: 'PA-BX86-3', quality: 'Q', bin: 'W4-H-02-1', onHand: 4, reorder: 2, max: 6, cost: 8_600, lead: 21 },
  { key: 'ia-filter', code: 'SC-501101', description: 'Air compressor intake filter element', mfrPart: 'HC-AIF-1200', quality: 'NQ', bin: 'W5-A-01-1', onHand: 6, reorder: 4, max: 12, cost: 21_500, lead: 14 },
  { key: 'ia-unloader', code: 'SC-501120', description: 'Unloader valve kit, rotary screw compressor', mfrPart: 'HC-ULV-KIT', quality: 'NQ', bin: 'W5-A-02-1', onHand: 1, reorder: 1, max: 2, cost: 93_000, lead: 28 },
  { key: 'desiccant', code: 'SC-501140', description: 'Desiccant, activated alumina, 50 lb', mfrPart: 'AA-50', quality: 'NQ', bin: 'W5-B-01-1', onHand: 12, reorder: 8, max: 24, cost: 18_900, lead: 14 },
  { key: 'cd-seal', code: 'SC-501210', description: 'Mechanical seal, condensate pump', mfrPart: 'WPC-MS-20C', quality: 'NQ', bin: 'W5-C-04-1', onHand: 1, reorder: 1, max: 2, cost: 612_000, lead: 90 },
  { key: 'dga-kit', code: 'SC-501300', description: 'Transformer oil sample kit (DGA)', mfrPart: 'DGA-SYR-3', quality: 'NQ', bin: 'W5-E-01-1', onHand: 10, reorder: 6, max: 20, cost: 3_200, lead: 7 },
  { key: 'xfmr-fan', code: 'SC-501320', description: 'Cooling fan motor, transformer radiator bank', mfrPart: 'CE-RF-3HP', quality: 'NQ', bin: 'W5-E-02-1', onHand: 3, reorder: 2, max: 4, cost: 74_000, lead: 35 },
  { key: 'fp-packing', code: 'SC-501402', description: 'Packing set, fire pump (UL)', mfrPart: 'FPP-0.75', quality: 'NQ', bin: 'W5-F-01-1', onHand: 4, reorder: 2, max: 6, cost: 9_200, lead: 14 },
  { key: 'gen-brush', code: 'SC-501510', description: 'Collector brush set, main generator', mfrPart: 'CE-GBR-48', quality: 'NQ', bin: 'W5-G-01-1', onHand: 48, reorder: 24, max: 96, cost: 6_700, lead: 30 },
  { key: 'r134a', code: 'SC-501620', description: 'Refrigerant R-134a, 30 lb cylinder', mfrPart: 'R134A-30', quality: 'NQ', bin: 'W5-H-03-1', onHand: 3, reorder: 2, max: 6, cost: 31_000, lead: 7 },
  { key: 'grease', code: 'SC-501700', description: 'Grease, polyurea EP2, 14 oz', mfrPart: 'PU-EP2-14', quality: 'NQ', bin: 'W5-J-01-1', onHand: 60, reorder: 24, max: 120, cost: 1_150, lead: 7 },
];

/** A plan step with a typical value, so the seeded history records believable readings. */
export type SeedStep = PlanStep & { typical?: number; spread?: number };

export interface PlanSeed {
  key: string;
  equipment: string;
  title: string;
  type: 'PM' | 'PDM' | 'ST';
  sr?: string;
  days?: number;
  hours?: number;
  lead?: number;
  /** Calendar plans: days since last performed. Meter plans: run hours since last performed. */
  lastAgo: number;
  estHours: number;
  oos?: boolean;
  steps: SeedStep[];
  /** History completions to generate (defaults to as many as fit in 24 months). */
  historyCap?: number;
}

const r = (text: string, unit: string, min: number | undefined, max: number | undefined, typical: number, spread: number): SeedStep => ({ kind: 'reading', text, unit, min, max, typical, spread });
const s = (text: string): SeedStep => ({ kind: 'step', text });
const qc = (text: string): SeedStep => ({ kind: 'qc_hold', text });
const pmt = (text: string, unit?: string, min?: number, max?: number, typical?: number, spread?: number): SeedStep => ({ kind: 'pmt', text, unit, min, max, typical, spread });

const pumpIst = (name: string, dpMin: number, dpMax: number, dpTyp: number): SeedStep[] => [
  s(`Verify ${name} aligned for recirculation test per OP lineup; install calibrated M&TE`),
  r('Pump differential pressure at reference flow', 'psid', dpMin, dpMax, dpTyp, (dpMax - dpMin) / 6),
  r('Pump inboard bearing vibration (overall velocity)', 'in/s', undefined, 0.325, 0.12, 0.03),
  r('Pump outboard bearing vibration (overall velocity)', 'in/s', undefined, 0.325, 0.11, 0.03),
  s('Restore system lineup; remove M&TE; independent verification of valve positions'),
];

const vibRoute = (name: string): SeedStep[] => [
  s(`Collect vibration spectra on ${name} at all route points (motor and pump bearings)`),
  r('Motor outboard bearing vibration', 'in/s', undefined, 0.3, 0.1, 0.025),
  r('Pump inboard bearing vibration', 'in/s', undefined, 0.3, 0.12, 0.025),
  r('Pump inboard bearing temperature', '°F', undefined, 180, 128, 6),
  s('Upload route data; flag any spectral changes to the system engineer'),
];

const motorPm: SeedStep[] = [
  s('Verify clearance hung; perform zero-energy check at motor terminal box'),
  r('Motor insulation resistance, 1 min at 5 kVdc (temperature corrected)', 'MΩ', 100, undefined, 2400, 600),
  r('Polarization index (10 min / 1 min)', '', 2, undefined, 3.4, 0.4),
  s('Grease motor bearings per lubrication chart; purge old grease'),
  qc('QC verify megger M&TE calibration and terminal re-termination torque'),
  pmt('Run motor uncoupled 15 min; check rotation, amps, and bearing temperature', '°F', undefined, 180, 135, 8),
];

export const PLANS: PlanSeed[] = [
  // EDG
  {
    key: 'edg-1a-monthly', equipment: 'edg-1a', title: 'EDG 1A monthly start and load test', type: 'ST', sr: 'SR 3.8.1.2 / 3.8.1.3', days: 31, lead: 7, lastAgo: 26, estHours: 6,
    steps: [
      s('Verify EDG 1A in standby lineup; record jacket water and lube oil keep-warm temperatures'),
      r('Start to rated speed and voltage', 's', undefined, 10, 8.2, 0.4),
      r('Steady-state voltage', 'V', 3740, 4580, 4160, 30),
      r('Steady-state frequency', 'Hz', 58.8, 61.2, 60, 0.08),
      r('Loaded run: real power for ≥ 60 min', 'kW', 4000, 4400, 4200, 60),
      r('Highest cylinder exhaust temperature deviation from bank average', '°F', undefined, 75, 28, 8),
      s('Unload, cool down and restore standby lineup per OP-EDG-01'),
    ],
  },
  {
    key: 'edg-1b-monthly', equipment: 'edg-1b', title: 'EDG 1B monthly start and load test', type: 'ST', sr: 'SR 3.8.1.2 / 3.8.1.3', days: 31, lead: 7, lastAgo: 3, estHours: 6,
    steps: [
      s('Verify EDG 1B in standby lineup; record jacket water and lube oil keep-warm temperatures'),
      r('Start to rated speed and voltage', 's', undefined, 10, 8.4, 0.4),
      r('Steady-state voltage', 'V', 3740, 4580, 4160, 30),
      r('Steady-state frequency', 'Hz', 58.8, 61.2, 60, 0.08),
      r('Loaded run: real power for ≥ 60 min', 'kW', 4000, 4400, 4200, 60),
      r('Highest cylinder exhaust temperature deviation from bank average', '°F', undefined, 75, 31, 8),
      s('Unload, cool down and restore standby lineup per OP-EDG-01'),
    ],
  },
  {
    key: 'edg-1a-18mo', equipment: 'edg-1a', title: 'EDG 1A 18-month inspection and overhaul', type: 'PM', days: 549, lead: 21, lastAgo: 541, estHours: 96, oos: true, historyCap: 1,
    steps: [
      s('Verify clearance hung; bar engine over and inspect crankcase, liners and bearings'),
      r('Crankshaft deflection (max, any throw)', 'mils', undefined, 1.5, 0.6, 0.15),
      s('Replace lube oil and fuel oil filters; sample lube oil for analysis'),
      s('Inspect and adjust valve lash; inspect injectors (pop test any suspect)'),
      r('Governor oil level and actuator response', '%', 90, 110, 100, 3),
      qc('QC hold: verify FME closeout of crankcase before covers installed'),
      qc('QC hold: verify torque on main bearing caps and cylinder heads'),
      pmt('Start to rated speed and voltage', 's', undefined, 10, 8.1, 0.4),
      pmt('Full-load run 4 h at 6,800–7,000 kW', 'kW', 6800, 7000, 6900, 30),
    ],
  },
  {
    key: 'edg-1a-oil', equipment: 'edg-1a', title: 'EDG 1A lube oil analysis', type: 'PDM', days: 92, lead: 14, lastAgo: 60, estHours: 1,
    steps: [s('Draw lube oil sample from engine sample port during run'), r('Viscosity at 100 °C', 'cSt', 12.5, 16.3, 14.2, 0.4), r('Iron (wear metal)', 'ppm', undefined, 40, 9, 3), r('Fuel dilution', '%', undefined, 2, 0.4, 0.2)],
  },
  {
    key: 'edg-1b-filters', equipment: 'edg-1b', title: 'EDG 1B 500-hour fuel and lube filter change', type: 'PM', hours: 500, lastAgo: 486, estHours: 8, oos: true,
    steps: [s('Verify clearance hung; drain filter housings to approved container'), s('Replace lube oil filter elements (6) and fuel oil filter elements (4)'), qc('QC verify new element part numbers match Q-level receipt documentation'), pmt('Run engine 30 min; inspect filter housings for leaks', 'psid', undefined, 15, 6, 1.5)],
  },
  // RHR
  { key: 'rhr-1a-ist', equipment: 'rhr-p-1a', title: 'RHR Pump 1A quarterly inservice test', type: 'ST', sr: 'SR 3.5.2.4 / IST', days: 92, lead: 10, lastAgo: 89, estHours: 4, steps: pumpIst('RHR Pump 1A', 168, 196, 182) },
  { key: 'rhr-1b-ist', equipment: 'rhr-p-1b', title: 'RHR Pump 1B quarterly inservice test', type: 'ST', sr: 'SR 3.5.2.4 / IST', days: 92, lead: 10, lastAgo: 47, estHours: 4, steps: pumpIst('RHR Pump 1B', 168, 196, 181) },
  { key: 'rhr-1a-motor', equipment: 'rhr-p-1a', title: 'RHR Pump 1A motor electrical PM', type: 'PM', days: 731, lead: 21, lastAgo: 380, estHours: 14, oos: true, steps: motorPm },
  {
    key: 'mov-8701a-stroke', equipment: 'rhr-mov-8701a', title: 'MOV 8701A stroke time test', type: 'ST', sr: 'SR 3.5.2.2 / IST', days: 92, lead: 10, lastAgo: 33, estHours: 2,
    steps: [s('Coordinate with control room; stroke valve from main control board'), r('Stroke time, close', 's', undefined, 20, 14.6, 0.4), r('Stroke time, open', 's', undefined, 20, 14.9, 0.4), s('Verify position indication on MCB and local')],
  },
  {
    key: 'mov-8701b-stroke', equipment: 'rhr-mov-8701b', title: 'MOV 8701B stroke time test', type: 'ST', sr: 'SR 3.5.2.2 / IST', days: 92, lead: 10, lastAgo: 78, estHours: 2,
    steps: [s('Coordinate with control room; stroke valve from main control board'), r('Stroke time, close', 's', undefined, 20, 15.1, 0.4), r('Stroke time, open', 's', undefined, 20, 15.3, 0.4), s('Verify position indication on MCB and local')],
  },
  // CCW
  { key: 'ccw-1a-vib', equipment: 'ccw-p-1a', title: 'CCW Pump 1A vibration route', type: 'PDM', days: 31, lead: 7, lastAgo: 12, estHours: 1, steps: vibRoute('CCW Pump 1A') },
  { key: 'ccw-1b-vib', equipment: 'ccw-p-1b', title: 'CCW Pump 1B vibration route', type: 'PDM', days: 31, lead: 7, lastAgo: 4, estHours: 1, steps: vibRoute('CCW Pump 1B') },
  { key: 'ccw-1a-ist', equipment: 'ccw-p-1a', title: 'CCW Pump 1A quarterly inservice test', type: 'ST', sr: 'IST (ASME OM)', days: 92, lead: 10, lastAgo: 52, estHours: 3, steps: pumpIst('CCW Pump 1A', 92, 108, 100) },
  {
    key: 'ccw-hx-clean', equipment: 'ccw-hx-1a', title: 'CCW HX 1A tube cleaning and eddy current', type: 'PM', days: 731, lead: 30, lastAgo: 300, estHours: 60, oos: true, historyCap: 1,
    steps: [s('Verify clearance hung; drain and open channel heads'), s('Hydrolance tubes; inspect tubesheet for erosion'), r('Tubes plugged (cumulative)', '%', undefined, 8, 3.1, 0.2), qc('QC hold: FME closeout before channel heads installed'), pmt('Return to service; record heat exchanger ΔT at design flow', '°F', 18, 26, 22, 1)],
  },
  // SW
  { key: 'sw-1a-ist', equipment: 'sw-p-1a', title: 'SW Pump 1A quarterly inservice test', type: 'ST', sr: 'IST (ASME OM)', days: 92, lead: 10, lastAgo: 40, estHours: 3, steps: pumpIst('SW Pump 1A', 61, 73, 67) },
  { key: 'sw-1b-ist', equipment: 'sw-p-1b', title: 'SW Pump 1B quarterly inservice test', type: 'ST', sr: 'IST (ASME OM)', days: 92, lead: 10, lastAgo: 70, estHours: 3, steps: pumpIst('SW Pump 1B', 61, 73, 66) },
  {
    key: 'sw-str-backwash', equipment: 'sw-str-1a', title: 'SW strainer 1A backwash and inspection', type: 'PM', days: 92, lead: 10, lastAgo: 118, estHours: 4,
    steps: [s('Initiate manual backwash; observe backwash cycle complete'), r('Strainer differential pressure after backwash', 'psid', undefined, 5, 1.8, 0.4), s('Inspect basket for biofouling (zebra mussel) and debris')],
  },
  // AFW
  { key: 'afw-2a-ist', equipment: 'afw-p-2a', title: 'MD AFW Pump 2A quarterly inservice test', type: 'ST', sr: 'SR 3.7.5.2', days: 92, lead: 10, lastAgo: 58, estHours: 4, steps: pumpIst('MD AFW Pump 2A', 1290, 1430, 1360) },
  {
    key: 'tdafw-ist', equipment: 'afw-p-1', title: 'TD AFW Pump quarterly inservice test', type: 'ST', sr: 'SR 3.7.5.2', days: 92, lead: 10, lastAgo: 104, estHours: 6,
    steps: [
      s('Warm steam supply lines; verify trip-and-throttle valve reset'),
      r('Turbine speed at rated', 'rpm', 3900, 4100, 4010, 15),
      r('Pump developed head at reference flow', 'psid', 1350, 1500, 1420, 15),
      r('Turbine outboard bearing vibration', 'in/s', undefined, 0.325, 0.14, 0.03),
      s('Shut down; restore standby lineup; verify governor in auto'),
    ],
  },
  // EPS
  {
    key: 'bat-1a-weekly', equipment: 'bat-1a', title: 'Battery 1A weekly pilot cell check', type: 'ST', sr: 'SR 3.8.4.1 / 3.8.6.1', days: 7, lead: 2, lastAgo: 6, estHours: 1, historyCap: 30,
    steps: [r('Battery terminal float voltage', 'V', 129, 137, 132.6, 0.3), r('Pilot cell voltage', 'V', 2.13, undefined, 2.21, 0.01), r('Pilot cell specific gravity (corrected)', 'SG', 1.195, undefined, 1.212, 0.003), s('Verify electrolyte level between marks in all cells')],
  },
  {
    key: 'bat-1b-weekly', equipment: 'bat-1b', title: 'Battery 1B weekly pilot cell check', type: 'ST', sr: 'SR 3.8.4.1 / 3.8.6.1', days: 7, lead: 2, lastAgo: 2, estHours: 1, historyCap: 30,
    steps: [r('Battery terminal float voltage', 'V', 129, 137, 132.4, 0.3), r('Pilot cell voltage', 'V', 2.13, undefined, 2.2, 0.01), r('Pilot cell specific gravity (corrected)', 'SG', 1.195, undefined, 1.21, 0.003), s('Verify electrolyte level between marks in all cells')],
  },
  {
    key: 'bat-1a-quarterly', equipment: 'bat-1a', title: 'Battery 1A quarterly connection resistance', type: 'ST', sr: 'SR 3.8.6.2', days: 92, lead: 10, lastAgo: 30, estHours: 4,
    steps: [r('Highest inter-cell connection resistance', 'µΩ', undefined, 150, 62, 10), r('Lowest individual cell voltage', 'V', 2.13, undefined, 2.19, 0.01), s('Inspect cells, racks and connections for corrosion and cracks')],
  },
  {
    key: 'bkr-1a0103-pm', equipment: 'bkr-1a0103', title: 'Breaker 1A01-03 overhaul and timing test', type: 'PM', days: 731, lead: 21, lastAgo: 700, estHours: 12, oos: true, historyCap: 1,
    steps: [
      s('Rack breaker out to test position; verify zero energy; remove to shop'),
      s('Clean and inspect primary disconnects; lubricate mechanism with Q-dedicated lubricant'),
      r('Close time', 'ms', undefined, 83, 61, 3),
      r('Trip time', 'ms', undefined, 50, 34, 2),
      r('Contact resistance, highest pole', 'µΩ', undefined, 100, 41, 5),
      r('Insulation resistance, phase to ground', 'MΩ', 1000, undefined, 18000, 4000),
      qc('QC hold: verify timing test M&TE and as-left data'),
      pmt('Rack in; cycle breaker 3× from control switch; verify indication and spring charge'),
    ],
  },
  {
    key: 'swgr-1a01-ir', equipment: 'swgr-1a01', title: 'Bus 1A01 infrared thermography', type: 'PDM', days: 184, lead: 14, lastAgo: 120, estHours: 2,
    steps: [s('Scan cubicles through IR windows under normal load'), r('Highest temperature rise over ambient (any connection)', '°C', undefined, 15, 4, 1.5)],
  },
  {
    key: 'chg-1a-pm', equipment: 'chg-1a', title: 'Battery Charger 1A annual PM', type: 'PM', days: 366, lead: 21, lastAgo: 200, estHours: 6,
    steps: [s('Inspect, clean and torque-check terminations'), r('Output ripple voltage', 'mV', undefined, 500, 180, 30), r('Current limit setting', 'A', 440, 460, 450, 2), qc('QC verify relay calibration stickers current')],
  },
  // RPS
  {
    key: 'pt-455-cal', equipment: 'pt-455', title: 'PT-455 channel calibration (Ch I)', type: 'ST', sr: 'SR 3.3.1.10', days: 549, lead: 21, lastAgo: 300, estHours: 6, historyCap: 1,
    steps: [
      s('Place Ch I in trip per OP; install calibrated deadweight tester'),
      r('As-found output at 1,700 psig input', 'psig', 1690, 1710, 1700, 2),
      r('As-found output at 2,235 psig input', 'psig', 2225, 2245, 2235, 2),
      r('As-found output at 2,385 psig input', 'psig', 2375, 2395, 2385, 2),
      s('Adjust zero and span if any as-found point is outside the as-left band'),
      qc('QC hold: verify M&TE calibration current and as-left data recorded'),
      pmt('Restore channel; verify indication agrees with other channels', 'psig', undefined, 15, 4, 2),
    ],
  },
  {
    key: 'pt-456-cal', equipment: 'pt-456', title: 'PT-456 channel calibration (Ch II)', type: 'ST', sr: 'SR 3.3.1.10', days: 549, lead: 21, lastAgo: 535, estHours: 6, historyCap: 1,
    steps: [
      s('Place Ch II in trip per OP; install calibrated deadweight tester'),
      r('As-found output at 1,700 psig input', 'psig', 1690, 1710, 1701, 2),
      r('As-found output at 2,235 psig input', 'psig', 2225, 2245, 2236, 2),
      r('As-found output at 2,385 psig input', 'psig', 2375, 2395, 2386, 2),
      s('Adjust zero and span if any as-found point is outside the as-left band'),
      qc('QC hold: verify M&TE calibration current and as-left data recorded'),
      pmt('Restore channel; verify indication agrees with other channels', 'psig', undefined, 15, 4, 2),
    ],
  },
  {
    key: 'pt-455-cot', equipment: 'pt-455', title: 'PT-455 channel operational test (Ch I)', type: 'ST', sr: 'SR 3.3.1.7', days: 92, lead: 10, lastAgo: 84, estHours: 3,
    steps: [s('Place Ch I bistables in test; inject test signal'), r('High pressure reactor trip bistable setpoint', 'psig', undefined, 2385, 2379, 1.5), r('Low pressure reactor trip bistable setpoint', 'psig', 1865, undefined, 1871, 1.5), s('Restore channel; verify bistable status lights clear')],
  },
  // HVAC
  {
    key: 'crefs-41a-run', equipment: 'crefs-41a', title: 'CREFS Train A monthly run', type: 'ST', sr: 'SR 3.7.10.1', days: 31, lead: 7, lastAgo: 22, estHours: 1,
    steps: [s('Start CREFS Train A from MCB with heaters energized'), r('Continuous run time with heaters on', 'min', 15, undefined, 16, 0.4), r('Filter train flow', 'cfm', 3600, 4400, 4010, 40)],
  },
  {
    key: 'crefs-41b-run', equipment: 'crefs-41b', title: 'CREFS Train B monthly run', type: 'ST', sr: 'SR 3.7.10.1', days: 31, lead: 7, lastAgo: 9, estHours: 1,
    steps: [s('Start CREFS Train B from MCB with heaters energized'), r('Continuous run time with heaters on', 'min', 15, undefined, 16, 0.4), r('Filter train flow', 'cfm', 3600, 4400, 3990, 40)],
  },
  {
    key: 'crefs-41b-filters', equipment: 'crefs-41b', title: 'CREFS Train B HEPA and charcoal in-place tests', type: 'ST', sr: 'SR 3.7.10.2', days: 731, lead: 30, lastAgo: 410, estHours: 10, historyCap: 1,
    steps: [r('HEPA in-place DOP penetration', '%', undefined, 0.05, 0.012, 0.004), r('Charcoal adsorber bypass leakage', '%', undefined, 0.05, 0.015, 0.004), s('Pull charcoal sample canister for lab methyl iodide test')],
  },
  {
    key: 'chiller-pm', equipment: 'cr-chiller', title: 'Control Room Chiller annual PM', type: 'PM', days: 366, lead: 21, lastAgo: 330, estHours: 12,
    steps: [s('Inspect condenser and evaporator; clean condenser tubes'), r('Compressor oil acid test', 'TAN', undefined, 0.1, 0.03, 0.01), r('Refrigerant charge (sight glass / superheat)', '°F SH', 8, 14, 11, 1), s('Test safeties: low pressure, high pressure, low oil')],
  },
  // FW, IA, FP, MG
  { key: 'cd-1a-vib', equipment: 'cd-p-1a', title: 'Condensate Pump 1A vibration route', type: 'PDM', days: 92, lead: 10, lastAgo: 50, estHours: 1, steps: vibRoute('Condensate Pump 1A') },
  {
    key: 'ia-c-1-service', equipment: 'ia-c-1', title: 'IA Compressor 1 4,000-hour service', type: 'PM', hours: 4000, lastAgo: 3710, estHours: 10, oos: true,
    steps: [s('Replace intake filter and oil-free element seals'), s('Inspect unloader valve and check valves'), r('Discharge pressure at full load', 'psig', 120, 130, 125, 1), pmt('Load test 30 min; verify loaded/unloaded cycling', 'psig', 120, 130, 125, 1)],
  },
  {
    key: 'ia-c-2-service', equipment: 'ia-c-2', title: 'IA Compressor 2 4,000-hour service', type: 'PM', hours: 4000, lastAgo: 1200, estHours: 10, oos: true,
    steps: [s('Replace intake filter and oil-free element seals'), s('Inspect unloader valve and check valves'), r('Discharge pressure at full load', 'psig', 120, 130, 125, 1), pmt('Load test 30 min; verify loaded/unloaded cycling', 'psig', 120, 130, 125, 1)],
  },
  {
    key: 'ia-dryer', equipment: 'ia-dry-1', title: 'IA Dryer 1 desiccant replacement', type: 'PM', days: 366, lead: 21, lastAgo: 380, estHours: 8,
    steps: [s('Isolate and depressurize dryer towers'), s('Replace desiccant in both towers (12 bags)'), r('Outlet dew point after 4 h', '°F', undefined, -40, -52, 3)],
  },
  {
    key: 'fp-2-weekly', equipment: 'fp-p-2', title: 'Diesel fire pump weekly run', type: 'PM', days: 7, lead: 2, lastAgo: 5, estHours: 1, historyCap: 26,
    steps: [s('Start diesel fire pump from local panel; run 30 min'), r('Churn discharge pressure', 'psig', 140, 165, 152, 2), r('Engine coolant temperature', '°F', undefined, 205, 182, 4)],
  },
  {
    key: 'fp-1-annual', equipment: 'fp-p-1', title: 'Electric fire pump annual flow test', type: 'PM', days: 366, lead: 21, lastAgo: 150, estHours: 6,
    steps: [s('Set up flow test header and calibrated pitot'), r('Net pressure at 150% rated flow', 'psig', 65, undefined, 78, 2), r('Motor current at 150% flow', 'A', undefined, 312, 288, 4)],
  },
  {
    key: 'xfmr-dga', equipment: 'main-xfmr', title: 'Main transformer dissolved-gas analysis', type: 'PDM', days: 92, lead: 10, lastAgo: 75, estHours: 1,
    steps: [s('Draw oil sample from bottom drain valve into DGA syringes'), r('Acetylene (C₂H₂)', 'ppm', undefined, 2, 0.4, 0.2), r('Hydrogen (H₂)', 'ppm', undefined, 100, 34, 6), r('Combustible gas total (TDCG)', 'ppm', undefined, 720, 260, 30)],
  },
  {
    key: 'gen-brushes', equipment: 'main-gen', title: 'Main generator collector brush inspection', type: 'PM', days: 92, lead: 10, lastAgo: 88, estHours: 3,
    steps: [s('Inspect brush wear and spring tension on collector rings online'), r('Shortest brush length', 'in', 1.25, undefined, 1.9, 0.2), r('Collector ring temperature', '°C', undefined, 90, 64, 4)],
  },
];
