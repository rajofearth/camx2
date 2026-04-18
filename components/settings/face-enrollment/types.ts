export type ThreatLevel = "critical" | "high" | "medium" | "low";

export interface EnrollmentSubject {
  id: string;
  uid: string;
  name: string;
  aliasLine: string;
  threatLevel: ThreatLevel;
  confidence: number;
  heightCm: number;
  weightKg: number;
  crimeCategories: string[];
  imageUrl: string;
  imageAlt: string;
  watchlistCode: string;
  aliasesDetail: string;
  lastSeen: string;
}
